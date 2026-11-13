create extension if not exists pg_trgm with schema extensions;
create index if not exists freight_crm_company_search_trgm on public.freight_companies using gin ((lower(coalesce(company_name,'')||' '||coalesce(owner,'')||' '||coalesce(role,'')||' '||coalesce(region,'')||' '||coalesce(industry,'')||' '||coalesce(notes,'')||' '||coalesce(source_refs::text,'')||' '||coalesce(current_routes,'')||' '||coalesce(historical_routes::text,''))) extensions.gin_trgm_ops);
create index if not exists freight_crm_contact_search_trgm on public.freight_contacts using gin ((lower(coalesce(name,'')||' '||coalesce(value,''))) extensions.gin_trgm_ops);
CREATE OR REPLACE FUNCTION public.freight_crm_page(p_filters jsonb DEFAULT '{}'::jsonb, p_offset integer DEFAULT 0, p_limit integer DEFAULT 30, p_mode text DEFAULT 'page'::text, p_ids text[] DEFAULT NULL::text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
 SET jit TO 'off'
 SET work_mem TO '4MB'
 SET enable_nestloop TO 'on'
AS $function$
declare result jsonb; matched_ids text[];
begin
if p_mode in ('page','ids') and length(coalesce(p_filters->>'query',''))>=2 and (p_filters->>'query') !~ '[[:space:]]' then
 execute $candidate$ select coalesce(array_agg(id),'{}'::text[]) from (
 select c.id from public.freight_companies c where length(coalesce($1->>'query',''))>=2 and ($1->>'query') !~ '[[:space:]]' and lower(coalesce(c.company_name,'')||' '||coalesce(c.owner,'')||' '||coalesce(c.role,'')||' '||coalesce(c.region,'')||' '||coalesce(c.industry,'')||' '||coalesce(c.notes,'')||' '||coalesce(c.source_refs::text,'')||' '||coalesce(c.current_routes,'')||' '||coalesce(c.historical_routes::text,'')) like '%'||replace(replace(replace(lower($1->>'query'),chr(92),chr(92)||chr(92)),'%',chr(92)||'%'),'_',chr(92)||'_')||'%'
 union select c.company_id from public.freight_contacts c where length(coalesce($1->>'query',''))>=2 and ($1->>'query') !~ '[[:space:]]' and lower(coalesce(c.name,'')||' '||coalesce(c.value,'')) like '%'||replace(replace(replace(lower($1->>'query'),chr(92),chr(92)||chr(92)),'%',chr(92)||'%'),'_',chr(92)||'_')||'%'
) hits $candidate$ into matched_ids using p_filters;
 if p_ids is null then p_ids:=matched_ids; else select coalesce(array_agg(x),'{}'::text[]) into p_ids from unnest(p_ids)x where x=any(matched_ids); end if;
end if;
execute $pagequery$
with contact_first_seen as materialized (
 select company_id,channel,
 min(created_at at time zone 'Asia/Shanghai')::date added_date
 from public.freight_contacts
 where ($4='stats' or coalesce($1->>'contact_added_from','')<>'' or coalesce($1->>'contact_added_to','')<>'') and channel in ('邮箱','电话') and status<>'失效' and btrim(value)<>''
 group by company_id,channel,case when channel='邮箱' then lower(btrim(value)) else regexp_replace(value,'[^0-9+]','','g') end
), contact_days as materialized (
 select company_id,array_agg(distinct added_date order by added_date) contact_added_dates
 from contact_first_seen group by company_id
), checked_leads as not materialized (
 select id,exists(select 1 from jsonb_array_elements(source_evidence)e where e->>'contact_check'=public.freight_crm_clue_key(website,null,source_evidence)) checked from public.lead_discovery_leads
), checked_exhibitors as not materialized (
 select id,position('[contact-check:'||public.freight_crm_uri_component(public.freight_crm_clue_key(website,source_url,'[]'))||']' in notes)>0 checked from public.freight_exhibitors
), ca_rows as materialized (
 select c.company_id,count(*) n,bool_or(c.channel='邮箱') any_email,
 bool_or(c.channel='邮箱' and c.status<>'失效' and c.value<>'') email,
 bool_or(c.channel='电话' and c.status<>'失效' and c.value<>'') phone,
 bool_or(c.channel='邮箱' and c.status='有效' and c.email_allowed) verified,
 case when coalesce($1->>'query','')<>'' then string_agg(c.name||' '||c.value,' ') else null::text end search,
 case when $4='facets' or coalesce($1->>'group','')<>'' then
 (select array_agg(distinct g) from public.freight_contacts cg cross join lateral unnest(cg.mail_groups) g where cg.company_id=c.company_id and g is not null)
 else '{}'::text[] end groups
 from public.freight_contacts c where ($5 is null or c.company_id=any($5)) group by c.company_id
), base as materialized (
 select c.id,c.company_name,c.status,c.role,c.owner,c.industry,c.region,c.development_stage,c.is_key_customer,c.current_routes,c.historical_routes,c.updated_at,coalesce(cd.contact_added_dates,'{}'::date[]) contact_added_dates,
 public.freight_crm_stage(c.development_stage,c.status) stage,
 coalesce(ca.email,false) has_email,coalesce(ca.phone,false) has_phone,coalesce(ca.any_email,false) any_email,coalesce(ca.verified,false) verified,coalesce(ca.n,0) contact_count,ca.search contact_search,
 case when $4='facets' or coalesce($1->>'group','')<>'' then (select coalesce(array_agg(distinct g),'{}') from (
 select value #>> '{}' g from jsonb_array_elements(c.source_refs) where jsonb_typeof(value)='string' and (value #>> '{}')~'^[A-Z][A-Z0-9-]*-[0-9]{8}$'
 union select value->>'batch' from jsonb_array_elements(c.source_refs) where value ? 'batch'
 union select unnest(coalesce(ca.groups,'{}'))
 union select m[1] from regexp_matches(c.notes,'(?:^|\n)采集批次[：:]\s*([^\r\n]+)','g')m
 )s where g<>'' and g is not null) else '{}'::text[] end groups,
 c.source_refs,
 case when $4='facets' then false when coalesce(ca.email,false) and coalesce(ca.phone,false) then false when not (c.source_refs::text like '%"lead_id"%' or c.source_refs::text like '%"exhibitor_id"%') then false else (select count(*)>0 and bool_and(coalesce(case when r ? 'lead_id' then l.checked else e.checked end,false)) from jsonb_array_elements(c.source_refs)r left join checked_leads l on l.id=case when r->>'lead_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then (r->>'lead_id')::uuid end left join checked_exhibitors e on e.id=case when r->>'exhibitor_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then (r->>'exhibitor_id')::uuid end where jsonb_typeof(r)='object' and (r ? 'lead_id' or r ? 'exhibitor_id')) end _lower_priority,
 case when $4='stats' or coalesce($1->>'due','')<>'' then (select next_date from public.freight_followups f where f.company_id=c.id order by created_at desc,id desc limit 1) else null::date end next_date,
 case when coalesce($1->>'query','')<>'' then c.notes else '' end search_notes,c.source_refs search_refs
 from public.freight_companies c left join contact_days cd on cd.company_id=c.id left join ca_rows ca on ca.company_id=c.id
 where (coalesce($1->>'directory','')='' or (upper($1->>'directory')='ENF' and c.source_refs @? '$[*] ? (@.source like_regex "^ENF$" flag "i" || @.provider like_regex "^ENF$" flag "i" || @.original_sources[*] like_regex "^ENF$" flag "i" || @ like_regex "^ENF$" flag "i")') or (upper($1->>'directory')='WCA' and c.source_refs @? '$[*] ? (@.source like_regex "^WCA$" flag "i" || @.provider like_regex "^WCA$" flag "i" || @.original_sources[*] like_regex "^WCA$" flag "i" || @ like_regex "^WCA$" flag "i")') or (upper($1->>'directory')='WIFFA' and c.source_refs @? '$[*] ? (@.source like_regex "^WIFFA$" flag "i" || @.provider like_regex "^WIFFA$" flag "i" || @.original_sources[*] like_regex "^WIFFA$" flag "i" || @ like_regex "^WIFFA$" flag "i")')) and ($5 is null or c.id=any($5)) and (coalesce($1->>'role','')='' or c.role=$1->>'role')
 and (coalesce($1->>'query','')='' or position(lower($1->>'query') in lower(concat_ws(' ',c.company_name,c.owner,c.role,c.region,c.industry,c.notes,c.source_refs::text,c.current_routes,c.historical_routes::text,ca.search)))>0)
), filtered as materialized (
 select * from base b where
 (coalesce($1->>'contact_added_from','')='' and coalesce($1->>'contact_added_to','')='' or exists (
 select 1 from unnest(b.contact_added_dates)d where
 (coalesce($1->>'contact_added_from','')='' or d>=nullif($1->>'contact_added_from','')::date)
 and (coalesce($1->>'contact_added_to','')='' or d<=nullif($1->>'contact_added_to','')::date)))
 and
 (coalesce($1->>'stage','')='' or b.stage=$1->>'stage')
 and (coalesce($1->>'status','')='' or b.status=$1->>'status')
 and (coalesce($1->>'owner','')='' or b.owner=$1->>'owner')
 and (coalesce($1->>'region','')='' or position(lower($1->>'region') in lower(b.region))>0)
 and (coalesce($1->>'industry','')='' or position(lower($1->>'industry') in lower(b.industry))>0)
 and (coalesce($1->>'focus','')='' or ($1->>'focus'='key' and b.is_key_customer) or ($1->>'focus'='normal' and not b.is_key_customer))
 and (coalesce($1->>'group','')='' or ($1->>'group'='__ungrouped' and cardinality(b.groups)=0) or $1->>'group'=any(b.groups))
 and (coalesce($1->>'source','')='' or exists(select 1 from jsonb_array_elements(b.search_refs)r where $1->>'source'=case when coalesce(r->>'source',r->>'provider','')='landbridge' then 'Landbridge同行名录' when coalesce(r->>'source',r->>'provider','')='exhibition' then '展会展商' when coalesce(r->>'source',r->>'provider','')~*'openstreetmap|overture|google|map' then '地图获客' when coalesce(r->>'source',r->>'provider','')<>'' then '其他线索' else '历史/批次导入' end) or ($1->>'source'='手动新增' and jsonb_array_length(b.search_refs)=0))
 and (coalesce($1->>'contact','')='' or ($1->>'contact'='needs-contact' and not(b.has_email and b.has_phone)) or ($1->>'contact'='missing-email' and not b.has_email) or ($1->>'contact'='missing-phone' and not b.has_phone) or ($1->>'contact'='none' and b.contact_count=0) or ($1->>'contact'='email' and b.any_email) or ($1->>'contact'='verified-email' and b.verified))
 and (coalesce($1->>'priority','')='' or (not(b.has_email and b.has_phone) and (($1->>'priority'='checked' and b._lower_priority) or ($1->>'priority'='priority' and not b._lower_priority))))
 and (coalesce($1->>'due','')='' or ($1->>'due'='none' and b.next_date is null) or ($1->>'due'='due' and b.next_date<=(now() at time zone 'Asia/Shanghai')::date) or ($1->>'due'='overdue' and b.next_date<(now() at time zone 'Asia/Shanghai')::date) or ($1->>'due'='future' and b.next_date>(now() at time zone 'Asia/Shanghai')::date))
 and (coalesce($1->>'query','')='' or position(lower($1->>'query') in lower(concat_ws(' ',b.company_name,b.owner,b.role,b.region,b.industry,b.search_notes,b.search_refs::text,b.current_routes,b.historical_routes::text,b.contact_search)))>0)
), page_rows as materialized (
 select * from filtered order by _lower_priority,id limit least(greatest($3,1),500) offset greatest($2,0)
)
select case when $4='ids' then jsonb_build_object('ids',coalesce((select jsonb_agg(id order by _lower_priority,id) from filtered),'[]'),'total',(select count(*) from filtered))
when $4='facets' then jsonb_build_object('owners',(select coalesce(jsonb_agg(owner order by owner),'[]') from (select distinct owner from base where owner<>'')s),'groups',(select coalesce(jsonb_agg(jsonb_build_object('name',g,'count',n) order by g),'[]') from (select g,count(*) n from base cross join lateral unnest(groups)g group by g)s))
when $4='stats' then jsonb_build_object('contact_added_today',(select count(*) from base where (now() at time zone 'Asia/Shanghai')::date=any(contact_added_dates)),'total',(select count(*) from base),'pending',(select count(*) from base where status='待核实'),'key',(select count(*) from base where is_key_customer),'due',(select count(*) from base where next_date<=(now() at time zone 'Asia/Shanghai')::date),'needs',(select count(*) from base where not(has_email and has_phone)),'checked',(select count(*) from base where _lower_priority and not(has_email and has_phone)),'stages',(select coalesce(jsonb_object_agg(stage,n),'{}') from (select stage,count(*) n from base group by stage)s))
else jsonb_build_object('total',(select count(*) from filtered),'companies',coalesce((select jsonb_agg((case when $4 not in ('stats','facets','ids') and coalesce($1->>'contact_added_from','')='' and coalesce($1->>'contact_added_to','')='' then jsonb_set(to_jsonb(p),'{contact_added_dates}',to_jsonb(coalesce((select array_agg(distinct d.added_date order by d.added_date) from (select min(c.created_at at time zone 'Asia/Shanghai')::date added_date from public.freight_contacts c where c.company_id=p.id and c.channel in ('邮箱','电话') and c.status<>'失效' and btrim(c.value)<>'' group by c.company_id,c.channel,case when c.channel='邮箱' then lower(btrim(c.value)) else regexp_replace(c.value,'[^0-9+]','','g') end) d),'{}'::date[]))) else to_jsonb(p) end)-'search_notes'-'search_refs'-'contact_search'-'groups'-'stage'-'has_email'-'has_phone'-'any_email'-'verified'-'contact_count' order by _lower_priority,id) from page_rows p),'[]'),'followups',coalesce((select jsonb_agg(f) from (select distinct on (company_id) id,company_id,next_date,created_at from public.freight_followups where company_id in(select id from page_rows) order by company_id,created_at desc,id desc)f),'[]'),'contacts',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'company_id',c.company_id,'name',c.name,'channel',c.channel,'value',c.value,'status',c.status,'email_allowed',c.email_allowed,'mail_groups',c.mail_groups) order by c.id) from public.freight_contacts c where c.company_id in(select id from page_rows)),'[]')) end
$pagequery$ into result using p_filters,p_offset,p_limit,p_mode,p_ids;
return result;
end
$function$
;
