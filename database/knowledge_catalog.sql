begin;
create table public.freight_knowledge_sources (
 id uuid primary key default gen_random_uuid(), import_key text unique,
 file_name text not null check(length(trim(file_name))>0),
 version_label text not null default '日期待确认', source_date date, effective_from date, valid_until date,
 supersedes_id uuid references public.freight_knowledge_sources(id),
 local_path text not null default '', notes text not null default '',
 created_at timestamptz not null default now(), check(supersedes_id is distinct from id),
 check(effective_from is null or valid_until is null or effective_from<=valid_until)
);
create index on public.freight_knowledge_sources(supersedes_id);
create table public.freight_knowledge_stations (
 id uuid primary key default gen_random_uuid(), import_key text unique,
 name text not null check(length(trim(name))>0), raw_name text not null default '',
 english_name text not null default '', country text not null default '',
 node_type text not null default '待确认', aliases text not null default '',
 code_raw text not null default '', code_system text not null default '未确认',
 status text not null default '待确认' check(status in ('待确认','已核实','存在冲突','已过期')),
 source_id uuid references public.freight_knowledge_sources(id), source_location text not null default '',
 notes text not null default '', created_at timestamptz not null default now()
);
create index on public.freight_knowledge_stations(source_id);
alter table public.freight_knowledge_entries
 add column source_id uuid references public.freight_knowledge_sources(id),
 add column station_id uuid references public.freight_knowledge_stations(id),
 add column shipment_type text not null default '',
 add column effective_from date,
 add column revision_note text not null default '',
 add column supersedes_id uuid references public.freight_knowledge_entries(id),
 add column import_key text unique,
 add constraint knowledge_date_range check(effective_from is null or valid_until is null or effective_from<=valid_until),
 add constraint knowledge_no_self_supersede check(supersedes_id is distinct from id);
create index on public.freight_knowledge_entries(source_id);
create index on public.freight_knowledge_entries(station_id);
create index on public.freight_knowledge_entries(supersedes_id);
do $$ declare access text; t text; begin
 select qual into access from pg_policies where schemaname='public' and tablename='suppliers' and policyname='supplier_hub_access';
 if access is null then raise exception 'Missing supplier authorization';end if;
 foreach t in array array['freight_knowledge_sources','freight_knowledge_stations'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon,authenticated',t);
 execute format('grant select,insert,update on public.%I to authenticated',t);
 execute format('create policy knowledge_catalog_access on public.%I for all to authenticated using (%s) with check (%s)',t,access,access);
 end loop;
end $$;
insert into public.freight_knowledge_routes(code,name,category,notes) values
 ('GENERAL','通用操作与资料','通用','内部流程、模板和资料来源；实际要求按站点和版本另行确认'),
 ('XI-EXPORT','西安出口铁路','铁路','城市/发站作业资料；具体目的站、口岸和路径按单票运输方案确定')
 on conflict(code) do nothing;
commit;
