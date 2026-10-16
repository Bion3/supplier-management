-- GitHub Actions -> Supabase candidate staging.
-- Machine credential is provisioned separately; never put the raw secret in SQL or Git.
create table if not exists lead_private.overture_ingest_credentials(
 id integer primary key default 1 check (id=1),
 secret_sha256 text not null,
 created_at timestamptz not null default now()
);
revoke all on lead_private.overture_ingest_credentials from public,anon,authenticated;
alter table lead_private.overture_ingest_credentials enable row level security;

create table if not exists public.lead_overture_batches(
 batch_key text primary key,
 task_id uuid not null references public.lead_discovery_tasks(id),
 release text not null,
 source_bbox text,
 expected_count integer not null default 0,
 processed integer not null default 0,
 inserted integer not null default 0,
 skipped integer not null default 0,
 status text not null default 'running' check(status in ('running','completed','failed')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists lead_overture_batches_task on public.lead_overture_batches(task_id,created_at desc);
create table if not exists public.lead_overture_chunks(
 batch_key text not null references public.lead_overture_batches(batch_key) on delete cascade,
 chunk_number integer not null check(chunk_number between 0 and 100),
 row_count integer not null,
 inserted integer not null,
 skipped integer not null,
 created_at timestamptz not null default now(),
 primary key(batch_key,chunk_number)
);
create index if not exists lead_overture_chunks_batch on public.lead_overture_chunks(batch_key);
alter table public.lead_overture_batches enable row level security;
alter table public.lead_overture_chunks enable row level security;
revoke all on public.lead_overture_batches,public.lead_overture_chunks from anon,authenticated;
grant select on public.lead_overture_batches,public.lead_overture_chunks to authenticated;
-- Match CRM's existing explicit membership policy.
do $$
declare allowed text; t text;
begin
 select qual into allowed from pg_policies where schemaname='public' and tablename='freight_companies' and policyname='freight_crm_access';
 if allowed is null then raise exception 'freight_crm_access not found'; end if;
 foreach t in array array['lead_overture_batches','lead_overture_chunks'] loop
  execute format('drop policy if exists overture_batch_read on public.%I',t);
  execute format('create policy overture_batch_read on public.%I for select to authenticated using (%s)',t,allowed);
 end loop;
end $$;

create or replace function public.lead_overture_import_chunk(
 p_secret text,p_task_id uuid,p_release text,p_batch_key text,p_bbox text,
 p_expected integer,p_chunk integer,p_rows jsonb,p_final boolean default false
) returns jsonb language plpgsql security definer set search_path='' as $$
declare task public.lead_discovery_tasks; batch public.lead_overture_batches;
 rec jsonb; uid text; company text; website text; category text; address_ text;
 affected integer; ins integer:=0; skipped_ integer:=0; n integer; old public.lead_overture_chunks;
begin
 if p_secret is null or length(p_secret)<32 or not exists(
  select 1 from lead_private.overture_ingest_credentials
  where id=1 and secret_sha256=pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_secret,'UTF8')),'hex')
 ) then raise exception 'Overture credential invalid'; end if;
 if p_batch_key !~ '^[a-zA-Z0-9_-]{10,96}$' or p_release !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}(\.[0-9]+)?$'
   or p_chunk not between 0 and 100 or p_expected not between 0 and 5000
   or p_bbox !~ '^-?[0-9.]+,-?[0-9.]+,-?[0-9.]+,-?[0-9.]+$'
 then raise exception 'Invalid batch metadata'; end if;
 if jsonb_typeof(p_rows)<>'array' then raise exception 'Rows must be array'; end if;
 n:=jsonb_array_length(p_rows);
 if n>50 or (n=0 and not p_final) then raise exception 'Chunk size invalid'; end if;
 select * into task from public.lead_discovery_tasks where id=p_task_id and source='overture';
 if not found then raise exception 'Overture task not found'; end if;
 -- Different executions cannot mutate an existing batch concurrently.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_batch_key));
 insert into public.lead_overture_batches(batch_key,task_id,release,source_bbox,expected_count)
 values(p_batch_key,p_task_id,p_release,p_bbox,p_expected)
 on conflict(batch_key) do nothing;
 select * into batch from public.lead_overture_batches where batch_key=p_batch_key for update;
 if batch.task_id<>p_task_id or batch.release<>p_release or batch.source_bbox<>p_bbox or batch.expected_count<>p_expected then
  raise exception 'Conflicting batch metadata';
 end if;
 select * into old from public.lead_overture_chunks where batch_key=p_batch_key and chunk_number=p_chunk;
 if found then
  return jsonb_build_object('duplicate_chunk',true,'inserted',old.inserted,'skipped',old.skipped,'processed',batch.processed,'status',batch.status);
 end if;
 if batch.status='completed' then raise exception 'Batch already completed';end if;
 if batch.processed+n>5000 or batch.processed+n>p_expected then raise exception 'Batch row limit exceeded';end if;
 for rec in select value from pg_catalog.jsonb_array_elements(p_rows) loop
  uid:=pg_catalog.btrim(coalesce(rec->>'id',''));
  company:=pg_catalog.left(pg_catalog.btrim(coalesce(rec->>'name','')),240);
  website:=pg_catalog.left(pg_catalog.btrim(coalesce(rec->>'website','')),500);
  category:=pg_catalog.left(pg_catalog.btrim(coalesce(rec->>'category','')),120);
  address_:=pg_catalog.left(pg_catalog.btrim(coalesce(rec->>'address','')),500);
  if uid !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' or company='' then
    skipped_:=skipped_+1;continue;
  end if;
  if website<>'' and website !~* '^https?://[a-z0-9.-]+(:[0-9]+)?(/.*)?$' then website:='';end if;
  insert into public.lead_discovery_leads(task_id,provider,provider_place_id,company_name,website,country,city,address,contacts,source_evidence,verification_status,review_status)
  values(p_task_id,'overture',uid,company,nullif(website,''),task.country,task.city,nullif(address_,''),'[]'::jsonb,
     pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
       'source','overturemaps','release',p_release,'batch_key',p_batch_key,
       'source_bbox',p_bbox,'place_id',uid,'category',category,
       'record_sources',coalesce(rec->'sources','[]'::jsonb),'imported_at',now(),
       'reference','https://docs.overturemaps.org/')),
     'unverified','pending')
  on conflict(provider,provider_place_id) where provider_place_id is not null do nothing;
  get diagnostics affected=row_count;
  ins:=ins+affected;
  skipped_:=skipped_+1-affected;
 end loop;
 insert into public.lead_overture_chunks(batch_key,chunk_number,row_count,inserted,skipped)
 values(p_batch_key,p_chunk,n,ins,skipped_);
 update public.lead_overture_batches
 set processed=processed+n,inserted=inserted+ins,skipped=skipped+skipped_,
   status=case when p_final then 'completed' else 'running' end,updated_at=now()
 where batch_key=p_batch_key
 returning * into batch;
 return jsonb_build_object('duplicate_chunk',false,'inserted',ins,'skipped',skipped_,'processed',batch.processed,'status',batch.status);
end $$;
revoke all on function public.lead_overture_import_chunk(text,uuid,text,text,text,integer,integer,jsonb,boolean) from public,authenticated,anon;
grant execute on function public.lead_overture_import_chunk(text,uuid,text,text,text,integer,integer,jsonb,boolean) to anon;
