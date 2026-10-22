-- Add explicit geographic coordinates for map prospecting; legacy records remain ungeocoded.
alter table public.lead_discovery_leads add column if not exists map_lat double precision;
alter table public.lead_discovery_leads add column if not exists map_lng double precision;
alter table public.lead_discovery_leads add column if not exists map_category text;
alter table public.lead_discovery_leads add constraint lead_map_lat_range check(map_lat is null or map_lat between -90 and 90);
alter table public.lead_discovery_leads add constraint lead_map_lng_range check(map_lng is null or map_lng between -180 and 180);
create index if not exists lead_discovery_geopoints on public.lead_discovery_leads(map_lat,map_lng) where map_lat is not null and map_lng is not null;

-- Controlled authenticated operator staging. Contacts always remain unverified.
create or replace function public.lead_map_stage(p_task_id uuid,p_release text,p_rows jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r jsonb; task public.lead_discovery_tasks; latitude double precision; longitude double precision;
 inserted_ integer:=0;updated_ integer:=0;skipped_ integer:=0;affected integer;
 oid text; company text; site text; category text; address_ text; evidence jsonb;
begin
 if auth.uid() is null then raise exception '请先登录 CRM'; end if;
 select * into task from public.lead_discovery_tasks where id=p_task_id and source='overture';
 if not found then raise exception '请选择 Overture 城市任务'; end if;
 if p_release !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}(\.[0-9]+)?$' then raise exception '版本号格式无效'; end if;
 if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows) not between 1 and 50 then raise exception '每批1-50条'; end if;
 for r in select value from jsonb_array_elements(p_rows) loop
  oid:=trim(coalesce(r->>'id',''));company:=left(trim(coalesce(r->>'name','')),240);
  site:=left(trim(coalesce(r->>'website','')),500);
  category:=left(trim(coalesce(r->>'category','')),120);
  address_:=left(trim(coalesce(r->>'address','')),500);
  if oid !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   or company='' or coalesce(r->>'lat','') !~ '^-?[0-9]+(\.[0-9]+)?$'
   or coalesce(r->>'lng','') !~ '^-?[0-9]+(\.[0-9]+)?$' then
   skipped_:=skipped_+1;continue;
  end if;
  latitude:=(r->>'lat')::double precision;longitude:=(r->>'lng')::double precision;
  if latitude not between -90 and 90 or longitude not between -180 and 180 then skipped_:=skipped_+1;continue;end if;
  if site<>'' and site !~* '^https?://[^ /]+(/.*)?$' then site:='';end if;
  evidence:=jsonb_build_array(jsonb_build_object('source','overturemaps','place_id',oid,'release',p_release,'category',category,'record_sources',coalesce(r->'sources','[]'::jsonb),'imported_at',now(),'location_source','overture_geometry'));
  insert into public.lead_discovery_leads(task_id,provider,provider_place_id,company_name,website,country,city,address,map_lat,map_lng,map_category,contacts,source_evidence,verification_status,review_status)
  values(p_task_id,'overture',oid,company,nullif(site,''),task.country,task.city,nullif(address_,''),latitude,longitude,category,'[]'::jsonb,evidence,'unverified','pending')
  on conflict(provider,provider_place_id) where provider_place_id is not null do nothing;
  get diagnostics affected=row_count;
  if affected=1 then inserted_:=inserted_+1;
  else
   -- Update coordinates only when the pre-existing record has no coordinates; never overwrite review/contact fields.
   update public.lead_discovery_leads
     set map_lat=latitude,map_lng=longitude,map_category=coalesce(nullif(map_category,''),category),updated_at=now()
   where provider='overture' and provider_place_id=oid and map_lat is null and map_lng is null;
   get diagnostics affected=row_count;
   updated_:=updated_+affected;
   if affected=0 then skipped_:=skipped_+1;end if;
  end if;
 end loop;
 return jsonb_build_object('inserted',inserted_,'located_existing',updated_,'skipped',skipped_);
end $$;
revoke all on function public.lead_map_stage(uuid,text,jsonb) from public,anon;
grant execute on function public.lead_map_stage(uuid,text,jsonb) to authenticated;