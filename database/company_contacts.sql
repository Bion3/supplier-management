create function public.freight_create_company(p_company jsonb,p_contacts jsonb default '[]') returns jsonb
language plpgsql security invoker set search_path='' as $$
declare c public.freight_companies; item jsonb; saved public.freight_contacts; result jsonb='[]'; begin
 if auth.uid() is null then raise exception '请先登录'; end if;
 if jsonb_typeof(p_contacts)<>'array' or jsonb_array_length(p_contacts)>100 then raise exception '联系方式数量无效'; end if;
 insert into public.freight_companies(id,company_name,status,role,region,owner,industry,current_routes,notes,addresses)
 values(p_company->>'id',p_company->>'company_name',p_company->>'status',p_company->>'role',coalesce(p_company->>'region',''),coalesce(p_company->>'owner',''),coalesce(p_company->>'industry',''),coalesce(p_company->>'current_routes',''),coalesce(p_company->>'notes',''),coalesce(p_company->'addresses','[]')) returning * into c;
 for item in select value from jsonb_array_elements(p_contacts) loop
  if length(trim(coalesce(item->>'value','')))=0 or length(item->>'value')>500 then raise exception '联系方式无效'; end if;
  insert into public.freight_contacts(id,company_id,name,channel,value,context,status)
  values(item->>'id',c.id,coalesce(item->>'name',''),item->>'channel',trim(item->>'value'),coalesce(item->>'context',''),item->>'status') returning * into saved;
  result=result||jsonb_build_array(to_jsonb(saved));
 end loop;
 return jsonb_build_object('company',to_jsonb(c),'contacts',result);
end $$;
revoke all on function public.freight_create_company(jsonb,jsonb) from public,anon;
grant execute on function public.freight_create_company(jsonb,jsonb) to authenticated;
