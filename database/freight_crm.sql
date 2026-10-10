-- First phase CRM, separate from existing customer/order tables.
create table public.freight_companies (
 id text primary key, company_name text not null check(length(trim(company_name))>0),
 status text not null default '待核实' check(status in ('待核实','潜在','正在跟进','合作中','沉睡','流失')),
 role text not null default '待核实', owner text not null default '', industry text not null default '',
 current_routes text not null default '', notes text not null default '',
 addresses jsonb not null default '[]', english_blocks jsonb not null default '[]',
 source_refs jsonb not null default '[]', historical_routes jsonb not null default '[]',
 shipment_count integer not null default 0, first_shipment date, last_shipment date,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.freight_contacts (
 id text primary key, company_id text not null references public.freight_companies(id),
 name text not null default '', channel text not null check(channel in ('邮箱','电话','微信')),
 value text not null, context text not null default '', status text not null default '待核实'
 check(status in ('待核实','有效','失效')), source_refs jsonb not null default '[]',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index freight_contacts_company on public.freight_contacts(company_id);
create table public.freight_sources (
 id text primary key, company_id text references public.freight_companies(id), sheet text not null,
 row_number integer not null, raw jsonb not null,
 source_filename text not null, source_sha256 text not null,
 unique(source_sha256,sheet,row_number)
);
create index freight_sources_company on public.freight_sources(company_id);
create table public.freight_shipments (
 id text primary key, company_id text not null references public.freight_companies(id),
 source_id text not null references public.freight_sources(id), train_date date,
 origin text not null default '', destination text not null default '',
 container_type text not null default '', container_quantity numeric, pickup_raw text not null default ''
);
create index freight_shipments_company on public.freight_shipments(company_id,train_date desc);
create table public.freight_followups (
 id uuid primary key default gen_random_uuid(), company_id text not null references public.freight_companies(id),
 result text not null check(length(trim(result))>0), next_action text not null default '',
 next_date date, owner_id uuid not null default auth.uid() references auth.users(id),
 created_at timestamptz not null default now()
);
create index freight_followups_company on public.freight_followups(company_id,created_at desc);
create index freight_followups_due on public.freight_followups(next_date);
-- Match the supplier application's existing explicit account allowlist.
do $$ declare t text; allowed text; begin
 select qual into allowed from pg_policies where schemaname='public' and tablename='suppliers' and policyname='supplier_hub_access';
 if allowed is null then raise exception 'Existing supplier access policy missing'; end if;
 foreach t in array array['freight_companies','freight_contacts','freight_sources','freight_shipments','freight_followups'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon, authenticated',t);
  execute format('grant select, insert, update on public.%I to authenticated',t);
  execute format('create policy freight_crm_access on public.%I for all to authenticated using (%s) with check (%s)',t,allowed,allowed);
 end loop;
end $$;
