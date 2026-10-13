begin;
create table public.freight_rail_plans(id uuid primary key default gen_random_uuid(),origin text not null,destination text not null,status text not null check(status in ('draft','confirmed','inactive')),inputs jsonb not null,valid_from date,valid_until date,supersedes_id uuid references public.freight_rail_plans(id),created_by uuid default auth.uid() references auth.users(id),created_at timestamptz not null default now(),check(valid_from is null or valid_until is null or valid_from<=valid_until));
create index on public.freight_rail_plans(supersedes_id);
alter table public.freight_rail_plans enable row level security;
revoke all on public.freight_rail_plans from anon,authenticated;
grant select,insert on public.freight_rail_plans to authenticated;
do $$ declare access text;begin
select qual into access from pg_policies where tablename='suppliers' and policyname='supplier_hub_access';
execute format('create policy rail_read on public.freight_rail_plans for select to authenticated using (%s)',access);
execute format('create policy rail_insert on public.freight_rail_plans for insert to authenticated with check ((%s) and created_by=auth.uid())',access);
end $$;
commit;
