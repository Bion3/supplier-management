-- Fix job/task city correlation in search job insert RLS.
-- Previously t.city=t.city allowed an unrelated region task to be selected.
drop policy if exists lead_map_jobs_insert on public.lead_map_search_jobs;
create policy lead_map_jobs_insert on public.lead_map_search_jobs
for insert to authenticated
with check(
 auth.uid()=owner_id
 and auth.uid()=any(array['1520a854-1746-4add-af50-6605967bb72f'::uuid,'2c1dc7d7-ecc4-4992-9bca-301877e9cd66'::uuid])
 and status='queued' and processed=0 and inserted=0 and located_existing=0 and skipped=0
 and error_message is null and started_at is null and completed_at is null
 and exists(
   select 1 from public.lead_discovery_tasks t
    where t.id=lead_map_search_jobs.task_id
    and t.source='overture'
    and lower(t.city)=lower(lead_map_search_jobs.city)
 )
);
