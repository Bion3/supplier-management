-- Operator report snapshots. Access follows the existing CRM team allowlist.
create table if not exists public.freight_tracking_imports (
 id text primary key, filename text not null, operator text not null,
 as_of date not null, train_count integer not null default 0,
 incident_count integer not null default 0, status text not null default 'pending' check(status in ('pending','complete')),
 domestic jsonb not null default '[]', created_at timestamptz not null default now()
);
create table if not exists public.freight_tracking_reports (
 id text primary key, import_id text not null references public.freight_tracking_imports(id),
 operator text not null, train_key text not null, as_of date not null,
 summary jsonb not null, detail jsonb not null,
 unique(import_id,operator,train_key)
);
create index if not exists tracking_reports_lookup on public.freight_tracking_reports(operator,train_key,as_of desc);
alter table public.freight_tracking_reports add column if not exists superseded boolean not null default false;
create table if not exists public.freight_tracking_incidents (
 id text primary key, import_id text not null references public.freight_tracking_imports(id),
 operator text not null, train_key text not null, as_of date not null, detail jsonb not null
);
alter table public.freight_tracking_imports enable row level security;
alter table public.freight_tracking_reports enable row level security;
alter table public.freight_tracking_incidents enable row level security;
do $$ declare t text; begin
 foreach t in array array['freight_tracking_imports','freight_tracking_reports','freight_tracking_incidents'] loop
  execute format('create policy tracking_team on public.%I for all to authenticated using ((select auth.uid()) = any(array[''1520a854-1746-4add-af50-6605967bb72f''::uuid,''2c1dc7d7-ecc4-4992-9bca-301877e9cd66''::uuid])) with check ((select auth.uid()) = any(array[''1520a854-1746-4add-af50-6605967bb72f''::uuid,''2c1dc7d7-ecc4-4992-9bca-301877e9cd66''::uuid]))',t);
 end loop;
end $$;
grant select,insert,update on public.freight_tracking_imports to authenticated;
grant select,insert on public.freight_tracking_reports,public.freight_tracking_incidents to authenticated;
revoke all on public.freight_tracking_imports,public.freight_tracking_reports,public.freight_tracking_incidents from anon;
create or replace view public.freight_tracking_latest with (security_invoker=true) as
 select distinct on (r.operator,r.train_key) r.id,r.import_id,r.operator,r.train_key,r.as_of,r.summary
 from public.freight_tracking_reports r join public.freight_tracking_imports i on i.id=r.import_id
 where i.status='complete' and not r.superseded order by r.operator,r.train_key,r.as_of desc,i.created_at desc;
grant select on public.freight_tracking_latest to authenticated;
create or replace view public.freight_tracking_latest_incidents with (security_invoker=true) as
 select distinct on (r.operator,r.train_key,r.detail->>'container',r.detail->>'problem') r.id,r.operator,r.train_key,r.as_of,r.detail
 from public.freight_tracking_incidents r join public.freight_tracking_imports i on i.id=r.import_id
 where i.status='complete' order by r.operator,r.train_key,r.detail->>'container',r.detail->>'problem',r.as_of desc,i.created_at desc;
grant select on public.freight_tracking_latest_incidents to authenticated;
