create table public.freight_exhibitions (
 id uuid primary key default gen_random_uuid(),name text not null check(length(trim(name)) between 1 and 240),edition text not null default '' check(length(edition)<=80),
 country text not null default '',region text not null default '',city text not null default '',venue text not null default '',industry text not null default '',organizer text not null default '',
 starts_on date,ends_on date,website text not null default '',directory_url text not null default '',source_url text not null check(source_url ~ '^https?://'),
 status text not null default '待核实' check(status in ('待核实','已核实','延期','取消')),directory_status text not null default '未收集' check(directory_status in ('未收集','收集中','待核实','已整理')),
 notes text not null default '',verified_on date,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 check(ends_on is null or starts_on is null or ends_on>=starts_on)
);
create unique index freight_exhibitions_identity on public.freight_exhibitions(lower(trim(name)),lower(trim(edition)),lower(trim(country)),lower(trim(city)));
create index freight_exhibitions_dates on public.freight_exhibitions(starts_on);
create table public.freight_exhibitors (
 id uuid primary key default gen_random_uuid(),exhibition_id uuid not null references public.freight_exhibitions(id) on delete restrict,
 company_name text not null check(length(trim(company_name)) between 1 and 240),country text not null default '',city text not null default '',industry text not null default '',
 company_type text not null default '待分类' check(company_type in ('待分类','进口商','批发商','分销商','制造商','货代','海外代理','服务商','其他')),
 products text not null default '',booth text not null default '',catalog_edition text not null default '待核实',website text not null default '',contact_name text not null default '',email text not null default '',phone text not null default '',
 source_url text not null check(source_url ~ '^https?://'),status text not null default '待核实' check(status in ('待核实','已核实','失效')),tags text[] not null default '{}',notes text not null default '',
 collected_on date not null default current_date,verified_on date,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create unique index freight_exhibitors_identity on public.freight_exhibitors(exhibition_id,lower(trim(company_name)),lower(trim(country)));
create index freight_exhibitors_exhibition on public.freight_exhibitors(exhibition_id);
alter table public.freight_exhibitions enable row level security;
alter table public.freight_exhibitors enable row level security;
revoke all on public.freight_exhibitions,public.freight_exhibitors from public,anon,authenticated;
grant select,insert,update,delete on public.freight_exhibitions,public.freight_exhibitors to authenticated;
create policy exhibitions_team on public.freight_exhibitions for all to authenticated using ((select auth.uid())=any(array['1520a854-1746-4add-af50-6605967bb72f'::uuid,'2c1dc7d7-ecc4-4992-9bca-301877e9cd66'::uuid])) with check ((select auth.uid())=any(array['1520a854-1746-4add-af50-6605967bb72f'::uuid,'2c1dc7d7-ecc4-4992-9bca-301877e9cd66'::uuid]));
create policy exhibitors_team on public.freight_exhibitors for all to authenticated using ((select auth.uid())=any(array['1520a854-1746-4add-af50-6605967bb72f'::uuid,'2c1dc7d7-ecc4-4992-9bca-301877e9cd66'::uuid])) with check ((select auth.uid())=any(array['1520a854-1746-4add-af50-6605967bb72f'::uuid,'2c1dc7d7-ecc4-4992-9bca-301877e9cd66'::uuid]));
