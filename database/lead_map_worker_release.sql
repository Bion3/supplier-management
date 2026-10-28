-- The Overture CLI follows the newest STAC release. The worker must store the
-- actual release used, not a stale default saved when a job was queued.
create or replace function public.lead_map_worker_set_release(
 p_secret text,p_job_id uuid,p_release text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.lead_map_search_jobs;
begin
 if p_secret is null or not exists(
 select 1 from lead_private.overture_ingest_credentials
 where id=1 and secret_sha256=pg_catalog.encode(pg_catalog.sha256(
 pg_catalog.convert_to(p_secret,'UTF8')),'hex'))
 then raise exception 'invalid worker credential';end if;
 if p_release !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}([.][0-9]+)?$'
 then raise exception 'invalid Overture release';end if;
 update public.lead_map_search_jobs set release=p_release
 where id=p_job_id and status='running' returning * into j;
 if not found then raise exception 'job not running';end if;
 return jsonb_build_object('id',j.id,'release',j.release);
end $$;
revoke all on function public.lead_map_worker_set_release(text,uuid,text) from public,authenticated;
grant execute on function public.lead_map_worker_set_release(text,uuid,text) to anon;
