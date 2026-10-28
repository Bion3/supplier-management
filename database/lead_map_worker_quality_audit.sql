-- Automated per-job quality audit. Never promote leads to CRM or grant email permission.
create or replace function public.lead_map_worker_quality_audit(p_secret text,p_job_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.lead_map_search_jobs; excluded integer:=0; report jsonb;
begin
 if p_secret is null or not exists(select 1 from lead_private.overture_ingest_credentials
   where id=1 and secret_sha256=pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_secret,'UTF8')),'hex'))
 then raise exception 'invalid worker credential';end if;
 select * into j from public.lead_map_search_jobs where id=p_job_id;
 if not found or j.status not in ('running','completed') then raise exception 'job invalid';end if;
 -- Only reject obvious non-B2B location types; ambiguous categories stay pending.
 update public.lead_discovery_leads l
 set review_status='rejected',
     source_evidence=coalesce(l.source_evidence,'[]'::jsonb)||
      jsonb_build_array(jsonb_build_object('source','automated_category_screen',
        'reason','clearly unrelated to freight/import/wholesale','job_id',p_job_id,
        'screened_at',now())),
     updated_at=now()
 where l.review_status='pending' and l.provider='overture'
  and l.source_evidence @> jsonb_build_array(jsonb_build_object('job_id',p_job_id))
  and l.map_category=any(array['travel_service','garbage_collection_service',
  'auto_parts_store','party_and_event_planning','clothing_store','art_gallery',
  'adult_education_center','food_and_drink','labor_union','electrician',
  'recycling_center','employment_agency','civic_organization',
  'social_or_community_service','home_improvement_store','automotive_service']);
 get diagnostics excluded=row_count;
 select jsonb_build_object(
  'job_id',p_job_id,
  'city',j.city,
  'processed',j.processed,
  'inserted',j.inserted,
  'skipped',j.skipped,
  'auto_rejected_now',excluded,
  'pending',count(*) filter(where l.review_status='pending'),
  'with_email',count(*) filter(where l.review_status='pending' and
      exists(select 1 from jsonb_array_elements(coalesce(l.contacts,'[]'::jsonb)) c where c->>'type'='email')),
  'with_phone',count(*) filter(where l.review_status='pending' and
      exists(select 1 from jsonb_array_elements(coalesce(l.contacts,'[]'::jsonb)) c where c->>'type'='phone')),
  'with_website',count(*) filter(where l.review_status='pending' and l.website is not null)
 ) into report
 from public.lead_discovery_leads l
 where l.provider='overture' and l.source_evidence @> jsonb_build_array(jsonb_build_object('job_id',p_job_id));
 return report;
end $$;
revoke all on function public.lead_map_worker_quality_audit(text,uuid) from public,authenticated;
grant execute on function public.lead_map_worker_quality_audit(text,uuid) to anon;
