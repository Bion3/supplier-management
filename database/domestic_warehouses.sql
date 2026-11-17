create table public.domestic_warehouses (
 id uuid primary key default gen_random_uuid(),
 name text not null check(length(btrim(name)) between 1 and 120),
 warehouse_type text not null check(warehouse_type in ('集货仓','装箱仓','拆箱仓')),
 port text not null default '', supplier text not null default '', country text not null default '中国',
 address text not null default '', charges text not null default '', hours text not null default '',
 contact text not null default '', phone text not null default '', notes text not null default '',
 enabled boolean not null default true, revision integer not null default 1,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index domestic_warehouses_name on public.domestic_warehouses(name,id);
create index domestic_warehouses_type on public.domestic_warehouses(warehouse_type,name,id);
create index domestic_warehouses_port on public.domestic_warehouses(port,name,id);
alter table public.domestic_warehouses enable row level security;
revoke all on public.domestic_warehouses from anon,authenticated;
grant select,insert,update on public.domestic_warehouses to authenticated;
grant all on public.domestic_warehouses to service_role;
do $$ declare predicate text; begin
 select qual into predicate from pg_policies where schemaname='public' and tablename='suppliers' and policyname='supplier_hub_access';
 if predicate is null then raise exception 'Supplier access policy is required'; end if;
 execute format('create policy warehouse_read on public.domestic_warehouses for select to authenticated using (%s)',predicate);
 execute format('create policy warehouse_insert on public.domestic_warehouses for insert to authenticated with check (%s)',predicate);
 execute format('create policy warehouse_update on public.domestic_warehouses for update to authenticated using (%s) with check (%s)',predicate,predicate);
end $$;
create function public.domestic_warehouse_stamp() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.id<>old.id then raise exception '仓库标识不可修改'; end if;
 new.revision:=old.revision+1; new.updated_at:=now(); new.created_at:=old.created_at;
 return new;
end $$;
revoke all on function public.domestic_warehouse_stamp() from public,anon,authenticated;
create trigger domestic_warehouse_stamp before update on public.domestic_warehouses for each row execute function public.domestic_warehouse_stamp();
