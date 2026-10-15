-- Stage small batches of OSM POIs for manual review. Existing records are not overwritten.
create or replace function public.lead_stage_osm(p_task_id uuid,p_rows jsonb)
returns integer language plpgsql security invoker set search_path = '' as $$
declare item jsonb; inserted_count integer:=0; place text; website text; item_name text;
begin
 if auth.uid() is null then raise exception '请先登录'; end if;
 if not exists(select 1 from public.lead_discovery_tasks where id=p_task_id and source='openstreetmap') then raise exception '仅允许保存 OSM 任务结果'; end if;
 if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)>80 then raise exception '最多一次保存80条'; end if;
 for item in select value from jsonb_array_elements(p_rows) loop
  place:=left(trim(coalesce(item->>'place_id','')),120);
  item_name:=left(trim(coalesce(item->>'name','')),240);
  if place !~ '^(node|way|relation)/[0-9]+$' or item_name='' then continue; end if;
  website:=left(coalesce(item->>'website',''),500);
  insert into public.lead_discovery_leads(task_id,provider,provider_place_id,company_name,website,country,city,address,contacts,source_evidence,verification_status)
  select p_task_id,'openstreetmap',place,item_name,website,
   left(coalesce(t.country,''),100),left(coalesce(t.city,''),100),left(coalesce(item->>'address',''),500),
   coalesce((select jsonb_agg(jsonb_build_object('type',v.typ,'value',v.val,'source_url', 'https://www.openstreetmap.org/'||place))
    from (values ('email',left(coalesce(item->>'email',''),500)),('phone',left(coalesce(item->>'phone',''),500))) v(typ,val)
    where v.val<>'') ,'[]'::jsonb),
   jsonb_build_array(jsonb_build_object('url','https://www.openstreetmap.org/'||place,'attribution','© OpenStreetMap contributors, ODbL','observed_at',now())),
   'unverified'
  from public.lead_discovery_tasks t where t.id=p_task_id
  on conflict (provider,provider_place_id) where provider_place_id is not null do nothing;
  get diagnostics place = row_count;
  inserted_count:=inserted_count+place::integer;
 end loop;
 return inserted_count;
end $$;
revoke all on function public.lead_stage_osm(uuid,jsonb) from public,anon;
grant execute on function public.lead_stage_osm(uuid,jsonb) to authenticated;
