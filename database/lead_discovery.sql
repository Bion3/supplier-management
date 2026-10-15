-- Run in Supabase SQL editor after freight_crm.sql. No scraping is triggered by this migration.
create table if not exists public.lead_discovery_tasks (
 id uuid primary key default gen_random_uuid(),
 country text not null, city text not null,
 source text not null default 'openstreetmap' check(source in ('openstreetmap','google_places','overture')),
 keywords jsonb not null default '[]'::jsonb,
 target_count integer not null default 100 check(target_count between 1 and 1000),
 status text not null default 'pending' check(status in ('pending','running','completed','failed','cancelled')),
 error_message text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.lead_discovery_leads (
 id uuid primary key default gen_random_uuid(),
 task_id uuid references public.lead_discovery_tasks(id) on delete set null,
 provider text not null default 'google_places', provider_place_id text,
 company_name text not null, website text, country text, city text, address text,
 contacts jsonb not null default '[]'::jsonb,
 source_evidence jsonb not null default '[]'::jsonb,
 verification_status text not null default 'unverified',
 review_status text not null default 'pending' check(review_status in ('pending','reviewed','rejected')),
 crm_company_id text references public.freight_companies(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index if not exists lead_discovery_provider_id on public.lead_discovery_leads(provider,provider_place_id) where provider_place_id is not null;
create index if not exists lead_discovery_task_idx on public.lead_discovery_leads(task_id,created_at desc);
-- Match existing CRM explicit account allowlist, not all logged-in users.
do $$ declare t text; allowed text; begin
 select qual into allowed from pg_policies where schemaname='public' and tablename='freight_companies' and policyname='freight_crm_access';
 if allowed is null then raise exception 'CRM access policy missing'; end if;
 foreach t in array array['lead_discovery_tasks','lead_discovery_leads'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon,authenticated',t);
 execute format('grant select,insert,update on public.%I to authenticated',t);
 execute format('create policy lead_discovery_access on public.%I for all to authenticated using (%s) with check (%s)',t,allowed,allowed);
 end loop;
end $$;

-- Existing installations: run this separately if upgrading from Google-only schema.
-- alter table public.lead_discovery_tasks drop constraint if exists lead_discovery_tasks_source_check;
-- alter table public.lead_discovery_tasks add constraint lead_discovery_tasks_source_check check(source in ('openstreetmap','google_places','overture'));
-- alter table public.lead_discovery_tasks alter column source set default 'openstreetmap';
