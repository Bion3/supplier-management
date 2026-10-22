begin;
create table public.freight_container_rental_rates(
 id uuid primary key default gen_random_uuid(),
 origin text not null check(length(trim(origin))>0),
 destination text not null check(length(trim(destination))>0),
 supplier_id uuid references public.suppliers(id),
 status text not null check(status in ('draft','confirmed','inactive')),
 quote jsonb not null check(jsonb_typeof(quote)='object'),
 supersedes_id uuid references public.freight_container_rental_rates(id),
 created_by uuid default auth.uid() references auth.users(id),
 created_at timestamptz not null default now()
);
create index container_rental_version_idx on public.freight_container_rental_rates(supersedes_id);
create index container_rental_supplier_idx on public.freight_container_rental_rates(supplier_id);
create unique index container_rental_single_successor on public.freight_container_rental_rates(supersedes_id) where supersedes_id is not null;
create unique index container_rental_source_cell on public.freight_container_rental_rates((quote->'source'->>'sha256'),(quote->'source'->>'cell'),(quote->>'container')) where supersedes_id is null and quote ? 'source';
alter table public.freight_container_rental_rates enable row level security;
revoke all on public.freight_container_rental_rates from anon,authenticated;
grant select,insert on public.freight_container_rental_rates to authenticated;
do $$ declare access text;begin
 select qual into access from pg_policies where schemaname='public' and tablename='suppliers' and policyname='supplier_hub_access';
 if access is null then raise exception 'Supplier access policy missing';end if;
 execute format('create policy container_rental_read on public.freight_container_rental_rates for select to authenticated using (%s)',access);
 execute format('create policy container_rental_insert on public.freight_container_rental_rates for insert to authenticated with check ((%s) and created_by=(select auth.uid()))',access);
end $$;
commit;
