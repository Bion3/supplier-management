-- Overture candidate staging, reviewed manually before CRM import.
-- Current CRM RLS applies to task SELECT and lead INSERT (security invoker).
create or replace function public.lead_stage_overture(p_task_id uuid,p_release text,p_rows jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare r jsonb; task public.lead_discovery_tasks; inserted_count int:=0; skipped_count int:=0; count_rows int; oid text; name text; site text; addr text; category text; emails jsonb; phones jsonb; contacts jsonb; evidence jsonb; v text; x jsonb; affected int;
begin
 if (select auth.uid()) is null then raise exception '请先登录'; end if;
 select * into task from public.lead_discovery_tasks where id=p_task_id and source='overture';
 if not found then raise exception '请选择 Overture 来源任务'; end if;
 if p_release !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}(\.[0-9]+)?$' then raise exception 'Overture 版本号格式无效'; end if;
 if jsonb_typeof(p_rows) <> 'array' then raise exception '导入数据必须为数组'; end if;
 count_rows:=jsonb_array_length(p_rows);
 if count_rows<1 or count_rows>50 then raise exception '单次提交1至50家企业'; end if;
 for r in select value from jsonb_array_elements(p_rows) loop
  oid:=trim(coalesce(r->>'id',''));
  name:=left(trim(coalesce(r->>'name','')),240);
  site:=left(trim(coalesce(r->>'website','')),500);
  addr:=left(trim(coalesce(r->>'address','')),500);
  category:=left(trim(coalesce(r->>'category','')),120);
  if oid !~ '^[0-9a-fA-F-]{36}$' or name='' then skipped_count:=skipped_count+1;continue;end if;
  if site<>'' and site !~* '^https?://[^ /]+(/.*)?$' then site:='';end if;
  contacts:='[]'::jsonb;
  for x in select value from jsonb_array_elements(case when jsonb_typeof(r->'emails')='array' then r->'emails' else '[]'::jsonb end) loop
   v:=left(trim(x #>> '{}'),200);
   if v ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    contacts:=contacts||jsonb_build_array(jsonb_build_object('type','email','value',v,'source_url','https://docs.overturemaps.org/guides/places/','source_type','overture_dataset','verification','unverified'));
   end if;
   if jsonb_array_length(contacts)>=10 then exit;end if;
  end loop;
  for x in select value from jsonb_array_elements(case when jsonb_typeof(r->'phones')='array' then r->'phones' else '[]'::jsonb end) loop
   v:=left(trim(x #>> '{}'),50);
   if length(v) between 5 and 40 then
    contacts:=contacts||jsonb_build_array(jsonb_build_object('type','phone','value',v,'source_url','https://docs.overturemaps.org/guides/places/','source_type','overture_dataset','verification','unverified'));
   end if;
   if jsonb_array_length(contacts)>=20 then exit;end if;
  end loop;
  evidence:=jsonb_build_array(jsonb_build_object('source','overturemaps','place_id',oid,'release',p_release,'category',category,'attribution','Overture Maps and upstream data providers; check source licenses','reference','https://docs.overturemaps.org/','record_sources',coalesce(r->'sources','[]'::jsonb),'imported_at',now()));
  insert into public.lead_discovery_leads(task_id,provider,provider_place_id,company_name,website,country,city,address,contacts,source_evidence,verification_status,review_status)
  values(p_task_id,'overture',oid,name,nullif(site,''),task.country,task.city,nullif(addr,''),contacts,evidence,'unverified','pending')
  on conflict(provider,provider_place_id) where provider_place_id is not null do nothing;
  get diagnostics affected=row_count;
  inserted_count:=inserted_count+affected;skipped_count:=skipped_count+(1-affected);
 end loop;
 return jsonb_build_object('inserted',inserted_count,'skipped',skipped_count);
end $$;
revoke all on function public.lead_stage_overture(uuid,text,jsonb) from public,anon;
grant execute on function public.lead_stage_overture(uuid,text,jsonb) to authenticated;
