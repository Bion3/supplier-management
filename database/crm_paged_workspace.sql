create or replace function public.freight_crm_directory_types(refs jsonb) returns text[] language sql immutable security invoker set search_path=public as $$
 select coalesce(array_agg(distinct v order by v),'{}') from (
 select upper(btrim(r #>> '{}')) v from jsonb_array_elements(refs)r where jsonb_typeof(r)='string'
 union all select upper(btrim(coalesce(r->>'source',''))) from jsonb_array_elements(refs)r where jsonb_typeof(r)='object'
 union all select upper(btrim(coalesce(r->>'provider',''))) from jsonb_array_elements(refs)r where jsonb_typeof(r)='object'
 union all select upper(btrim(v)) from jsonb_array_elements(refs)r cross join lateral jsonb_array_elements_text(case when jsonb_typeof(r->'original_sources')='array' then r->'original_sources' else '[]' end)v
 )s where v in ('ENF','WCA','WIFFA')
$$;
revoke all on function public.freight_crm_directory_types(jsonb) from public,anon;
grant execute on function public.freight_crm_directory_types(jsonb) to authenticated;
-- Bounded list responses. All functions run with the caller's existing RLS permissions.
create or replace function public.freight_crm_stage(stage text,status text) returns text language sql immutable security invoker set search_path=public as $$
 select case when stage in ('待开发','开发中','有意向','报价中','已合作','暂缓开发') then stage when status='合作中' then '已合作' when status='正在跟进' then '开发中' when status in ('沉睡','流失') then '暂缓开发' else '待开发' end
$$;
create or replace function public.freight_crm_clue_key(website text,source_url text,evidence jsonb) returns text language sql immutable security invoker set search_path=public as $$
 select '['||to_json(regexp_replace(btrim(coalesce(website,'')),'/$',''))::text||','||to_json(coalesce(source_url,''))::text||coalesce((select ','||string_agg(to_json(u)::text,',' order by u collate "C") from (select coalesce(e->>'url',e->>'source_url','') u from jsonb_array_elements(coalesce(evidence,'[]')) e where not (e ? 'checked_at') and not (e ? 'contact_check'))s where u<>''),'')||']'
$$;
create or replace function public.freight_crm_uri_component(v text) returns text language sql immutable security invoker set search_path=public as $$
 select coalesce(string_agg(case when b between 48 and 57 or b between 65 and 90 or b between 97 and 122 or chr(b) in ('-','_','.','!','~','*',chr(39),'(',')') then chr(b) else '%'||upper(lpad(to_hex(b),2,'0')) end,'' order by n),'') from (select n,get_byte(convert_to(v,'UTF8'),n) b from generate_series(0,octet_length(convert_to(v,'UTF8'))-1)n)s
$$;
create or replace function public.freight_crm_page(p_filters jsonb default '{}',p_offset integer default 0,p_limit integer default 30,p_mode text default 'page',p_ids text[] default null) returns jsonb language plpgsql stable security invoker set search_path=public set jit=off as $$
declare result jsonb;
begin
execute $pagequery$
with checked_leads as materialized (
 select id::text id,exists(select 1 from jsonb_array_elements(source_evidence)e where e->>'contact_check'=public.freight_crm_clue_key(website,null,source_evidence)) checked from public.lead_discovery_leads
), checked_exhibitors as materialized (
 select id::text id,position('[contact-check:'||public.freight_crm_uri_component(public.freight_crm_clue_key(website,source_url,'[]'))||']' in notes)>0 checked from public.freight_exhibitors
), ca_rows as materialized (
 select company_id,count(*) n,bool_or(channel='邮箱') any_email,bool_or(channel='邮箱' and status<>'失效' and value<>'') email,bool_or(channel='电话' and status<>'失效' and value<>'') phone,bool_or(channel='邮箱' and status='有效' and email_allowed) verified,
 string_agg(name||' '||value,' ') search,
 array_agg(distinct g) filter(where g is not null) groups
 from public.freight_contacts c left join lateral unnest(c.mail_groups)g on true
 group by company_id
), ca_map as materialized (select jsonb_object_agg(company_id,to_jsonb(ca_rows)-'company_id') lookup from ca_rows), base as materialized (
 select c.id,c.company_name,c.status,c.role,c.owner,c.industry,c.region,c.development_stage,c.is_key_customer,c.current_routes,c.historical_routes,c.updated_at,
 public.freight_crm_stage(c.development_stage,c.status) stage,
 coalesce(ca.email,false) has_email,coalesce(ca.phone,false) has_phone,coalesce(ca.any_email,false) any_email,coalesce(ca.verified,false) verified,coalesce(ca.n,0) contact_count,ca.search contact_search,
 case when $4='facets' or coalesce($1->>'group','')<>'' then (select coalesce(array_agg(distinct g),'{}') from (
 select value #>> '{}' g from jsonb_array_elements(c.source_refs) where jsonb_typeof(value)='string' and (value #>> '{}')~'^[A-Z][A-Z0-9-]*-[0-9]{8}$'
 union select value->>'batch' from jsonb_array_elements(c.source_refs) where value ? 'batch'
 union select unnest(coalesce(ca.groups,'{}'))
 union select m[1] from regexp_matches(c.notes,'(?:^|\n)采集批次[：:]\s*([^\r\n]+)','g')m
 )s where g<>'' and g is not null) else '{}'::text[] end groups,
 c.source_refs,
 case when $4='facets' then false when coalesce(ca.email,false) and coalesce(ca.phone,false) then false when not (c.source_refs::text like '%"lead_id"%' or c.source_refs::text like '%"exhibitor_id"%') then false else (select count(*)>0 and bool_and(coalesce(case when r ? 'lead_id' then l.checked else e.checked end,false)) from jsonb_array_elements(c.source_refs)r left join checked_leads l on l.id=r->>'lead_id' left join checked_exhibitors e on e.id=r->>'exhibitor_id' where jsonb_typeof(r)='object' and (r ? 'lead_id' or r ? 'exhibitor_id')) end _lower_priority,
 case when $4='stats' or coalesce($1->>'due','')<>'' then (select next_date from public.freight_followups f where f.company_id=c.id order by created_at desc,id desc limit 1) else null::date end next_date,
 case when coalesce($1->>'query','')<>'' then c.notes else '' end search_notes,c.source_refs search_refs
 from public.freight_companies c cross join ca_map cm left join lateral jsonb_to_record(cm.lookup->c.id) as ca(n bigint,email boolean,phone boolean,any_email boolean,verified boolean,search text,groups text[]) on true
 where (coalesce($1->>'directory','')='' or (upper($1->>'directory')='ENF' and c.source_refs @? '$[*] ? (@.source like_regex "^ENF$" flag "i" || @.provider like_regex "^ENF$" flag "i" || @.original_sources[*] like_regex "^ENF$" flag "i" || @ like_regex "^ENF$" flag "i")') or (upper($1->>'directory')='WCA' and c.source_refs @? '$[*] ? (@.source like_regex "^WCA$" flag "i" || @.provider like_regex "^WCA$" flag "i" || @.original_sources[*] like_regex "^WCA$" flag "i" || @ like_regex "^WCA$" flag "i")') or (upper($1->>'directory')='WIFFA' and c.source_refs @? '$[*] ? (@.source like_regex "^WIFFA$" flag "i" || @.provider like_regex "^WIFFA$" flag "i" || @.original_sources[*] like_regex "^WIFFA$" flag "i" || @ like_regex "^WIFFA$" flag "i")')) and ($5 is null or c.id=any($5)) and (coalesce($1->>'role','')='' or c.role=$1->>'role')
), filtered as materialized (
 select * from base b where
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
when $4='stats' then jsonb_build_object('total',(select count(*) from base),'pending',(select count(*) from base where status='待核实'),'key',(select count(*) from base where is_key_customer),'due',(select count(*) from base where next_date<=(now() at time zone 'Asia/Shanghai')::date),'needs',(select count(*) from base where not(has_email and has_phone)),'checked',(select count(*) from base where _lower_priority and not(has_email and has_phone)),'stages',(select coalesce(jsonb_object_agg(stage,n),'{}') from (select stage,count(*) n from base group by stage)s))
else jsonb_build_object('total',(select count(*) from filtered),'companies',coalesce((select jsonb_agg(to_jsonb(p)-'search_notes'-'search_refs'-'contact_search'-'groups'-'stage'-'has_email'-'has_phone'-'any_email'-'verified'-'contact_count' order by _lower_priority,id) from page_rows p),'[]'),'followups',coalesce((select jsonb_agg(f) from (select distinct on (company_id) id,company_id,next_date,created_at from public.freight_followups where company_id in(select id from page_rows) order by company_id,created_at desc,id desc)f),'[]'),'contacts',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'company_id',c.company_id,'name',c.name,'channel',c.channel,'value',c.value,'status',c.status,'email_allowed',c.email_allowed,'mail_groups',c.mail_groups)) from public.freight_contacts c where c.company_id in(select id from page_rows)),'[]')) end
$pagequery$ into result using p_filters,p_offset,p_limit,p_mode,p_ids;
return result;
end
$$;
revoke all on function public.freight_crm_page(jsonb,integer,integer,text,text[]) from public,anon;
grant execute on function public.freight_crm_page(jsonb,integer,integer,text,text[]) to authenticated;
revoke all on function public.freight_crm_stage(text,text),public.freight_crm_clue_key(text,text,jsonb),public.freight_crm_uri_component(text) from public,anon;
grant execute on function public.freight_crm_stage(text,text),public.freight_crm_clue_key(text,text,jsonb),public.freight_crm_uri_component(text) to authenticated;
