-- Bounded asynchronous regional lead searches. Operators queue; one-purpose worker claims.
create table if not exists public.lead_map_search_jobs(
 id uuid primary key default gen_random_uuid(),
 task_id uuid not null references public.lead_discovery_tasks(id),
 owner_id uuid not null default auth.uid(),
 city text not null,
 center_lat double precision not null check(center_lat between -90 and 90),
 center_lng double precision not null check(center_lng between -180 and 180),
 radius_km integer not null check(radius_km in (10,25,50,100)),
 keyword text not null check(length(keyword) between 2 and 80),
 customer_type text not null check(customer_type in ('freight','trade','wholesale','all')),
 release text not null default '2026-09-23.1',
 status text not null default 'queued' check(status in ('queued','running','completed','failed')),
 processed integer not null default 0,
 inserted integer not null default 0,
 located_existing integer not null default 0,
 skipped integer not null default 0,
 error_message text,
 created_at timestamptz not null default now(),
 started_at timestamptz,
 completed_at timestamptz
);
create index if not exists lead_map_search_jobs_queue on public.lead_map_search_jobs(status,created_at);
alter table public.lead_map_search_jobs enable row level security;
revoke all on public.lead_map_search_jobs from anon,authenticated;
grant select,insert on public.lead_map_search_jobs to authenticated;
do $$
declare allowed text;
begin
 select qual into allowed from pg_policies where schemaname='public' and tablename='freight_companies' and policyname='freight_crm_access';
 if allowed is null then raise exception 'freight CRM policy missing';end if;
 drop policy if exists lead_map_jobs_read on public.lead_map_search_jobs;
 execute format('create policy lead_map_jobs_read on public.lead_map_search_jobs for select to authenticated using ((%s) and owner_id=auth.uid())',allowed);
 drop policy if exists lead_map_jobs_insert on public.lead_map_search_jobs;
 execute format('create policy lead_map_jobs_insert on public.lead_map_search_jobs for insert to authenticated with check ((%s) and owner_id=auth.uid() and status=''queued'' and processed=0 and inserted=0 and skipped=0 and error_message is null and started_at is null and completed_at is null and exists(select 1 from public.lead_discovery_tasks t where t.id=task_id and t.source=''overture'' and lower(t.city)=lower(city)))',allowed);
end $$;
create or replace function public.lead_map_worker_claim(p_secret text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.lead_map_search_jobs;
begin
 if p_secret is null or not exists(select 1 from lead_private.overture_ingest_credentials
    where id=1 and secret_sha256=pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_secret,'UTF8')),'hex'))
 then raise exception 'invalid worker credential';end if;
 -- Old in-flight jobs can be retried safely: lead ID uniqueness guards duplicate rows.
 update public.lead_map_search_jobs
 set status='queued',error_message='Previous attempt timed out'
 where status='running' and started_at<now()-interval '70 minutes';
 select * into j from public.lead_map_search_jobs where status='queued'
 order by created_at for update skip locked limit 1;
 if not found then return '{}'::jsonb;end if;
 update public.lead_map_search_jobs set status='running',started_at=now(),error_message=null where id=j.id;
 return jsonb_build_object('id',j.id,'task_id',j.task_id,'city',j.city,'center_lat',j.center_lat,
  'center_lng',j.center_lng,'radius_km',j.radius_km,'keyword',j.keyword,
  'customer_type',j.customer_type,'release',j.release);
end $$;
create or replace function public.lead_map_worker_ingest(p_secret text,p_job_id uuid,p_rows jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.lead_map_search_jobs;r jsonb;uid text;company text;site text;category text;latitude double precision;longitude double precision;aff integer;ins integer:=0;located integer:=0;sk integer:=0;km double precision;
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
 insert into public.lead_discovery_leads(task_id,provider,provider_place_id,company_name,website,country,city,address,
    map_lat,map_lng,map_category,contacts,source_evidence,verification_status,review_status)
 select j.task_id,'overture',uid,company,nullif(site,''),t.country,t.city,
    nullif(left(trim(coalesce(r->>'address','')),500),''),latitude,longitude,category,'[]'::jsonb,
    jsonb_build_array(jsonb_build_object('source','overturemaps','place_id',uid,'release',j.release,
      'job_id',j.id,'record_sources',coalesce(r->'sources','[]'::jsonb),'location_source','overture_geometry')),
    'unverified','pending' from public.lead_discovery_tasks t where t.id=j.task_id
 on conflict(provider,provider_place_id) where provider_place_id is not null do nothing;
 get diagnostics aff=row_count;ins=ins+aff;
 if aff=0 then
  update public.lead_discovery_leads set map_lat=latitude,map_lng=longitude,
    map_category=coalesce(nullif(map_category,''),category),updated_at=now()
  where provider='overture' and provider_place_id=uid and map_lat is null and map_lng is null;
  get diagnostics aff=row_count;located=located+aff;
  if aff=0 then sk=sk+1;end if;
 end if;
 end loop;
 update public.lead_map_search_jobs set processed=processed+jsonb_array_length(p_rows),
 inserted=inserted+ins,located_existing=located_existing+located,skipped=sk where id=j.id;
 return jsonb_build_object('inserted',ins,'located_existing',located,'skipped',sk);
end $$;
create or replace function public.lead_map_worker_finish(p_secret text,p_job_id uuid,p_error text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.lead_map_search_jobs;
begin
 if p_secret is null or not exists(select 1 from lead_private.overture_ingest_credentials where id=1 and
 secret_sha256=pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_secret,'UTF8')),'hex')) then raise exception 'invalid worker credential';end if;
 update public.lead_map_search_jobs set status=case when p_error is null then 'completed' else 'failed' end,
 error_message=left(p_error,500),completed_at=now() where id=p_job_id and status='running' returning * into j;
 if not found then raise exception 'job not running';end if;
 return jsonb_build_object('status',j.status,'processed',j.processed,'inserted',j.inserted,'located_existing',j.located_existing,'skipped',j.skipped);
end $$;
revoke all on function public.lead_map_worker_claim(text),public.lead_map_worker_ingest(text,uuid,jsonb),public.lead_map_worker_finish(text,uuid,text) from public,authenticated;
grant execute on function public.lead_map_worker_claim(text),public.lead_map_worker_ingest(text,uuid,jsonb),public.lead_map_worker_finish(text,uuid,text) to anon;
