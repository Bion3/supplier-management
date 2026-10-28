-- Accumulate skipped results for every chunk instead of overwriting with the final chunk.
create or replace function public.lead_map_worker_ingest(p_secret text,p_job_id uuid,p_rows jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.lead_map_search_jobs;r jsonb;uid text;company text;site text;category text;latitude double precision;longitude double precision;aff integer;ins integer:=0;located integer:=0;sk integer:=0;km double precision; contacts_payload jsonb; emails_payload jsonb; phones_payload jsonb;
begin
 if p_secret is null or not exists(select 1 from lead_private.overture_ingest_credentials where id=1 and
 secret_sha256=pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_secret,'UTF8')),'hex')) then raise exception 'invalid worker credential';end if;
 select * into j from public.lead_map_search_jobs where id=p_job_id for update;
 if not found or j.status<>'running' then raise exception 'job not running';end if;
 if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)>50 then raise exception 'invalid chunk';end if;
 for r in select value from jsonb_array_elements(p_rows) loop
 uid=coalesce(r->>'id','');company=left(trim(coalesce(r->>'name','')),240);
 category=left(trim(coalesce(r->>'category','')),120);site=left(trim(coalesce(r->>'website','')),500);
 if uid !~* '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' or company='' or
 coalesce(r->>'lat','') !~ '^-?[0-9]+(\.[0-9]+)?$' or coalesce(r->>'lng','') !~ '^-?[0-9]+(\.[0-9]+)?$'
 then sk=sk+1;continue;end if;
 latitude=(r->>'lat')::double precision;longitude=(r->>'lng')::double precision;
 if latitude not between -90 and 90 or longitude not between -180 and 180 then sk=sk+1;continue;end if;
 km=6371.0088*2*asin(least(1,sqrt(power(sin(radians(latitude-j.center_lat)/2),2)
  +cos(radians(j.center_lat))*cos(radians(latitude))*power(sin(radians(longitude-j.center_lng)/2),2))));
 if km>j.radius_km then sk=sk+1;continue;end if;
 if site<>'' and site !~* '^https?://[^ /]+' then site='';end if;
 -- Convert dataset-provided contact lists into traceable unverified lead records.
 emails_payload:=coalesce((
   select jsonb_agg(jsonb_build_object('type','email','value',lower(v),
    'source_type','overture_dataset','source_release',j.release,'verification','unverified'))
   from (select distinct trim(value) as v
     from jsonb_array_elements_text(case when jsonb_typeof(r->'emails')='array' then r->'emails' else '[]'::jsonb end)
     where length(trim(value))<=150 and trim(value) ~* '^[^[:space:]@]+@[^[:space:]@]+[.][a-z]{2,}$'
     limit 8) e
 ),'[]'::jsonb);
 phones_payload:=coalesce((
   select jsonb_agg(jsonb_build_object('type','phone','value',v,
    'source_type','overture_dataset','source_release',j.release,'verification','unverified'))
   from (select distinct trim(value) as v
     from jsonb_array_elements_text(case when jsonb_typeof(r->'phones')='array' then r->'phones' else '[]'::jsonb end)
     where length(regexp_replace(value,'[^0-9]','','g')) between 6 and 18 and length(trim(value))<=40
     limit 8) p
 ),'[]'::jsonb);
 contacts_payload:=emails_payload||phones_payload;

 insert into public.lead_discovery_leads(task_id,provider,provider_place_id,company_name,website,country,city,address,
    map_lat,map_lng,map_category,contacts,source_evidence,verification_status,review_status)
 select j.task_id,'overture',uid,company,nullif(site,''),t.country,t.city,
    nullif(left(trim(coalesce(r->>'address','')),500),''),latitude,longitude,category,contacts_payload,
    jsonb_build_array(jsonb_build_object('source','overturemaps','place_id',uid,'release',j.release,
      'job_id',j.id,'record_sources',coalesce(r->'sources','[]'::jsonb),'location_source','overture_geometry')),
    'unverified','pending' from public.lead_discovery_tasks t where t.id=j.task_id
 on conflict(provider,provider_place_id) where provider_place_id is not null do nothing;
 get diagnostics aff=row_count;ins=ins+aff;
 if aff=0 then
  update public.lead_discovery_leads set
   map_lat=coalesce(map_lat,latitude),map_lng=coalesce(map_lng,longitude),
   map_category=coalesce(nullif(map_category,''),category),
   contacts=case when contacts='[]'::jsonb then contacts_payload else contacts end,
   website=coalesce(website,nullif(site,'')),updated_at=now()
  where provider='overture' and provider_place_id=uid
   and ((map_lat is null and map_lng is null) or
      (contacts='[]'::jsonb and contacts_payload<>'[]'::jsonb) or
      (website is null and site<>''));
  get diagnostics aff=row_count;located=located+aff;
  if aff=0 then sk=sk+1;end if;
 end if;
 end loop;
 update public.lead_map_search_jobs set processed=processed+jsonb_array_length(p_rows),
 inserted=inserted+ins,located_existing=located_existing+located,skipped=skipped+sk where id=j.id;
 return jsonb_build_object('inserted',ins,'located_existing',located,'skipped',sk);
end $$;
