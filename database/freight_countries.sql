create table public.freight_countries (
 iso2 text primary key check(iso2 ~ '^[A-Z]{2}$'),
 canonical_name text not null unique,
 name_zh text not null check(length(btrim(name_zh))>0), name_en text not null check(length(btrim(name_en))>0),
 iso3 text not null default '' check(iso3='' or iso3 ~ '^[A-Z]{3}$'),
 numeric_code text not null default '' check(numeric_code='' or numeric_code ~ '^[0-9]{3}$'),
 dial_code text not null default '', currency text not null default '', currency_symbol text not null default '',
 region text not null default '', subregion text not null default '', business_region text not null default '其他',
 aliases text[] not null default '{}',sort_order integer not null default 0,enabled boolean not null default true,
 notes text not null default '',revision integer not null default 1,updated_at timestamptz not null default now()
);
alter table public.freight_countries enable row level security;
revoke all on public.freight_countries from anon,authenticated;
grant select,insert,update on public.freight_countries to authenticated;
grant all on public.freight_countries to service_role;
do $$ declare predicate text; begin
 select qual into predicate from pg_policies where schemaname='public' and tablename='suppliers' and policyname='supplier_hub_access';
 if predicate is null then raise exception 'Supplier access policy is required'; end if;
 execute format('create policy country_read on public.freight_countries for select to authenticated using (%s)',predicate);
 execute format('create policy country_insert on public.freight_countries for insert to authenticated with check (%s)',predicate);
 execute format('create policy country_update on public.freight_countries for update to authenticated using (%s) with check (%s)',predicate,predicate);
end $$;
create function public.country_stamp() returns trigger language plpgsql security invoker set search_path='' as $$ begin
 if new.iso2<>old.iso2 or new.canonical_name<>old.canonical_name then raise exception '国家标识不可修改';end if;
 new.revision:=old.revision+1;new.updated_at:=now();return new;end $$;
revoke all on function public.country_stamp() from public,anon,authenticated;
create trigger country_stamp before update on public.freight_countries for each row execute function public.country_stamp();
