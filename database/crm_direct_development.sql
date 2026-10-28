alter table public.freight_companies add column acquisition_domain text not null default '';
create index freight_company_name_region on public.freight_companies(lower(trim(company_name)),lower(trim(region)));
create index freight_company_acquisition_domain on public.freight_companies(acquisition_domain) where acquisition_domain<>'';
update public.freight_companies c set acquisition_domain=coalesce((select lower(split_part(regexp_replace(v->>'website','^https?://(www[.])?','','i'),'/',1)) from jsonb_array_elements(c.source_refs) v where jsonb_typeof(v)='object' and v->>'website' ~ '^https?://' limit 1),'') where acquisition_domain='';
create or replace function public.freight_acquisition_to_crm(p_kind text,p_id uuid,p_company_id text default null) returns jsonb language plpgsql security invoker set search_path='' as $$
declare e public.freight_exhibitors;f public.freight_exhibitions;l public.lead_discovery_leads;c public.freight_companies;cid text;existing text;nm text;web text;domain text;ref jsonb;refs jsonb;items jsonb;item jsonb;chan text;val text;contact_name text;result jsonb;begin
 if auth.uid() is null and current_user not in ('postgres','supabase_admin','service_role') then raise exception '请先登录';end if;
 if p_kind='lead' then
  select * into l from public.lead_discovery_leads where id=p_id for update;
  if not found then raise exception '线索不存在或无权访问';end if;
  if l.crm_company_id is not null then p_company_id:=l.crm_company_id;end if;
  if l.provider='google_places' then raise exception '此来源仅允许实时查看';end if;
  nm:=l.company_name;web:=coalesce(l.website,'');items:=l.contacts;
  ref:=jsonb_build_object('source',l.provider,'id',l.provider_place_id,'lead_id',l.id,'website',l.website);
 elsif p_kind='exhibitor' then
  select * into e from public.freight_exhibitors where id=p_id for update;
  if not found then raise exception '展商不存在或无权访问';end if;
  if e.crm_company_id is not null then p_company_id:=e.crm_company_id;end if;
  select * into f from public.freight_exhibitions where id=e.exhibition_id;
  nm:=e.company_name;web:=e.website;items:=coalesce(to_jsonb(e)->'contacts','[]'::jsonb)||jsonb_build_array(jsonb_build_object('type','email','value',e.email,'source_url',e.source_url),jsonb_build_object('type','phone','value',e.phone,'source_url',e.source_url));
  ref:=jsonb_build_object('source','exhibition','exhibitor_id',e.id,'exhibition_id',e.exhibition_id,'exhibition',f.name,'edition',e.catalog_edition,'url',e.source_url,'website',web);
 else raise exception '不支持的获客来源';end if;
 if length(trim(coalesce(nm,'')))=0 then raise exception '公司名称不能为空';end if;
 domain:=lower(split_part(regexp_replace(coalesce(web,''),'^https?://(www[.])?','','i'),'/',1));
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(lower(trim(nm))));
 if length(domain)>3 then perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('website:'||domain));end if;
 if p_company_id is not null then
  select * into c from public.freight_companies where id=p_company_id for update;
  if not found then raise exception '客户不存在或无权关联';end if;cid:=c.id;
 else
  select case when count(*)=1 then min(id) end into existing from public.freight_companies where lower(trim(company_name))=lower(trim(nm)) and (region='' or lower(trim(region))=lower(trim(case when p_kind='lead' then coalesce(l.country,'') else coalesce(e.country,'') end)));
  if existing is null and length(domain)>3 then
   select case when count(*)=1 then min(id) end into existing from public.freight_companies where acquisition_domain=domain and (region='' or lower(trim(region))=lower(trim(case when p_kind='lead' then coalesce(l.country,'') else coalesce(e.country,'') end)));
  end if;
  if existing is not null then cid:=existing;else
  cid:=gen_random_uuid()::text;
  insert into public.freight_companies(id,company_name,status,role,region,industry,development_stage,notes,source_refs,acquisition_domain)
   values(cid,nm,'待核实',case when e.company_type='货代' then '同行' when e.company_type='海外代理' then '海外代理' else '待核实' end,case when p_kind='lead' then coalesce(l.country,'') else coalesce(e.country,'') end,coalesce(e.industry,''),case when l.review_status='rejected' or e.status='失效' then '暂缓开发' else '待开发' end,case when p_kind='lead' then '地图线索，运输需求待确认。' else '展会线索：'||f.name||' · '||coalesce(e.catalog_edition,'待核实')||'，运输需求待确认。' end,'[]',domain);
  end if;
 end if;
 refs:=jsonb_build_array(ref);if p_kind='exhibitor' then select refs||coalesce(jsonb_agg(t),'[]') into refs from unnest(e.tags) t where t ~ '^[A-Z][A-Z0-9]*-\d{8}$';end if;
 update public.freight_companies set source_refs=(select jsonb_agg(distinct value) from jsonb_array_elements(source_refs||refs)),acquisition_domain=case when acquisition_domain='' then domain else acquisition_domain end,updated_at=now() where id=cid;
 for item in select value from jsonb_array_elements(coalesce(items,'[]')) loop
  val:=trim(coalesce(item->>'value',''));chan:=case when item->>'type' in ('email','邮箱') then '邮箱' when item->>'type' in ('phone','电话') then '电话' else '' end;
  if chan<>'' and length(val) between 3 and 500 and not exists(select 1 from public.freight_contacts where company_id=cid and channel=chan and lower(trim(value))=lower(val)) then
   insert into public.freight_contacts(id,company_id,name,channel,value,context,status,source_refs,email_allowed) values(gen_random_uuid()::text,cid,coalesce(item->>'name',case when p_kind='exhibitor' then e.contact_name else '' end),chan,val,'获客来源公开资料，待核实','待核实',jsonb_build_array(ref||jsonb_build_object('url',coalesce(item->>'source_url',ref->>'url'),'source_type',item->>'source_type')),false);
  end if;
 end loop;
 if p_kind='exhibitor' then update public.freight_exhibitors set crm_company_id=cid where id=p_id and crm_company_id is distinct from cid;
 else update public.lead_discovery_leads set crm_company_id=cid where id=p_id and crm_company_id is distinct from cid;end if;
 return jsonb_build_object('status',case when p_company_id is null then 'imported' else 'linked' end,'company_id',cid);
