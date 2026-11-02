-- Industry resources and incremental ingestion; CRM records remain the source of follow-up state.
create table if not exists public.freight_industry_directories (
 code text primary key check(code ~ '^[A-Z0-9_-]+$'), name text not null, industry text not null,
 region text not null default '全球', resource_type text not null default '行业名录', url text not null check(url ~ '^https?://'),
 priority integer not null default 2 check(priority between 1 and 3), enabled boolean not null default true,
 collection_mode text not null default '每日增量' check(collection_mode in ('每日增量','现有任务','资源参考')),
 access_status text not null default '待采集', notes text not null default '', cursor jsonb not null default '{}',
 last_checked_at timestamptz, updated_at timestamptz not null default now()
);
create table if not exists public.freight_directory_runs (
 id uuid primary key default gen_random_uuid(), directory_code text not null references public.freight_industry_directories(code),
 status text not null check(status in ('running','completed','partial','blocked','failed')),
 started_at timestamptz not null default now(), finished_at timestamptz,
 scanned integer not null default 0, new_companies integer not null default 0, new_contacts integer not null default 0,
 skipped integer not null default 0, message text not null default ''
);
create index if not exists freight_directory_runs_recent on public.freight_directory_runs(started_at desc);
create table if not exists public.freight_directory_entries (
 id uuid primary key default gen_random_uuid(), directory_code text not null references public.freight_industry_directories(code),
 source_url text not null check(source_url ~ '^https?://'), company_id text not null references public.freight_companies(id),
 company_name text not null, country text not null default '', industry text not null default '', website text not null default '',
 contact_state text not null default '待补全' check(contact_state in ('待补全','已有联系方式','已查暂无新线索')),
 evidence jsonb not null default '{}', first_collected_at timestamptz not null default now(), checked_at timestamptz not null default now(),
 unique(directory_code,source_url,company_name)
);
create index if not exists freight_directory_entries_recent on public.freight_directory_entries(first_collected_at desc);
create index if not exists freight_directory_entries_company on public.freight_directory_entries(company_id);
-- Match the existing CRM's two-person team, never all signed-in users.
do $$ declare t text; begin foreach t in array array['freight_industry_directories','freight_directory_runs','freight_directory_entries'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public, anon, authenticated',t);
 execute format('grant select,insert,update on public.%I to authenticated',t);
 if not exists(select 1 from pg_policies where schemaname='public' and tablename=t and policyname='directory_team') then
 execute format('create policy directory_team on public.%I for all to authenticated using ((select auth.uid())=any(array[''1520a854-1746-4add-af50-6605967bb72f''::uuid,''2c1dc7d7-ecc4-4992-9bca-301877e9cd66''::uuid])) with check ((select auth.uid())=any(array[''1520a854-1746-4add-af50-6605967bb72f''::uuid,''2c1dc7d7-ecc4-4992-9bca-301877e9cd66''::uuid]))',t);end if;
 end loop;end $$;
create or replace function public.freight_directory_ingest(p_code text,p_entries jsonb) returns jsonb
language plpgsql security invoker set search_path=public as $$
declare d public.freight_industry_directories; e jsonb; ct jsonb; cid text; ref jsonb; val text; channel_name text;
 new_c integer=0; new_t integer=0; n integer; matched integer; batch text; has_contact boolean;
begin
 select * into strict d from public.freight_industry_directories where code=p_code and enabled and collection_mode='每日增量';
 if jsonb_typeof(p_entries)<>'array' or jsonb_array_length(p_entries)>100 then raise exception '每批最多100家'; end if;
 perform pg_advisory_xact_lock(hashtext('freight_directory_ingest'));
 batch='DIR-'||to_char(now() at time zone 'Asia/Shanghai','YYYYMMDD');
 for e in select value from jsonb_array_elements(p_entries) loop
 if length(btrim(coalesce(e->>'company_name',''))) not between 2 and 240 or coalesce(e->>'source_url','') !~ '^https?://' then raise exception '企业名称或来源无效'; end if;
 cid=null;
 select company_id into cid from public.freight_directory_entries where directory_code=p_code and source_url=e->>'source_url' and company_name=e->>'company_name';
 if cid is null then
 select count(*),min(id) into matched,cid from public.freight_companies where lower(btrim(company_name))=lower(btrim(e->>'company_name')) and region<>'' and lower(region)=lower(btrim(coalesce(e->>'country','')));
 if matched<>1 then cid=null; end if;
 end if;
 ref=jsonb_build_object('source','行业名录','provider',p_code,'resource_name',d.name,'source_url',e->>'source_url','website',coalesce(e->>'website',''),'batch',batch);
 if cid is null then
 cid='dir-'||gen_random_uuid()::text;
 insert into public.freight_companies(id,company_name,status,role,industry,region,development_stage,source_refs)
 values(cid,btrim(e->>'company_name'),'潜在',case when d.industry='物流货代' then '同行' else '直客' end,coalesce(nullif(e->>'industry',''),d.industry),coalesce(e->>'country',''),'待开发',jsonb_build_array(ref));
 new_c=new_c+1;
 else
 update public.freight_companies set source_refs=source_refs||jsonb_build_array(ref),updated_at=now() where id=cid and not source_refs @> jsonb_build_array(jsonb_build_object('provider',p_code,'source_url',e->>'source_url'));
 end if;
 for ct in select value from jsonb_array_elements(coalesce(e->'contacts','[]')) loop
 channel_name=ct->>'channel';val=btrim(coalesce(ct->>'value',''));
 if channel_name not in ('邮箱','电话') or length(val) not between 3 and 500 then continue;end if;
 if channel_name='邮箱' then val=lower(val);if val !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then continue;end if;end if;
 if coalesce(ct->>'source_url','') !~ '^https?://' then continue;end if;
 insert into public.freight_contacts(id,company_id,name,channel,value,context,status,source_refs,email_allowed)
 select 'dir-contact-'||gen_random_uuid()::text,cid,coalesce(ct->>'name',''),channel_name,val,'公开来源采集；未验证邮箱投递性','有效',jsonb_build_array(ref||jsonb_build_object('contact_source_url',ct->>'source_url')),true
 where not exists(select 1 from public.freight_contacts where company_id=cid and channel=channel_name and lower(btrim(value))=lower(val));
 get diagnostics n=row_count;new_t=new_t+n;
 end loop;
 select exists(select 1 from public.freight_contacts where company_id=cid and channel in ('邮箱','电话') and status<>'失效') into has_contact;
 insert into public.freight_directory_entries(directory_code,source_url,company_id,company_name,country,industry,website,contact_state,evidence)
 values(p_code,e->>'source_url',cid,e->>'company_name',coalesce(e->>'country',''),coalesce(nullif(e->>'industry',''),d.industry),coalesce(e->>'website',''),case when has_contact then '已有联系方式' when coalesce((e->>'contact_checked')::boolean,false) then '已查暂无新线索' else '待补全' end,e)
 on conflict(directory_code,source_url,company_name) do update set website=case when excluded.website<>'' then excluded.website else freight_directory_entries.website end,contact_state=excluded.contact_state,evidence=excluded.evidence,checked_at=now();
 end loop;
 return jsonb_build_object('scanned',jsonb_array_length(p_entries),'new_companies',new_c,'new_contacts',new_t);
end $$;
revoke all on function public.freight_directory_ingest(text,jsonb) from public,anon;
grant execute on function public.freight_directory_ingest(text,jsonb) to authenticated;
