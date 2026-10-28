alter table public.freight_companies add column development_stage text not null default '' check(development_stage in ('','待开发','开发中','有意向','报价中','已合作','暂缓开发')),add column is_key_customer boolean not null default false;
alter table public.freight_exhibitors add column crm_company_id text references public.freight_companies(id);
create index freight_exhibitors_crm_company on public.freight_exhibitors(crm_company_id) where crm_company_id is not null;
create or replace function public.freight_create_company(p_company jsonb,p_contacts jsonb default '[]') returns jsonb language plpgsql security invoker set search_path='' as $$
declare c public.freight_companies;item jsonb;saved public.freight_contacts;result jsonb:='[]';begin
 if auth.uid() is null then raise exception '请先登录';end if;
 if jsonb_typeof(p_contacts)<>'array' or jsonb_array_length(p_contacts)>100 then raise exception '联系方式数量无效';end if;
 insert into public.freight_companies(id,company_name,status,role,region,owner,industry,current_routes,notes,addresses,development_stage,is_key_customer)
 values(p_company->>'id',p_company->>'company_name',p_company->>'status',p_company->>'role',coalesce(p_company->>'region',''),coalesce(p_company->>'owner',''),coalesce(p_company->>'industry',''),coalesce(p_company->>'current_routes',''),coalesce(p_company->>'notes',''),coalesce(p_company->'addresses','[]'),coalesce(p_company->>'development_stage','待开发'),coalesce((p_company->>'is_key_customer')::boolean,false)) returning * into c;
 for item in select value from jsonb_array_elements(p_contacts) loop
  if length(trim(coalesce(item->>'value','')))=0 or length(item->>'value')>500 then raise exception '联系方式无效';end if;
  insert into public.freight_contacts(id,company_id,name,channel,value,context,status) values(item->>'id',c.id,coalesce(item->>'name',''),item->>'channel',trim(item->>'value'),coalesce(item->>'context',''),item->>'status') returning * into saved;
  result:=result||jsonb_build_array(to_jsonb(saved));
 end loop;return jsonb_build_object('company',to_jsonb(c),'contacts',result);
end $$;
revoke all on function public.freight_create_company(jsonb,jsonb) from public,anon;grant execute on function public.freight_create_company(jsonb,jsonb) to authenticated;
-- Reviewed leads keep their existing import guard. Exhibitors enter as unverified CRM records.
create or replace function public.freight_acquisition_to_crm(p_kind text,p_id uuid,p_company_id text default null) returns jsonb language plpgsql security invoker set search_path='' as $$
declare e public.freight_exhibitors;f public.freight_exhibitions;l public.lead_discovery_leads;c public.freight_companies;cid text;existing text;nm text;web text;domain text;ref jsonb;refs jsonb;items jsonb;item jsonb;chan text;val text;contact_name text;result jsonb;begin
 if auth.uid() is null then raise exception '请先登录';end if;
 if p_kind='lead' then
  select * into l from public.lead_discovery_leads where id=p_id for update;
  if not found then raise exception '线索不存在或无权访问';end if;
  if l.crm_company_id is not null then return jsonb_build_object('status','already_imported','company_id',l.crm_company_id);end if;
  if l.review_status<>'reviewed' then raise exception '请先人工审核线索';end if;
  if l.provider='google_places' then raise exception '此来源仅允许实时查看';end if;
  nm:=l.company_name;web:=coalesce(l.website,'');items:=l.contacts;
  ref:=jsonb_build_object('source',l.provider,'id',l.provider_place_id,'lead_id',l.id,'website',l.website,'evidence',l.source_evidence);
 elsif p_kind='exhibitor' then
  select * into e from public.freight_exhibitors where id=p_id for update;
  if not found then raise exception '展商不存在或无权访问';end if;
  if e.crm_company_id is not null then return jsonb_build_object('status','already_imported','company_id',e.crm_company_id);end if;
  if e.status='失效' then raise exception '失效展商不能转入';end if;
  if coalesce(e.catalog_edition,'') in ('','待核实') then raise exception '请先确认目录届次，再转入客户';end if;
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
  select id into existing from public.freight_companies where lower(trim(company_name))=lower(trim(nm)) limit 1;
  domain:=lower(split_part(regexp_replace(coalesce(web,''),'^https?://(www[.])?','','i'),'/',1));
  if existing is null and length(domain)>3 then
   select x.id into existing from public.freight_companies x where exists(select 1 from jsonb_array_elements(x.source_refs) s where jsonb_typeof(s)='object' and lower(split_part(regexp_replace(coalesce(s->>'website',''),'^https?://(www[.])?','','i'),'/',1))=domain) limit 1;
  end if;
  if existing is null and p_kind='exhibitor' and e.email<>'' then select company_id into existing from public.freight_contacts where channel='邮箱' and lower(trim(value))=lower(trim(e.email)) limit 1;end if;
  if existing is not null then return jsonb_build_object('status','possible_duplicate','company_id',existing);end if;
  if p_kind='lead' then return public.lead_import_reviewed(p_id);end if;
  cid:=gen_random_uuid()::text;
  insert into public.freight_companies(id,company_name,status,role,region,industry,development_stage,notes,source_refs)
   values(cid,nm,'待核实',case when e.company_type='货代' then '同行' when e.company_type='海外代理' then '海外代理' else '待核实' end,coalesce(e.country,''),coalesce(e.industry,''),'待开发','展会线索：'||f.name||' · '||e.catalog_edition||'；企业及运输需求待核实。','[]');
 end if;
 refs:=jsonb_build_array(ref);if p_kind='exhibitor' then select refs||coalesce(jsonb_agg(t),'[]') into refs from unnest(e.tags) t where t ~ '^[A-Z][A-Z0-9]*-\d{8}$';end if;
 update public.freight_companies set source_refs=source_refs||refs,updated_at=now() where id=cid;
 for item in select value from jsonb_array_elements(coalesce(items,'[]')) loop
  val:=trim(coalesce(item->>'value',''));chan:=case when item->>'type' in ('email','邮箱') then '邮箱' when item->>'type' in ('phone','电话') then '电话' else '' end;
  if chan<>'' and length(val) between 3 and 500 and not exists(select 1 from public.freight_contacts where company_id=cid and channel=chan and lower(trim(value))=lower(val)) then
   insert into public.freight_contacts(id,company_id,name,channel,value,context,status,source_refs,email_allowed) values(gen_random_uuid()::text,cid,coalesce(item->>'name',case when p_kind='exhibitor' then e.contact_name else '' end),chan,val,'获客来源公开资料，待核实','待核实',jsonb_build_array(ref||jsonb_build_object('url',coalesce(item->>'source_url',ref->>'url'),'source_type',item->>'source_type')),false);
  end if;
 end loop;
 if p_kind='exhibitor' then update public.freight_exhibitors set crm_company_id=cid,updated_at=now() where id=p_id;
 else update public.lead_discovery_leads set crm_company_id=cid,updated_at=now() where id=p_id;end if;
 return jsonb_build_object('status',case when p_company_id is null then 'imported' else 'linked' end,'company_id',cid);
end $$;
revoke all on function public.freight_acquisition_to_crm(text,uuid,text) from public,anon;grant execute on function public.freight_acquisition_to_crm(text,uuid,text) to authenticated;
