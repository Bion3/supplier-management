-- Atomically queue only genuinely unattempted website prospects.
-- The auth allowlist matches the existing CRM enrichment RPC.
drop function if exists public.lead_enqueue_next_unchecked(integer);
create or replace function public.lead_enqueue_next_unchecked(p_limit integer default 30,p_city text default null)
returns uuid[] language plpgsql security definer set search_path='' as $$
declare result uuid[];
begin
 if auth.uid() is null or auth.uid() <> all(array[
  '1520a854-1746-4add-af50-6605967bb72f'::uuid,
  '2c1dc7d7-ecc4-4992-9bca-301877e9cd66'::uuid])
 then raise exception '无权执行 CRM 官网补全任务'; end if;
 if p_limit is null or p_limit not between 1 and 40 then raise exception '每批限 1–40 家'; end if;
 with prioritized as (
  select l.id
  from public.lead_discovery_leads l
  where l.review_status='pending'
    and l.crm_company_id is null and l.provider<>'google_places'
    and l.enrichment_checked_at is null
    and l.enrichment_result_category is null
    and (p_city is null or lower(l.city)=lower(p_city))
    and l.website ~* '^https://'
    and length(l.website)<500
    and not exists (select 1 from public.lead_enrich_jobs j where j.lead_id=l.id)
  order by
    (case when exists(select 1 from pg_catalog.jsonb_array_elements(coalesce(l.contacts,'[]'::jsonb)) c
      where c->>'type'='email' and coalesce(c->>'value','')<>'') then 0 else 2 end)
    + (case when exists(select 1 from pg_catalog.jsonb_array_elements(coalesce(l.contacts,'[]'::jsonb)) c
      where c->>'type'='phone' and coalesce(c->>'value','')<>'') then 0 else 1 end) desc,
    l.created_at desc,l.id
  limit p_limit
  for update of l skip locked
 ), inserted as (
  insert into public.lead_enrich_jobs(lead_id,owner_id)
  select p.id,auth.uid() from prioritized p
  on conflict (lead_id) do nothing
  returning id
 )
 select array_agg(id) into result from inserted;
 return coalesce(result,array[]::uuid[]);
end $$;
revoke all on function public.lead_enqueue_next_unchecked(integer,text) from public,anon;
grant execute on function public.lead_enqueue_next_unchecked(integer,text) to authenticated;
