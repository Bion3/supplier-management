-- Tag previous direct website checks so their prospects are not wrongly treated as never attempted.
-- Use the source's original checked_at, not the migration timestamp.
with history as (
 select l.id,max((e.item->>'checked_at')::timestamptz) as last_check
 from public.lead_discovery_leads l
 cross join lateral jsonb_array_elements(coalesce(l.source_evidence,'[]'::jsonb)) as e(item)
 where l.enrichment_checked_at is null
  and e.item ? 'contact_check'
  and e.item->>'checked_at' ~ '^20[0-9]{2}-[01][0-9]-[0-3][0-9]T'
 group by l.id
)
update public.lead_discovery_leads l set
 enrichment_result_category='already_checked',
 enrichment_result_note='历史官网已检查，未请求重新补全；保留已有联系方式与原始来源',
 enrichment_checked_at=h.last_check
from history h where l.id=h.id and h.last_check is not null;
