-- Persistent, searchable enrichment outcomes for all prospect screens.
alter table public.lead_enrich_jobs add column if not exists result_category text;
alter table public.lead_enrich_jobs add column if not exists result_note text;
alter table public.lead_discovery_leads add column if not exists enrichment_result_category text;
alter table public.lead_discovery_leads add column if not exists enrichment_result_note text;
alter table public.lead_discovery_leads add column if not exists enrichment_checked_at timestamptz;

create or replace function public.classify_lead_enrichment(p_status text,p_error text,p_added integer)
returns text language sql immutable set search_path='' as $$
select case
 when p_status='queued' then 'not_started'
 when p_status='running' then 'in_progress'
 when p_status='completed' and coalesce(p_added,0)>0 then 'new_contacts'
 when p_status='completed' then 'no_new_contacts'
 when p_status='failed' and coalesce(p_error,'') ~* 'certificat|self.signed|issuer|altnames|CERT_|证书' then 'tls_certificate'
 when p_status='failed' and coalesce(p_error,'') ~* 'getaddrinfo|EBUSY|ENOTFOUND|EAI_AGAIN|DNS|域名' then 'dns_error'
 when p_status='failed' and coalesce(p_error,'') ~* 'EPROTO|ssl3_|TLS|alert internal error' then 'tls_handshake'
 when p_status='failed' and coalesce(p_error,'') ~* 'timeout|timed out|超时|ETIMEDOUT' then 'timeout'
 when p_status='failed' and coalesce(p_error,'') ~* 'size limit|too large|过大|大小限制' then 'page_too_large'
 when p_status='failed' and coalesce(p_error,'') ~* '403|429|robot|captcha|机器人|forbidden|限制访问' then 'access_restricted'
 when p_status='failed' and coalesce(p_error,'') ~* 'HTTP|网页未返回200|[45][0-9][0-9]' then 'http_error'
 when p_status='failed' and coalesce(p_error,'') ~* '网站地址不符合安全访问要求|安全访问|内网' then 'unsafe_website'
 when p_status='failed' then 'site_unreachable'
 else 'unclassified' end
$$;
create or replace function public.lead_enrich_outcome_update()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 new.result_category:=public.classify_lead_enrichment(new.status,new.error,new.added_count);
 new.result_note:=case
 when new.status='completed' and new.added_count>0 then '已获取' || new.added_count || '条官网公开联系方式，尚未核实有效性'
 when new.status='completed' then '官网已检查，未发现新增联系方式；保留原始联系方式'
 when new.status='failed' then left(coalesce(new.error,'官网检查失败'),300)
 when new.status='running' then '官网正在核实'
 else '待首次执行' end;
 return new;
end $$;
drop trigger if exists lead_enrich_outcome_categorize on public.lead_enrich_jobs;
create trigger lead_enrich_outcome_categorize before insert or update of status,error,added_count on public.lead_enrich_jobs
for each row execute function public.lead_enrich_outcome_update();
create or replace function public.lead_enrich_outcome_sync_lead()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status in ('completed','failed') and
 (old.status is distinct from new.status or old.finished_at is distinct from new.finished_at) then
 update public.lead_discovery_leads set
 enrichment_result_category=new.result_category,
 enrichment_result_note=new.result_note,
 enrichment_checked_at=coalesce(new.finished_at,now())
 where id=new.lead_id;
 end if;
 return new;
end $$;
drop trigger if exists lead_enrich_outcome_writeback on public.lead_enrich_jobs;
create trigger lead_enrich_outcome_writeback after update of status,finished_at on public.lead_enrich_jobs
for each row execute function public.lead_enrich_outcome_sync_lead();
update public.lead_enrich_jobs set result_category=public.classify_lead_enrichment(status,error,added_count),
 result_note=case when status='completed' and added_count>0 then '已获取'||added_count||'条官网公开联系方式，尚未核实有效性'
 when status='completed' then '官网已检查，未发现新增联系方式；保留原始联系方式'
 when status='failed' then left(coalesce(error,'官网检查失败'),300)
 when status='running' then '官网正在核实' else '待首次执行' end
where result_category is null;
with latest as (
 select distinct on (lead_id) lead_id,result_category,result_note,coalesce(finished_at,updated_at) checked_at
 from public.lead_enrich_jobs where status in ('completed','failed')
 order by lead_id,updated_at desc
)
update public.lead_discovery_leads l set
 enrichment_result_category=t.result_category,
 enrichment_result_note=t.result_note,
 enrichment_checked_at=t.checked_at
from latest t where l.id=t.lead_id;

-- Default batching is first-attempt only; failed tasks are NOT implicitly reset.
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
  and l.website ~* '^https://' and length(l.website)<500
 on conflict(lead_id) do nothing;
 select array_agg(j.id order by j.created_at asc) into result from public.lead_enrich_jobs j
 where j.lead_id=any(p_ids) and j.status='queued' and j.owner_id=auth.uid();
 return coalesce(result,array[]::uuid[]);
end $$;
revoke all on function public.lead_enqueue_batch(uuid[]) from public,anon;
grant execute on function public.lead_enqueue_batch(uuid[]) to authenticated;

-- Explicit retry only, capped and with cooldown; do not silently retry repeated failures.
create or replace function public.lead_retry_failed_batch(p_ids uuid[]) returns uuid[]
language plpgsql security definer set search_path='' as $$
declare result uuid[];
begin
 if auth.uid() is null or auth.uid() <> all(array['1520a854-1746-4add-af50-6605967bb72f'::uuid,'2c1dc7d7-ecc4-4992-9bca-301877e9cd66'::uuid]) then
 raise exception '无权重试官网核实任务'; end if;
 if coalesce(cardinality(p_ids),0) not between 1 and 100 or exists(select 1 from unnest(p_ids) i where i is null)
 then raise exception '一次允许重试1–100家'; end if;
 with changed as (
 update public.lead_enrich_jobs j set status='queued',error=null,finished_at=null,updated_at=now()
 from public.lead_discovery_leads l
 where j.lead_id=l.id and j.lead_id=any(p_ids) and j.owner_id=auth.uid()
 and j.status='failed' and j.attempts<5 and j.finished_at<now()-interval '60 minutes'
 and l.crm_company_id is null and l.review_status<>'rejected' and l.provider<>'google_places'
 and l.website ~* '^https://'
 returning j.id
 )
 select array_agg(id) into result from changed;
 return coalesce(result,array[]::uuid[]);
end $$;