end $$;
revoke all on function public.freight_acquisition_to_crm(text,uuid,text) from public,anon;grant execute on function public.freight_acquisition_to_crm(text,uuid,text) to authenticated;

-- Compatibility entry point: review is metadata, never an access gate.
create or replace function public.lead_import_reviewed(p_lead_id uuid) returns jsonb language sql security invoker set search_path='' as $$select public.freight_acquisition_to_crm('lead',p_lead_id)$$;
create or replace function public.freight_auto_acquisition_sync() returns trigger language plpgsql security invoker set search_path='' as $$begin
 if pg_trigger_depth()>1 then return new;end if;
 if tg_table_name='lead_discovery_leads' then if new.provider='google_places' then return new;end if;end if;
 perform public.freight_acquisition_to_crm(case when tg_table_name='lead_discovery_leads' then 'lead' else 'exhibitor' end,new.id);
 return new;end $$;
revoke all on function public.freight_auto_acquisition_sync() from public,anon;
create trigger freight_lead_direct_followup after insert or update of company_name,website,country,contacts on public.lead_discovery_leads for each row execute function public.freight_auto_acquisition_sync();
create trigger freight_exhibitor_direct_followup after insert or update of company_name,website,country,email,phone,contacts on public.freight_exhibitors for each row execute function public.freight_auto_acquisition_sync();
create or replace function public.freight_sync_acquisition_batch(p_kind text,p_limit int default 100) returns int language plpgsql security invoker set search_path='' as $$declare r record;n int:=0;begin
 if p_kind='lead' then for r in select id from public.lead_discovery_leads where crm_company_id is null and provider<>'google_places' order by created_at limit least(greatest(p_limit,1),200) loop perform public.freight_acquisition_to_crm('lead',r.id);n:=n+1;end loop;
 elsif p_kind='exhibitor' then for r in select id from public.freight_exhibitors where crm_company_id is null order by created_at limit least(greatest(p_limit,1),200) loop perform public.freight_acquisition_to_crm('exhibitor',r.id);n:=n+1;end loop;
 else raise exception '来源无效';end if;return n;end $$;
revoke all on function public.freight_sync_acquisition_batch(text,int) from public,anon;grant execute on function public.freight_sync_acquisition_batch(text,int) to authenticated;


