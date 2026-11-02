-- Run after freight_tracking.sql. Unchanged daily payloads reuse existing versions.
alter table public.freight_tracking_reports add column if not exists content_hash text;
alter table public.freight_tracking_incidents add column if not exists content_hash text;
update public.freight_tracking_reports set content_hash=md5((detail-'asOf'-'filename')::text) where content_hash is null and not superseded;
update public.freight_tracking_incidents set content_hash=md5((detail-'asOf'-'filename')::text) where content_hash is null;
create index if not exists tracking_payload_lookup on public.freight_tracking_reports(operator,train_key,content_hash);
create index if not exists tracking_case_lookup on public.freight_tracking_incidents(operator,train_key,content_hash);
create table if not exists public.freight_tracking_observations (
 id text primary key, import_id text not null references public.freight_tracking_imports(id),
 report_id text references public.freight_tracking_reports(id), incident_id text references public.freight_tracking_incidents(id),
 as_of date not null, check ((report_id is not null)::int+(incident_id is not null)::int=1)
);
create index if not exists tracking_observation_report on public.freight_tracking_observations(report_id,as_of desc);
create index if not exists tracking_observation_case on public.freight_tracking_observations(incident_id,as_of desc);
alter table public.freight_tracking_observations enable row level security;
create policy tracking_team on public.freight_tracking_observations for all to authenticated
 using ((select auth.uid())=any(array['1520a854-1746-4add-af50-6605967bb72f'::uuid,'2c1dc7d7-ecc4-4992-9bca-301877e9cd66'::uuid]))
 with check ((select auth.uid())=any(array['1520a854-1746-4add-af50-6605967bb72f'::uuid,'2c1dc7d7-ecc4-4992-9bca-301877e9cd66'::uuid]));
revoke all on public.freight_tracking_observations from anon;
grant select,insert on public.freight_tracking_observations to authenticated;
insert into public.freight_tracking_observations(id,import_id,report_id,as_of)
 select 'r:'||r.id,r.import_id,r.id,r.as_of from public.freight_tracking_reports r where not superseded on conflict do nothing;
insert into public.freight_tracking_observations(id,import_id,incident_id,as_of)
 select 'i:'||r.id,r.import_id,r.id,r.as_of from public.freight_tracking_incidents r on conflict do nothing;
create or replace view public.freight_tracking_latest with (security_invoker=true) as
 select distinct on(r.operator,r.train_key) r.id,o.import_id,r.operator,r.train_key,o.as_of,
 r.summary||jsonb_build_object('asOf',o.as_of) as summary,
 coalesce(nullif(r.summary->>'departure',''),nullif(r.summary->>'planned',''))::timestamp::date as service_date
 from public.freight_tracking_reports r join public.freight_tracking_observations o on o.report_id=r.id
 join public.freight_tracking_imports i on i.id=o.import_id
 where i.status='complete' and not r.superseded and r.operator<>'CN'
 order by r.operator,r.train_key,o.as_of desc,i.created_at desc;
create or replace view public.freight_tracking_latest_incidents with (security_invoker=true) as
 select distinct on(r.operator,r.train_key,r.detail->>'container',r.detail->>'problem')
 r.id,r.operator,r.train_key,o.as_of,r.detail,
 (select max(e->>'at') from jsonb_array_elements(r.detail->'events') e) as last_update
 from public.freight_tracking_incidents r join public.freight_tracking_observations o on o.incident_id=r.id
 join public.freight_tracking_imports i on i.id=o.import_id where i.status='complete'
 order by r.operator,r.train_key,r.detail->>'container',r.detail->>'problem',o.as_of desc,i.created_at desc;
create or replace view public.freight_tracking_domestic_latest with(security_invoker=true) as
 select distinct on(r.train_key) r.detail-'events' as ref
 from public.freight_tracking_reports r join public.freight_tracking_observations o on o.report_id=r.id
 join public.freight_tracking_imports i on i.id=o.import_id where r.operator='CN' and i.status='complete'
 order by r.train_key,o.as_of desc,i.created_at desc;
grant select on public.freight_tracking_latest,public.freight_tracking_latest_incidents,public.freight_tracking_domestic_latest to authenticated;
create or replace function public.freight_tracking_ingest(p_import text,p_trains jsonb default '[]',p_cases jsonb default '[]',p_domestic jsonb default '[]')
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare meta public.freight_tracking_imports; item jsonb; d jsonb; s jsonb; k text; h text; rid text; changed int:=0; unchanged int:=0;
begin
 if not coalesce((select auth.uid())=any(array['1520a854-1746-4add-af50-6605967bb72f'::uuid,'2c1dc7d7-ecc4-4992-9bca-301877e9cd66'::uuid]),false) then raise exception 'Not authorized';end if;
 select * into strict meta from public.freight_tracking_imports where id=p_import;
 if meta.status<>'pending' then raise exception 'Import already complete';end if;
 if jsonb_array_length(p_trains)+jsonb_array_length(p_cases)+jsonb_array_length(p_domestic)>100 then raise exception 'Batch too large';end if;
 for item in select value from jsonb_array_elements(p_trains||p_domestic) loop
  d:=item->'detail';s:=item->'summary';k:=item->>'key';h:=md5((d-'asOf'-'filename')::text);rid:=null;
  select id into rid from public.freight_tracking_reports where operator=meta.operator and train_key=k and content_hash=h and not superseded limit 1;
  if rid is null then
   rid:='v:'||meta.operator||':'||k||':'||h;
   insert into public.freight_tracking_reports(id,import_id,operator,train_key,as_of,summary,detail,content_hash) values(rid,p_import,meta.operator,k,meta.as_of,s,d,h) on conflict(id) do nothing;
   changed:=changed+1;
  else unchanged:=unchanged+1;end if;
  insert into public.freight_tracking_observations(id,import_id,report_id,as_of) values(p_import||':r:'||rid,p_import,rid,meta.as_of) on conflict do nothing;
 end loop;
 for d in select value from jsonb_array_elements(p_cases) loop
  k:=d->>'key';h:=md5((d-'asOf'-'filename')::text);rid:=null;
  select id into rid from public.freight_tracking_incidents where operator=meta.operator and train_key=k and content_hash=h limit 1;
  if rid is null then
   rid:='v:'||meta.operator||':'||k||':'||h;
   insert into public.freight_tracking_incidents(id,import_id,operator,train_key,as_of,detail,content_hash) values(rid,p_import,meta.operator,k,meta.as_of,d,h) on conflict(id) do nothing;
   changed:=changed+1;
  else unchanged:=unchanged+1;end if;
  insert into public.freight_tracking_observations(id,import_id,incident_id,as_of) values(p_import||':i:'||rid,p_import,rid,meta.as_of) on conflict do nothing;
 end loop;
 return jsonb_build_object('changed',changed,'unchanged',unchanged);
end $$;
revoke all on function public.freight_tracking_ingest(text,jsonb,jsonb,jsonb) from public,anon;
grant execute on function public.freight_tracking_ingest(text,jsonb,jsonb,jsonb) to authenticated;
