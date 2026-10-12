begin;
create table public.freight_knowledge_routes (
 id uuid primary key default gen_random_uuid(), code text not null unique,
 name text not null check(length(trim(name))>0), category text not null,
 origin text not null default '', destination text not null default '',
 nodes text not null default '', notes text not null default '',
 created_at timestamptz not null default now()
);
create table public.freight_knowledge_entries (
 id uuid primary key default gen_random_uuid(),
 route_id uuid not null references public.freight_knowledge_routes(id),
 supplier_id uuid references public.suppliers(id) on delete set null,
 title text not null check(length(trim(title))>0),
 kind text not null check(kind in ('航线档案','操作SOP','报价','单证要求','异常案例','其他')),
 content text not null default '', scope text not null default '',
 source text not null default '', source_date date, valid_until date,
 status text not null default '待确认' check(status in ('待确认','已核实','已过期','存在冲突')),
 version integer not null default 1, created_by uuid default auth.uid() references auth.users(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index on public.freight_knowledge_entries(route_id);
create index on public.freight_knowledge_entries(supplier_id);
create table public.freight_knowledge_documents (
 id uuid primary key default gen_random_uuid(), entry_id uuid not null references public.freight_knowledge_entries(id),
 file_name text not null, file_path text not null unique, mime_type text not null default '',
 file_size bigint not null check(file_size>0 and file_size<=20971520),
 created_at timestamptz not null default now()
);
create index on public.freight_knowledge_documents(entry_id);
create table public.freight_knowledge_versions (
 id uuid primary key default gen_random_uuid(), entry_id uuid not null references public.freight_knowledge_entries(id),
 version integer not null, snapshot jsonb not null, changed_by uuid default auth.uid(),
 created_at timestamptz not null default now(), unique(entry_id,version)
);
-- Match the existing Supplier Hub authorization rather than introducing new users.
do $$ declare access text; t text; begin
 select qual into access from pg_policies where schemaname='public' and tablename='suppliers' and policyname='supplier_hub_access';
 if access is null then raise exception 'Existing supplier authorization policy not found'; end if;
 foreach t in array array['freight_knowledge_routes','freight_knowledge_entries','freight_knowledge_documents'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon, authenticated',t);
  execute format('grant select,insert,update on public.%I to authenticated',t);
  execute format('create policy knowledge_access on public.%I for all to authenticated using (%s) with check (%s)',t,access,access);
 end loop;
 alter table public.freight_knowledge_versions enable row level security;
 revoke all on public.freight_knowledge_versions from anon, authenticated;
 grant select,insert on public.freight_knowledge_versions to authenticated;
 execute format('create policy knowledge_versions_read on public.freight_knowledge_versions for select to authenticated using (%s)',access);
 execute format('create policy knowledge_versions_append on public.freight_knowledge_versions for insert to authenticated with check (%s)',access);
 insert into storage.buckets(id,name,public,file_size_limit) values('freight-knowledge','freight-knowledge',false,20971520);
 execute format('create policy freight_knowledge_files_read on storage.objects for select to authenticated using (bucket_id = ''freight-knowledge'' and (%s))',access);
 execute format('create policy freight_knowledge_files_insert on storage.objects for insert to authenticated with check (bucket_id = ''freight-knowledge'' and (%s))',access);
 execute format('create policy freight_knowledge_files_cleanup on storage.objects for delete to authenticated using (bucket_id = ''freight-knowledge'' and (%s))',access);
end $$;
create function public.freight_knowledge_version() returns trigger language plpgsql security invoker set search_path = '' as $$
begin
 insert into public.freight_knowledge_versions(entry_id,version,snapshot) values(old.id,old.version,to_jsonb(old));
 new.version := old.version + 1; new.updated_at := now(); new.created_by := old.created_by; new.created_at := old.created_at;
 return new;
end $$;
create trigger freight_knowledge_history before update on public.freight_knowledge_entries for each row execute function public.freight_knowledge_version();
insert into public.freight_knowledge_routes(code,name,category) values
 ('EU-RAIL','中国—欧洲铁路','铁路'),('RU-RAIL','中国—俄罗斯铁路','铁路'),
 ('CA','中国—中亚','多式联运'),('IR','中国—伊朗','多式联运'),
 ('CN-BORDER','国内到口岸','铁路/公路'),('SEA','海运航线','海运'),('AIR','空运航线','空运'),('ROAD-MULTI','公路及多式联运','公路/联运');
comment on table public.freight_knowledge_versions is 'Historical entry snapshots. No update/delete grants; this is operational version history, not a compliance audit ledger.';
commit;
