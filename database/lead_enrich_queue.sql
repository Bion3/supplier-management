-- Durable lead website enrichment jobs, segregated from outbound mail.
create table if not exists public.lead_enrich_jobs(
 id uuid primary key default gen_random_uuid(),
 lead_id uuid not null unique references public.lead_discovery_leads(id) on delete cascade,
 owner_id uuid not null references auth.users(id),
 status text not null default 'queued' check(status in ('queued','running','completed','failed')),
 attempts integer not null default 0 check(attempts between 0 and 5),
 added_count integer not null default 0,
 checked_pages integer not null default 0,
 error text,
 started_at timestamptz, finished_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists lead_enrich_jobs_status on public.lead_enrich_jobs(status,created_at desc);
alter table public.lead_enrich_jobs enable row level security;
revoke all on public.lead_enrich_jobs from public,anon,authenticated;
grant select on public.lead_enrich_jobs to authenticated;
create policy lead_enrich_jobs_read on public.lead_enrich_jobs for select to authenticated
 using (owner_id = auth.uid() and exists(select 1 from public.lead_discovery_leads where id=lead_id));
-- Caller can queue reviewed-eligible records; no direct client writes to status.
create or replace function public.lead_enqueue_batch(p_ids uuid[]) returns uuid[]
language plpgsql security definer set search_path='' as $$
declare result uuid[]; total int;
begin
 if auth.uid() is null then raise exception '请登录 CRM'; end if;
 if not exists(select 1 from public.freight_companies limit 1) then
   -- RLS check alone cannot distinguish an empty authorized CRM, use existing allowlist policy via explicit membership.
   if auth.uid() <> all(array['1520a854-1746-4add-af50-6605967bb72f'::uuid,'2c1dc7d7-ecc4-4992-9bca-301877e9cd66'::uuid]) then raise exception '无权使用 CRM'; end if;
 end if;
 total:=coalesce(cardinality(p_ids),0);
 if total=0 or total>500 then raise exception '一次请选择1至500家企业'; end if;
 if exists(select 1 from unnest(p_ids) x where x is null) then raise exception '企业编号无效'; end if;
 insert into public.lead_enrich_jobs(lead_id,owner_id)
 select distinct l.id,auth.uid() from public.lead_discovery_leads l
 where l.id=any(p_ids) and l.crm_company_id is null and l.provider<>'google_places'
   and l.website ~* '^https://' and length(l.website)<500
 on conflict (lead_id) do update set
 owner_id=excluded.owner_id,status='queued',attempts=0,error=null,finished_at=null,updated_at=now()
 where public.lead_enrich_jobs.status='failed';
 select array_agg(j.id) into result from public.lead_enrich_jobs j
 where j.lead_id=any(p_ids) and j.status='queued' and j.owner_id=auth.uid();
 return coalesce(result,array[]::uuid[]);
end $$;
revoke all on function public.lead_enqueue_batch(uuid[]) from public,anon;
grant execute on function public.lead_enqueue_batch(uuid[]) to authenticated;

create schema if not exists lead_private;
revoke all on schema lead_private from public;
create table if not exists lead_private.worker_credentials(id integer primary key check(id=1),secret_hash text not null);
revoke all on lead_private.worker_credentials from public,anon,authenticated;
alter table lead_private.worker_credentials enable row level security;

create or replace function public.lead_enrich_worker(p_secret text,p_action text,p_job_id uuid,p_result jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
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
  if not found or lead.crm_company_id is not null or lead.provider='google_places' or lead.website not like 'https://%' then
   update public.lead_enrich_jobs set status='failed',error='官网无效或企业已入库',finished_at=now(),updated_at=now() where id=job.id;
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
 if not found or lead.crm_company_id is not null then
  update public.lead_enrich_jobs set status='failed',error='企业已导入或不存在',finished_at=now(),updated_at=now() where id=job.id;
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
 verification_status='website_found_unverified',review_status='pending',updated_at=now()
 where id=lead.id;
 update public.lead_enrich_jobs set status='completed',added_count=n,
 checked_pages=least(3,greatest(0,coalesce((p_result->>'checked_pages')::integer,0))),
 error=null,finished_at=now(),updated_at=now() where id=job.id;
 return jsonb_build_object('finished',true,'added',n);
end $$;
revoke all on function public.lead_enrich_worker(text,text,uuid,jsonb) from public,anon;
grant execute on function public.lead_enrich_worker(text,text,uuid,jsonb) to anon;
