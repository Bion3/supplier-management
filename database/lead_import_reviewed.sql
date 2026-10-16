-- Safe, reviewed lead import. CRM existing records are never overwritten automatically.
create or replace function public.lead_import_reviewed(p_lead_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare l public.lead_discovery_leads; existing_id text; new_id text; contact jsonb; chan text; val text; domain text;
begin
 if auth.uid() is null then raise exception '请先登录'; end if;
 select * into l from public.lead_discovery_leads where id=p_lead_id for update;
 if not found then raise exception '候选企业不存在或无权访问'; end if;
 if l.review_status <> 'reviewed' then raise exception '请先人工审核企业'; end if;
 if l.crm_company_id is not null then return jsonb_build_object('status','already_imported','company_id',l.crm_company_id); end if;
 if length(trim(l.company_name))=0 then raise exception '企业名称为空'; end if;
 -- Serialize imports by normalized company name in this transaction.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(pg_catalog.lower(pg_catalog.btrim(l.company_name))));
 select c.id into existing_id from public.freight_companies c
 where pg_catalog.lower(pg_catalog.btrim(c.company_name))=pg_catalog.lower(pg_catalog.btrim(l.company_name))
 limit 1;
 if existing_id is not null then return jsonb_build_object('status','possible_duplicate','company_id',existing_id); end if;
 -- Detect candidates sharing the same website domain already linked to the CRM.
 domain := pg_catalog.lower(pg_catalog.regexp_replace(pg_catalog.regexp_replace(coalesce(l.website,''),'^https?://(www\\.)?','','i'),'/.*$',''));
 if length(domain)>3 then
  select x.crm_company_id into existing_id from public.lead_discovery_leads x
  where x.id<>l.id and x.crm_company_id is not null
    and pg_catalog.lower(pg_catalog.regexp_replace(pg_catalog.regexp_replace(coalesce(x.website,''),'^https?://(www\\.)?','','i'),'/.*$',''))=domain limit 1;
  if existing_id is not null then return jsonb_build_object('status','possible_duplicate','company_id',existing_id); end if;
 end if;
 new_id:=gen_random_uuid()::text;
 insert into public.freight_companies(id,company_name,status,role,region,industry,notes,addresses,source_refs)
 values(new_id,l.company_name,'待核实','待核实',coalesce(l.country,''),'',
 '地图线索；业务属性与联系许可待核实。',
 case when coalesce(l.address,'')<>'' then jsonb_build_array(l.address) else '[]'::jsonb end,
 jsonb_build_array(jsonb_build_object('source',l.provider,'id',l.provider_place_id,'website',l.website,'evidence',l.source_evidence)));
 for contact in select value from jsonb_array_elements(l.contacts) loop
  val:=trim(coalesce(contact->>'value',''));
  chan:=case when contact->>'type' in ('email','邮箱') then '邮箱' when contact->>'type' in ('phone','电话') then '电话' else '' end;
  if chan<>'' and length(val) between 3 and 500 then
   insert into public.freight_contacts(id,company_id,name,channel,value,context,status,source_refs,email_allowed)
   values(gen_random_uuid()::text,new_id,'',chan,val,'企业挖掘公开资料，待人工核实','待核实',
   jsonb_build_array(jsonb_build_object('url',contact->>'source_url','source',l.provider)),false);
  end if;
 end loop;
 update public.lead_discovery_leads set crm_company_id=new_id,updated_at=now() where id=l.id;
 return jsonb_build_object('status','imported','company_id',new_id);
end $$;
revoke all on function public.lead_import_reviewed(uuid) from public,anon;
grant execute on function public.lead_import_reviewed(uuid) to authenticated;
