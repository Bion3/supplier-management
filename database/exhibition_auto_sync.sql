alter table public.freight_exhibitions add column auto_update boolean not null default true,add column last_crawled_at timestamptz,add column last_crawl_status text not null default '',add column last_crawl_error text not null default '',add column auto_snapshot jsonb not null default '{}',add column pending_updates jsonb not null default '{}';
create table public.freight_exhibition_sync_runs(id uuid primary key default gen_random_uuid(),started_at timestamptz not null default now(),finished_at timestamptz,status text not null check(status in ('success','partial','failed')),scanned integer not null default 0,added integer not null default 0,filled integer not null default 0,pending integer not null default 0,failed integer not null default 0,summary text not null default '',errors jsonb not null default '[]');
alter table public.freight_exhibition_sync_runs enable row level security;
revoke all on public.freight_exhibition_sync_runs from public,anon,authenticated;
grant select,insert,update on public.freight_exhibition_sync_runs to authenticated;
create policy exhibition_sync_team on public.freight_exhibition_sync_runs for all to authenticated using ((select auth.uid())=any(array['1520a854-1746-4add-af50-6605967bb72f'::uuid,'2c1dc7d7-ecc4-4992-9bca-301877e9cd66'::uuid])) with check ((select auth.uid())=any(array['1520a854-1746-4add-af50-6605967bb72f'::uuid,'2c1dc7d7-ecc4-4992-9bca-301877e9cd66'::uuid]));
create index exhibition_sync_runs_started on public.freight_exhibition_sync_runs(started_at desc);
create or replace function public.freight_record_exhibition_scan(p_items jsonb,p_errors jsonb default '[]',p_summary text default '') returns jsonb language plpgsql security invoker set search_path='' as $$
declare item jsonb;facts jsonb;old public.freight_exhibitions;newrow public.freight_exhibitions;patch jsonb;changes jsonb;k text;v text;oldv text;url text;rid uuid;n_scanned integer:=0;n_added integer:=0;n_filled integer:=0;n_pending integer:=0;errs jsonb:=p_errors;date_conflict boolean;result jsonb;
begin
 if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)>30 or jsonb_typeof(p_errors)<>'array' or jsonb_array_length(p_errors)>30 then raise exception '单次最多处理30条来源';end if;
 insert into public.freight_exhibition_sync_runs(status,summary) values('success',left(p_summary,2000)) returning id into rid;
 for item in select value from jsonb_array_elements(p_items) loop
  begin
   facts:=item->'facts';url:=item->>'source_url';
   if jsonb_typeof(facts)<>'object' or coalesce(url,'')!~ '^https?://[^[:space:]@]+$' or length(url)>1500 then raise exception '展会来源或内容格式无效';end if;
   if length(coalesce(item->>'excerpt',''))>600 then raise exception '来源摘录过长';end if;
   if facts ? 'starts_on' and facts->>'starts_on' is not null and facts->>'starts_on'<>'' then perform (facts->>'starts_on')::date;end if;
   if facts ? 'ends_on' and facts->>'ends_on' is not null and facts->>'ends_on'<>'' then perform (facts->>'ends_on')::date;end if;
   if nullif(facts->>'ends_on','')::date<nullif(facts->>'starts_on','')::date then raise exception '展期起止日期矛盾';end if;
   if facts ? 'status' and facts->>'status' not in ('待核实','已核实','延期','取消') then raise exception '展会状态无效';end if;
   foreach k in array array['website','directory_url'] loop if coalesce(facts->>k,'')<>'' and facts->>k !~ '^https?://[^[:space:]@]+$' then raise exception '链接格式无效';end if;end loop;
   old:=null;
   if coalesce(item->>'existing_id','')<>'' then select * into old from public.freight_exhibitions where id=(item->>'existing_id')::uuid for update;if old.id is null then raise exception '目标展会不存在';end if;
   else select * into old from public.freight_exhibitions where lower(trim(name))=lower(trim(facts->>'name')) and lower(trim(edition))=lower(trim(coalesce(facts->>'edition',''))) and lower(trim(country))=lower(trim(coalesce(facts->>'country',''))) and lower(trim(city))=lower(trim(coalesce(facts->>'city',''))) for update;end if;
   if old.id is null then
    if length(trim(coalesce(facts->>'name','')))=0 or length(trim(coalesce(facts->>'edition','')))=0 or length(trim(coalesce(facts->>'country','')))=0 then raise exception '新展会缺少名称、届次或国家';end if;
    insert into public.freight_exhibitions(name,edition,country,city,region,industry,venue,organizer,starts_on,ends_on,website,directory_url,source_url,status,last_crawled_at,last_crawl_status,auto_snapshot)
     values(trim(facts->>'name'),trim(facts->>'edition'),trim(facts->>'country'),coalesce(facts->>'city',''),coalesce(facts->>'region',''),coalesce(facts->>'industry',''),coalesce(facts->>'venue',''),coalesce(facts->>'organizer',''),nullif(facts->>'starts_on','')::date,nullif(facts->>'ends_on','')::date,coalesce(facts->>'website',''),coalesce(facts->>'directory_url',''),url,'待核实',now(),'成功',jsonb_build_object('facts',facts,'source_url',url,'excerpt',left(item->>'excerpt',600),'seen_at',now()));
    n_added:=n_added+1;n_scanned:=n_scanned+1;continue;
   end if;
   if not old.auto_update then continue;end if;
   -- Identity and manual notes/classification are never overwritten by a scan.
   if (facts ? 'edition' and facts->>'edition'<>old.edition) or (facts ? 'name' and lower(trim(facts->>'name'))<>lower(trim(old.name))) then raise exception '届次或名称不同，请作为新展会收录';end if;
   patch:='{}';changes:=old.pending_updates;
   date_conflict:=(old.starts_on is not null and coalesce(facts->>'starts_on','')<>'' and old.starts_on<>(facts->>'starts_on')::date) or (old.ends_on is not null and coalesce(facts->>'ends_on','')<>'' and old.ends_on<>(facts->>'ends_on')::date);
   foreach k in array array['starts_on','ends_on','venue','organizer','website','directory_url','status'] loop
    v:=facts->>k;oldv:=to_jsonb(old)->>k;if v is null or v='' then continue;end if;
    if v=coalesce(oldv,'') then changes:=changes-k;
    elsif coalesce(oldv,'')='' and not(k in ('starts_on','ends_on') and date_conflict) then patch:=patch||jsonb_build_object(k,v);
    else changes:=changes||jsonb_build_object(k,jsonb_build_object('previous',oldv,'proposed',v,'source_url',url,'seen_at',now()));end if;
   end loop;
   newrow:=jsonb_populate_record(old,patch);
   update public.freight_exhibitions set starts_on=newrow.starts_on,ends_on=newrow.ends_on,venue=newrow.venue,organizer=newrow.organizer,website=newrow.website,directory_url=newrow.directory_url,status=newrow.status,pending_updates=changes,auto_snapshot=jsonb_build_object('facts',facts,'source_url',url,'excerpt',left(item->>'excerpt',600),'seen_at',now()),last_crawled_at=now(),last_crawl_status=case when changes<>'{}' then '待核实' else '成功' end,last_crawl_error='',updated_at=now() where id=old.id;
   n_scanned:=n_scanned+1;if patch<>'{}' then n_filled:=n_filled+1;end if;if changes<>'{}' then n_pending:=n_pending+1;end if;
  exception when others then errs:=errs||jsonb_build_array(jsonb_build_object('existing_id',item->>'existing_id','source_url',item->>'source_url','error',left(sqlerrm,500)));
  end;
 end loop;
 for item in select value from jsonb_array_elements(errs) loop
  if coalesce(item->>'existing_id','') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then update public.freight_exhibitions set last_crawled_at=now(),last_crawl_status='失败',last_crawl_error=left(coalesce(item->>'error','采集失败'),1000) where id=(item->>'existing_id')::uuid and auto_update;end if;
 end loop;
 update public.freight_exhibition_sync_runs set finished_at=now(),status=case when jsonb_array_length(errs)>0 then case when n_scanned>0 then 'partial' else 'failed' end when n_pending>0 then 'partial' else 'success' end,scanned=n_scanned,added=n_added,filled=n_filled,pending=n_pending,failed=jsonb_array_length(errs),errors=errs where id=rid;
 select to_jsonb(r) into result from public.freight_exhibition_sync_runs r where id=rid;return result;
end $$;
revoke all on function public.freight_record_exhibition_scan(jsonb,jsonb,text) from public,anon;
grant execute on function public.freight_record_exhibition_scan(jsonb,jsonb,text) to authenticated;
