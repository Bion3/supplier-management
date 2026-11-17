-- Prevent rechecking leads already classified by direct map website completion.
create or replace function public.lead_enqueue_batch(p_ids uuid[]) returns uuid[]
language plpgsql security definer set search_path='' as $$
declare result uuid[]; total int;
begin
 if auth.uid() is null then raise exception '请登录 CRM'; end if;
 if auth.uid() <> all(array['1520a854-1746-4add-af50-6605967bb72f'::uuid,'2c1dc7d7-ecc4-4992-9bca-301877e9cd66'::uuid]) then raise exception '无权使用 CRM'; end if;
 total:=coalesce(cardinality(p_ids),0);
 if total=0 or total>500 or exists(select 1 from unnest(p_ids) x where x is null) then raise exception '企业编号无效或超过500条'; end if;
 insert into public.lead_enrich_jobs(lead_id,owner_id)
 select distinct l.id,auth.uid() from public.lead_discovery_leads l
 where l.id=any(p_ids) and l.crm_company_id is null
  and l.provider<>'google_places' and l.review_status<>'rejected'
  and l.enrichment_checked_at is null and l.website ~* '^https://' and length(l.website)<500
 on conflict(lead_id) do nothing;
 select array_agg(j.id order by j.created_at asc) into result from public.lead_enrich_jobs j
 where j.lead_id=any(p_ids) and j.status='queued' and j.owner_id=auth.uid();
 return coalesce(result,array[]::uuid[]);
end $$;
revoke all on function public.lead_enqueue_batch(uuid[]) from public,anon;
grant execute on function public.lead_enqueue_batch(uuid[]) to authenticated;
