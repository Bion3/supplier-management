begin;
create table public.freight_cost_snapshots(
 id uuid primary key default gen_random_uuid(),
 route text not null,
 inputs jsonb not null check(jsonb_typeof(inputs)='object'),
 result jsonb not null check(jsonb_typeof(result)='object'),
 created_by uuid not null default auth.uid() references auth.users(id),
 created_at timestamptz not null default now()
);
alter table public.freight_cost_snapshots enable row level security;
revoke all on public.freight_cost_snapshots from anon,authenticated;
grant select,insert on public.freight_cost_snapshots to authenticated;
do $$ declare access text; begin
 select qual into access from pg_policies where schemaname='public' and tablename='suppliers' and policyname='supplier_hub_access';
 if access is null then raise exception 'Missing supplier authorization';end if;
 execute format('create policy cost_read on public.freight_cost_snapshots for select to authenticated using (%s)',access);
 execute format('create policy cost_insert on public.freight_cost_snapshots for insert to authenticated with check ((%s) and created_by=auth.uid())',access);
end $$;
commit;
