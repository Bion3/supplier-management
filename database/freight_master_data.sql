-- Shared locations and charge definitions. Rates and historical quotations stay in their own tables.
create table public.freight_master_data (
 id uuid primary key default gen_random_uuid(),
 kind text not null check (kind in ('location','charge')),
 code text not null check (code ~ '^[A-Z0-9][A-Z0-9_-]{1,39}$'),
 name_zh text not null check (length(btrim(name_zh)) between 1 and 120),
 name_en text not null default '',
 category text not null default 'other',
 country text not null default '', city text not null default '',
 roles text[] not null default array['origin','destination']::text[] check (roles <@ array['origin','destination','transit']::text[]),
 aliases text[] not null default '{}',
 unit text not null default '',
 notes text not null default '',
 enabled boolean not null default true,
 revision integer not null default 1,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(kind,code)
);
create index freight_master_data_kind_enabled on public.freight_master_data(kind,enabled,name_zh,id);
alter table public.freight_master_data enable row level security;
revoke all on public.freight_master_data from anon,authenticated;
grant select,insert,update on public.freight_master_data to authenticated;
grant all on public.freight_master_data to service_role;
-- Reuse the existing internal supplier access predicate, including any future account changes at migration time.
do $$ declare predicate text; begin
 select qual into predicate from pg_policies where schemaname='public' and tablename='suppliers' and policyname='supplier_hub_access';
 if predicate is null then raise exception 'Supplier access policy is required'; end if;
 execute format('create policy master_read on public.freight_master_data for select to authenticated using (%s)',predicate);
 execute format('create policy master_insert on public.freight_master_data for insert to authenticated with check (%s)',predicate);
 execute format('create policy master_update on public.freight_master_data for update to authenticated using (%s) with check (%s)',predicate,predicate);
end $$;
create function public.freight_master_stamp() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.id<>old.id or new.kind<>old.kind or new.code<>old.code then raise exception '档案编号和类型不可修改'; end if;
 new.revision:=old.revision+1; new.updated_at:=now(); new.created_at:=old.created_at;
 return new;
end $$;
revoke all on function public.freight_master_stamp() from public,anon,authenticated;
create trigger freight_master_stamp before update on public.freight_master_data for each row execute function public.freight_master_stamp();