CREATE OR REPLACE FUNCTION public.lead_enqueue_batch(p_ids uuid[])
 RETURNS uuid[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare result uuid[]; total int;
begin
 if auth.uid() is null then raise exception '请登录 CRM'; end if;
 -- The current CRM uses an explicit auth user allowlist. Do not infer permission from a nonempty table under SECURITY DEFINER.
 if auth.uid() <> all(array['1520a854-1746-4add-af50-6605967bb72f'::uuid,'2c1dc7d7-ecc4-4992-9bca-301877e9cd66'::uuid]) then raise exception '无权使用 CRM'; end if;
 total:=coalesce(cardinality(p_ids),0);
 if total=0 or total>500 then raise exception '一次请选择1至500家企业'; end if;
 if exists(select 1 from unnest(p_ids) x where x is null) then raise exception '企业编号无效'; end if;
 insert into public.lead_enrich_jobs(lead_id,owner_id)
 select distinct l.id,auth.uid() from public.lead_discovery_leads l
 where l.id=any(p_ids) and l.provider<>'google_places'
   and l.website ~* '^https://' and length(l.website)<500
 on conflict (lead_id) do update set
 owner_id=excluded.owner_id,status='queued',attempts=0,error=null,finished_at=null,updated_at=now()
 where public.lead_enrich_jobs.status='failed';
 select array_agg(j.id) into result from public.lead_enrich_jobs j
 where j.lead_id=any(p_ids) and j.status='queued' and j.owner_id=auth.uid();
 return coalesce(result,array[]::uuid[]);
end $function$;
CREATE OR REPLACE FUNCTION public.lead_enrich_worker(p_secret text, p_action text, p_job_id uuid, p_result jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare job public.lead_enrich_jobs; lead public.lead_discovery_leads; c jsonb; new_contacts jsonb; new_evidence jsonb; n int:=0; key text;
begin
 if not exists(select 1 from lead_private.worker_credentials where id=1 and secret_hash=pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_secret,'UTF8')),'hex')) then
  raise exception 'Worker credential invalid';
 end if;
 if p_action not in ('claim','finish') then raise exception 'Invalid action'; end if;
 select * into job from public.lead_enrich_jobs where id=p_job_id for update;
 if not found then return '{}'::jsonb; end if;
 if p_action='claim' then
  if job.status not in ('queued','running') then return '{}'::jsonb; end if;
  if job.status='running' and job.started_at>now()-interval '4 minutes' then return '{}'::jsonb; end if;
  select * into lead from public.lead_discovery_leads where id=job.lead_id;
  if not found or lead.provider='google_places' or lead.website not like 'https://%' then
   update public.lead_enrich_jobs set status='failed',error='企业不存在或官网不可用',finished_at=now(),updated_at=now() where id=job.id;
   return '{}'::jsonb;
  end if;
  if job.attempts>=5 then
   update public.lead_enrich_jobs set status='failed',error='超过重试次数',finished_at=now(),updated_at=now() where id=job.id;
   return '{}'::jsonb;
  end if;
  update public.lead_enrich_jobs set status='running',attempts=attempts+1,started_at=now(),updated_at=now() where id=job.id;
  return jsonb_build_object('website',lead.website,'lead_id',lead.id);
 end if;
 if job.status<>'running' then return '{}'::jsonb; end if;
 if coalesce(p_result->>'error','')<>'' then
  update public.lead_enrich_jobs set status='failed',error=left(p_result->>'error',300),finished_at=now(),updated_at=now() where id=job.id;
  return jsonb_build_object('finished',true);
 end if;
 select * into lead from public.lead_discovery_leads where id=job.lead_id for update;
 if not found then
  update public.lead_enrich_jobs set status='failed',error='企业不存在或无权访问',finished_at=now(),updated_at=now() where id=job.id;
  return jsonb_build_object('finished',true);
 end if;
 new_contacts:=coalesce(lead.contacts,'[]'::jsonb);
 for c in select value from pg_catalog.jsonb_array_elements(coalesce(p_result->'contacts','[]'::jsonb)) loop
  if c->>'type' not in ('email','phone') or length(coalesce(c->>'value','')) not between 5 and 120 then continue; end if;
  key:=pg_catalog.lower(c->>'value');
  if not exists(select 1 from pg_catalog.jsonb_array_elements(new_contacts) old where pg_catalog.lower(old->>'value')=key and old->>'type'=c->>'type') then
   new_contacts:=new_contacts || pg_catalog.jsonb_build_array(c);n:=n+1;
  end if;
  if pg_catalog.jsonb_array_length(new_contacts)>=100 then exit; end if;
 end loop;
 new_evidence:=coalesce(lead.source_evidence,'[]'::jsonb)||coalesce(p_result->'evidence','[]'::jsonb);
 update public.lead_discovery_leads set contacts=new_contacts,source_evidence=
 (select coalesce(pg_catalog.jsonb_agg(v.value),'[]'::jsonb) from
 (select value from pg_catalog.jsonb_array_elements(new_evidence) with ordinality as a(value,ord) order by ord desc limit 60) v),
 verification_status='website_found_unverified',updated_at=now()
 where id=lead.id;
 update public.lead_enrich_jobs set status='completed',added_count=n,
 checked_pages=least(3,greatest(0,coalesce((p_result->>'checked_pages')::integer,0))),
 error=null,finished_at=now(),updated_at=now() where id=job.id;
 return jsonb_build_object('finished',true,'added',n);
end $function$;

