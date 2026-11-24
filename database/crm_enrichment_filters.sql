-- Persisted outcomes, evaluated with the caller's existing row permissions.
create or replace function public.freight_crm_enrichment_state(p_refs jsonb)
returns text language sql stable set search_path=public as $state$
with refs as (
 select r from jsonb_array_elements(coalesce(p_refs,'[]'::jsonb)) r where jsonb_typeof(r)='object'
), outcomes as (
 select case
 when exists(select 1 from public.lead_enrich_jobs j where j.lead_id=l.id and j.status in ('queued','running')) then 'running'
 when l.enrichment_result_category='new_contacts' then 'collected'
 when l.enrichment_checked_at is not null and l.enrichment_result_category in ('no_new_contacts','already_checked') then 'checked'
 when l.enrichment_checked_at is not null then 'failed'
 when exists(select 1 from jsonb_array_elements(coalesce(l.source_evidence,'[]')) e where e->>'contact_check'=public.freight_crm_clue_key(l.website,null,l.source_evidence)) then 'checked'
 when l.website ~* '^https://' then 'uncollected'
 else 'no_website' end state
 from refs join public.lead_discovery_leads l on l.id=case when refs.r->>'lead_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then (refs.r->>'lead_id')::uuid end
 union all
 select case
 when position('[contact-check:'||public.freight_crm_uri_component(public.freight_crm_clue_key(e.website,e.source_url,'[]'))||']' in coalesce(e.notes,''))>0 then 'checked'
 when e.website ~* '^https://' then 'uncollected'
 else 'no_website' end
 from refs join public.freight_exhibitors e on e.id=case when refs.r->>'exhibitor_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then (refs.r->>'exhibitor_id')::uuid end
)
select case
 when exists(select 1 from outcomes where state='running') then 'running'
 when exists(select 1 from outcomes where state='uncollected') then 'uncollected'
 when exists(select 1 from outcomes where state='collected') then 'collected'
 when exists(select 1 from outcomes where state='failed') then 'failed'
 when exists(select 1 from outcomes where state='checked') then 'checked'
 else 'no_website' end
$state$;
