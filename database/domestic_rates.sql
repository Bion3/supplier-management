begin;
create table public.freight_domestic_rates (
 id uuid primary key default gen_random_uuid(),
 kind text not null check(kind in ('pickup','linehaul')),
 origin text not null, destination text not null,
 supplier_id uuid references public.suppliers(id),
 status text not null default 'draft' check(status in ('draft','confirmed','inactive')),
 quote jsonb not null check(jsonb_typeof(quote)='object'),
 source_key text unique,
 supersedes_id uuid references public.freight_domestic_rates(id),
 created_by uuid default auth.uid() references auth.users(id),
 created_at timestamptz not null default now()
);
create index on public.freight_domestic_rates(supplier_id);
create index on public.freight_domestic_rates(supersedes_id);
alter table public.freight_domestic_rates enable row level security;
revoke all on public.freight_domestic_rates from anon,authenticated;
grant select,insert on public.freight_domestic_rates to authenticated;
do $$ declare access text;begin
select qual into access from pg_policies where tablename='suppliers' and policyname='supplier_hub_access';
if access is null then raise exception 'Missing authorization';end if;
execute format('create policy domestic_read on public.freight_domestic_rates for select to authenticated using (%s)',access);
execute format('create policy domestic_insert on public.freight_domestic_rates for insert to authenticated with check ((%s) and created_by=auth.uid())',access);
end $$;
commit;
