CREATE OR REPLACE FUNCTION public.freight_crm_page_before_enrichment(p_filters jsonb DEFAULT '{}'::jsonb, p_offset integer DEFAULT 0, p_limit integer DEFAULT 30, p_mode text DEFAULT 'page'::text, p_ids text[] DEFAULT NULL::text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
 SET jit TO 'off'
 SET work_mem TO '16MB'
AS $function$
declare
  result jsonb;
  is_default_page boolean;
begin
  is_default_page :=
    p_mode in ('page','ids')
    and p_ids is null
    and coalesce(p_filters->>'query','')=''
    and coalesce(p_filters->>'contact_added_from','')=''
    and coalesce(p_filters->>'contact_added_to','')=''
    and coalesce(p_filters->>'group','')=''
    and coalesce(p_filters->>'source','')=''
    and coalesce(p_filters->>'contact','') in ('','missing-email','missing-phone','email','verified-email','none','needs-contact')
    and coalesce(p_filters->>'priority','')=''
    and coalesce(p_filters->>'due','')='';

  if not is_default_page then
    return public.freight_crm_page_legacy(p_filters,p_offset,p_limit,p_mode,p_ids);
  end if;

  if p_mode='ids' or p_filters ?| array['directory','status','focus','stage','role','owner','region','industry'] or p_filters->>'contact' in ('missing-email','missing-phone','email','verified-email','none','needs-contact') then
    with emails as materialized (
      select company_id from public.freight_contacts
      where coalesce(p_filters->>'contact','')<>''
      group by company_id
      having case p_filters->>'contact'
      when 'missing-email' then bool_or(channel='邮箱' and status<>'失效' and value<>'')
      when 'missing-phone' then bool_or(channel='电话' and status<>'失效' and value<>'')
      when 'email' then bool_or(channel='邮箱')
      when 'verified-email' then bool_or(channel='邮箱' and status='有效' and email_allowed)
      when 'none' then true
      when 'needs-contact' then bool_or(channel='邮箱' and status<>'失效' and value<>'') and bool_or(channel='电话' and status<>'失效' and value<>'')
      end
    ), matches as (
      select c.id,c.created_at from public.freight_companies c
      left join emails e on e.company_id=c.id where (coalesce(p_filters->>'contact','')='' or (e.company_id is not null) = (p_filters->>'contact' in ('email','verified-email')))
      and (coalesce(p_filters->>'directory','')='' or (upper(p_filters->>'directory')='ENF' and c.source_refs @? '$[*] ? (@.source like_regex "^ENF$" flag "i" || @.provider like_regex "^ENF$" flag "i" || @.original_sources[*] like_regex "^ENF$" flag "i" || @ like_regex "^ENF$" flag "i")') or (upper(p_filters->>'directory')='WCA' and c.source_refs @? '$[*] ? (@.source like_regex "^WCA$" flag "i" || @.provider like_regex "^WCA$" flag "i" || @.original_sources[*] like_regex "^WCA$" flag "i" || @ like_regex "^WCA$" flag "i")') or (upper(p_filters->>'directory')='WIFFA' and c.source_refs @? '$[*] ? (@.source like_regex "^WIFFA$" flag "i" || @.provider like_regex "^WIFFA$" flag "i" || @.original_sources[*] like_regex "^WIFFA$" flag "i" || @ like_regex "^WIFFA$" flag "i")'))
      and (coalesce(p_filters->>'status','')='' or c.status=p_filters->>'status')
      and (coalesce(p_filters->>'stage','')='' or public.freight_crm_stage(c.development_stage,c.status)=p_filters->>'stage')
      and (coalesce(p_filters->>'role','')='' or c.role=p_filters->>'role')
      and (coalesce(p_filters->>'owner','')='' or c.owner=p_filters->>'owner')
      and (coalesce(p_filters->>'region','')='' or position(lower(p_filters->>'region') in lower(c.region))>0)
      and (coalesce(p_filters->>'industry','')='' or position(lower(p_filters->>'industry') in lower(c.industry))>0)
      and (coalesce(p_filters->>'focus','')='' or (p_filters->>'focus'='key' and c.is_key_customer) or (p_filters->>'focus'='normal' and not c.is_key_customer))
    )
    select case when p_mode='ids' then jsonb_build_object('total',count(*),'ids',coalesce(jsonb_agg(id order by created_at desc,id desc),'[]'))
      else jsonb_build_object('total',count(*),'ids',coalesce((select jsonb_agg(id order by created_at desc,id desc) from (select * from matches order by created_at desc,id desc limit least(greatest(p_limit,1),500) offset greatest(p_offset,0)) s),'[]')) end
    into result from matches;
    if p_mode='ids' then return result; end if;
  end if;
  with page_ids as materialized (
    select c.id
    from public.freight_companies c
    where result is null or (result->'ids') ? c.id
    order by c.created_at desc,c.id desc
    limit least(greatest(p_limit,1),500)
    offset case when result is null then greatest(p_offset,0) else 0 end
  ),
  contact_dates as materialized (
    select x.company_id,array_agg(distinct x.added_date order by x.added_date) contact_added_dates
    from (
      select c.company_id,
             min(c.created_at at time zone 'Asia/Shanghai')::date added_date
      from public.freight_contacts c
      where c.company_id in (select id from page_ids)
        and c.channel in ('邮箱','电话')
        and c.status<>'失效'
        and btrim(c.value)<>''
      group by c.company_id,c.channel,
        case when c.channel='邮箱'
          then lower(btrim(c.value))
          else regexp_replace(c.value,'[^0-9+]','','g')
        end
    ) x
    group by x.company_id
  ),
  page_rows as materialized (
    select c.id,c.company_name,c.status,c.role,c.owner,c.industry,c.region,
           c.development_stage,c.is_key_customer,c.current_routes,
           c.historical_routes,c.created_at,c.updated_at,
           coalesce(cd.contact_added_dates,'{}'::date[]) contact_added_dates,
           c.source_refs,false as _lower_priority,fu.next_date
    from page_ids p
    join public.freight_companies c on c.id=p.id
    left join contact_dates cd on cd.company_id=c.id
    left join lateral (
      select f.next_date
      from public.freight_followups f
      where f.company_id=c.id
      order by f.created_at desc,f.id desc
      limit 1
    ) fu on true
  )
  select jsonb_build_object(
    'total',coalesce((result->>'total')::bigint,(select count(*) from public.freight_companies)),
    'companies',coalesce((select jsonb_agg(to_jsonb(p) order by p.created_at desc,p.id desc) from page_rows p),'[]'::jsonb),
    'followups',coalesce((
      select jsonb_agg(to_jsonb(f) order by f.company_id)
      from (
        select distinct on (x.company_id) x.id,x.company_id,x.next_date,x.created_at
        from public.freight_followups x
        where x.company_id in (select id from page_ids)
        order by x.company_id,x.created_at desc,x.id desc
      ) f
    ),'[]'::jsonb),
    'contacts',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id',c.id,'company_id',c.company_id,'name',c.name,
          'channel',c.channel,'value',c.value,'status',c.status,
          'email_allowed',c.email_allowed,'mail_groups',c.mail_groups
        ) order by c.id
      )
      from public.freight_contacts c
      where c.company_id in (select id from page_ids)
    ),'[]'::jsonb)
  ) into result;

  return result;
