begin;
create table if not exists public.freight_knowledge_topics (
 id uuid primary key default gen_random_uuid(),
 code text not null unique,
 name text not null,
 description text not null default '',
 sort_order integer not null default 100,
 active boolean not null default true,
 created_at timestamptz not null default now()
);
create table if not exists public.freight_knowledge_topic_entries (
 topic_id uuid not null references public.freight_knowledge_topics(id) on delete cascade,
 entry_id uuid not null references public.freight_knowledge_entries(id) on delete cascade,
 relation_type text not null default '来源依据' check (relation_type in ('核心规则','操作步骤','来源依据','冲突/例外','历史案例')),
 priority integer not null default 100,
 note text not null default '',
 created_at timestamptz not null default now(),
 primary key(topic_id,entry_id)
);
create index if not exists freight_knowledge_topic_entries_entry_idx on public.freight_knowledge_topic_entries(entry_id);
do $$ declare access text; begin
 select qual into access from pg_policies where schemaname='public' and tablename='suppliers' and policyname='supplier_hub_access';
 if access is null then raise exception 'Existing supplier authorization policy not found'; end if;
 alter table public.freight_knowledge_topics enable row level security;
 alter table public.freight_knowledge_topic_entries enable row level security;
 revoke all on public.freight_knowledge_topics from anon,authenticated;
 revoke all on public.freight_knowledge_topic_entries from anon,authenticated;
 grant select,insert,update on public.freight_knowledge_topics to authenticated;
 grant select,insert,update,delete on public.freight_knowledge_topic_entries to authenticated;
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='freight_knowledge_topics' and policyname='knowledge_topics_access') then
  execute format('create policy knowledge_topics_access on public.freight_knowledge_topics for all to authenticated using (%s) with check (%s)',access,access);
 end if;
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='freight_knowledge_topic_entries' and policyname='knowledge_topic_entries_access') then
  execute format('create policy knowledge_topic_entries_access on public.freight_knowledge_topic_entries for all to authenticated using (%s) with check (%s)',access,access);
 end if;
end $$;
insert into public.freight_knowledge_topics(code,name,description,sort_order) values
 ('cargo-review','货物审核与鉴定报告','品名、HS、成分、危险性、禁限运、鉴定报告和历史接货案例。',10),
 ('booking-docs','订舱与客户资料','询价、委托、订舱、资料收集和截单要求。',20),
 ('pickup-warehouse','提货与入仓','提货、自送、仓库、车队和入仓安排。',30),
 ('packing-loading','包装、装箱与加固','包装、贴唛、装箱方案、照片、偏载和加固。',40),
 ('customs-departure','报关、进站与发运','报关、查验、进站、制票、装车和发车。',50),
 ('transit-tracking','在途跟踪与异常','预报、运踪、口岸交接、延误及异常处理。',60),
 ('destination-delivery','到站、清关与交付','到站通知、清关、提柜、拆箱、派送和还箱。',70),
 ('rates-terms','报价、费用与条款','报价、账单、保险、付款和额外费用。',80),
 ('route-resources','航线、站点与服务资源','通道、口岸、站点、终端、供应商和服务范围。',90),
 ('conflicts-history','冲突、版本与历史资料','来源冲突、旧版本、过期要求和待核实资料。',100)
on conflict(code) do update set name=excluded.name,description=excluded.description,sort_order=excluded.sort_order;
with chosen as (
 select e.id entry_id,
 case
  when e.title ~ '历史货物审核|不需要鉴定报告物品|商定参考|货物审核|禁运|可否发运|混装安全' or e.content ~ '鉴定报告|原表可否发运结论|不得.*危险货物|禁运品|危险品范畴' then 'cargo-review'
  when e.title ~ '询价|下单|受理|订舱|委托书|收集班列要求文件|递交资料|发送SO|核对订单' then 'booking-docs'
  when e.title ~ '提货|车队|物流仓库|自送|集货仓|派单|司机信息|确认物流价格' then 'pickup-warehouse'
  when e.title ~ '装箱|配载|加固|照片|贴唛|包装|复称|偏载' then 'packing-loading'
  when e.title ~ '报关|查验|放行|进站|报车|制票|装车|发车|放箱|陆港订舱' then 'customs-departure'
  when e.title ~ '在途|运踪|GPS|预报|异常情况跟进|遗留柜' then 'transit-tracking'
  when e.title ~ '到站|清关|转关|拆箱|自提|派送|还箱|签收|提柜|堆存费' then 'destination-delivery'
  when e.kind='报价' or e.title ~ '报价|费用|开票|催款|保险|账单|付款|对账' then 'rates-terms'
  when e.kind='航线档案' or e.title ~ '路线|航线|口岸|节点|站点|进口商' then 'route-resources'
  else null end code
 from public.freight_knowledge_entries e
), ins as (
 select t.id topic_id,c.entry_id,
 case when c.code='cargo-review' and e.title like '西安历史货物审核%' then '历史案例'
      when e.status='存在冲突' then '冲突/例外'
      when e.kind='操作SOP' then '操作步骤'
      when e.kind in ('单证要求','航线档案') then '核心规则'
      else '来源依据' end relation_type
 from chosen c join public.freight_knowledge_topics t on t.code=c.code join public.freight_knowledge_entries e on e.id=c.entry_id
 where c.code is not null
)
insert into public.freight_knowledge_topic_entries(topic_id,entry_id,relation_type)
select topic_id,entry_id,relation_type from ins on conflict(topic_id,entry_id) do nothing;
insert into public.freight_knowledge_topic_entries(topic_id,entry_id,relation_type,priority)
select t.id,e.id,'冲突/例外',10
from public.freight_knowledge_topics t cross join public.freight_knowledge_entries e
where t.code='conflicts-history' and (e.status in ('存在冲突','已过期') or e.title ~ '历史来源|版本冲突|历史报价')
on conflict(topic_id,entry_id) do nothing;
commit;


-- Assign entries not covered by the first pass, using their operational meaning.
with assign as (
 select e.id entry_id,
 case
  when e.title ~ '仓位确认|填写需求反馈单|接单|收集随车|资料上传|关单|锁单|虚拟整箱订单' then 'booking-docs'
  when e.title ~ '申请用箱|批计划' then 'customs-departure'
  when e.title ~ '落重' then 'packing-loading'
  when e.title ~ '运单下载' then 'transit-tracking'
  when e.title ~ '发票录入' then 'rates-terms'
  when e.title ~ '会议纪要' then 'route-resources'
 end code
 from freight_knowledge_entries e
 where not exists(select 1 from freight_knowledge_topic_entries te where te.entry_id=e.id)
)
insert into freight_knowledge_topic_entries(topic_id,entry_id,relation_type)
select t.id,a.entry_id,case when e.kind='操作SOP' then '操作步骤' else '来源依据' end
from assign a join freight_knowledge_topics t on t.code=a.code join freight_knowledge_entries e on e.id=a.entry_id
where a.code is not null on conflict do nothing;