end
$function$;


CREATE OR REPLACE FUNCTION public.freight_crm_page(p_filters jsonb DEFAULT '{}'::jsonb, p_offset integer DEFAULT 0, p_limit integer DEFAULT 30, p_mode text DEFAULT 'page'::text, p_ids text[] DEFAULT NULL::text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
 SET jit TO 'off'
AS $function$
declare filtered_total integer; result jsonb; matching text[]; state_filter text:=coalesce(p_filters->>'enrichment','');
begin
 if state_filter<>'' then
  if state_filter not in ('uncollected','running','collected','checked','failed','no_website') then raise exception '无效补全状态'; end if;
  with candidates as materialized (
   select c.id,c.created_at,c.source_refs from public.freight_companies c
   where (p_ids is null or c.id=any(p_ids))
     and (state_filter='no_website' or c.source_refs @? '$[*] ? (exists(@.lead_id) || exists(@.exhibitor_id))')
  ), refs as materialized (
   select c.id as company_id,r from candidates c
   cross join lateral jsonb_array_elements(c.source_refs) r
   where jsonb_typeof(r)='object' and r ?| array['lead_id','exhibitor_id']
  ), outcomes as (
 select refs.company_id, case
 when exists(select 1 from public.lead_enrich_jobs j where j.lead_id=l.id and j.status in ('queued','running')) then 'running'
 when l.enrichment_result_category='new_contacts' then 'collected'
 when l.enrichment_checked_at is not null and l.enrichment_result_category in ('no_new_contacts','already_checked') then 'checked'
 when l.enrichment_checked_at is not null then 'failed'
 when exists(select 1 from jsonb_array_elements(coalesce(l.source_evidence,'[]')) e where e->>'contact_check'=public.freight_crm_clue_key(l.website,null,l.source_evidence)) then 'checked'
 when l.website ~* '^https://' then 'uncollected'
 else 'no_website' end state
 from refs join public.lead_discovery_leads l on l.id=case when refs.r->>'lead_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then (refs.r->>'lead_id')::uuid end
 union all
 select refs.company_id, case
 when case when strpos(coalesce(e.notes,''),'[contact-check:')>0 then position('[contact-check:'||public.freight_crm_uri_component(public.freight_crm_clue_key(e.website,e.source_url,'[]'))||']' in coalesce(e.notes,''))>0 else false end then 'checked'
 when e.website ~* '^https://' then 'uncollected'
 else 'no_website' end
 from refs join public.freight_exhibitors e on e.id=case when refs.r->>'exhibitor_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then (refs.r->>'exhibitor_id')::uuid end
  ), ranked as (
   select company_id,min(array_position(array['running','uncollected','collected','failed','checked','no_website'],state)) as priority
   from outcomes group by company_id
  )
  select coalesce(array_agg(c.id order by c.created_at desc,c.id desc),'{}'::text[]) into matching
  from candidates c left join ranked on ranked.company_id=c.id
  where coalesce(priority,6)=array_position(array['running','uncollected','collected','failed','checked','no_website'],state_filter);
  if p_mode in ('page','ids') and not exists (
   select 1 from jsonb_each_text(p_filters-'enrichment') f where coalesce(f.value,'')<>''
  ) then
   filtered_total:=cardinality(matching);
   if p_mode='ids' then return jsonb_build_object('total',filtered_total,'ids',matching); end if;
   p_ids:=matching[greatest(p_offset,0)+1:greatest(p_offset,0)+least(greatest(p_limit,1),500)];
   p_offset:=0;
  else
   p_ids:=matching;
  end if;
 end if;
 result:=public.freight_crm_page_before_enrichment(p_filters-'enrichment',p_offset,p_limit,p_mode,p_ids);
 if filtered_total is not null then result:=jsonb_set(result,'{total}',to_jsonb(filtered_total)); end if;
 if p_mode='page' then
  select jsonb_set(result,'{companies}',coalesce(jsonb_agg(
   c||jsonb_build_object('source_refs',(select coalesce(jsonb_agg(case when jsonb_typeof(ref)='object' then ref||jsonb_build_object('_enrichment_state',public.freight_crm_enrichment_state(jsonb_build_array(ref))) else ref end),'[]') from jsonb_array_elements(coalesce(c->'source_refs','[]')) ref),
    '_enrichment_state',public.freight_crm_enrichment_state(c->'source_refs'),
    '_lower_priority',public.freight_crm_enrichment_state(c->'source_refs') in ('collected','checked','failed','running'))
   order by case when filtered_total is not null then array_position(p_ids,c->>'id') end,ord),'[]'::jsonb)) into result
  from jsonb_array_elements(coalesce(result->'companies','[]')) with ordinality x(c,ord);
 end if;
 return result;
end $function$
;
