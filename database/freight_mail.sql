create table public.freight_mail_access(user_id uuid primary key references auth.users(id));
insert into public.freight_mail_access(user_id)
select distinct u.id from auth.users u join (
 select (regexp_matches(qual,'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}','g'))[1]::uuid as id
 from pg_policies where schemaname='public' and tablename='suppliers' and policyname='supplier_hub_access'
) a on a.id=u.id;
alter table public.freight_mail_access enable row level security;
revoke all on public.freight_mail_access from anon,authenticated;
grant select on public.freight_mail_access to authenticated;
create policy own_mail_access on public.freight_mail_access for select to authenticated using(user_id=(select auth.uid()));
alter table public.freight_contacts add column email_allowed boolean not null default true;
create table public.freight_mail_templates(
 id uuid primary key default gen_random_uuid(), name text not null, purpose text not null check(purpose in ('维护客户','开发客户')),
 subject text not null, body text not null, created_at timestamptz not null default now()
);
create table public.freight_mail_messages(
 id uuid primary key default gen_random_uuid(),company_id text references public.freight_companies(id),
 contact_id text references public.freight_contacts(id), recipient text not null,
 purpose text not null check(purpose in ('维护客户','开发客户','测试')),
 subject text not null check(length(subject) between 1 and 200 and subject !~ E'[\\r\\n]'),
 body text not null check(length(body) between 1 and 20000),
 status text not null default 'draft' check(status in ('draft','sending','sent','failed','unknown')),
 message_id text, error text, reply_status text not null default '待回复' check(reply_status in ('待回复','已回复','无需求','拒绝联系')),
 owner_id uuid not null default auth.uid() references auth.users(id),
 created_at timestamptz not null default now(),send_started_at timestamptz,sent_at timestamptz
);
create index freight_mail_messages_company on public.freight_mail_messages(company_id,created_at desc);
create index freight_mail_messages_contact on public.freight_mail_messages(contact_id);
create index freight_mail_messages_daily on public.freight_mail_messages(send_started_at,status);
do $$ declare t text; begin
 foreach t in array array['freight_mail_templates','freight_mail_messages'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon, authenticated',t);
 execute format('grant select,insert,update on public.%I to authenticated',t);
 execute format('create policy mail_team_access on public.%I for all to authenticated using (exists(select 1 from public.freight_mail_access where user_id=(select auth.uid()))) with check (exists(select 1 from public.freight_mail_access where user_id=(select auth.uid())))',t);
 end loop;
end $$;
create function public.freight_mail_claim(p_id uuid) returns setof public.freight_mail_messages
language plpgsql security invoker set search_path = '' as $$
begin
 perform pg_advisory_xact_lock(72744001);
 if (select count(*) from public.freight_mail_messages where status in ('sending','sent','unknown') and send_started_at >= (date_trunc('day',now() at time zone 'Asia/Shanghai') at time zone 'Asia/Shanghai')) >= 50 then
 raise exception '每日发送上限为50封，请次日再发送'; end if;
 return query update public.freight_mail_messages set status='sending',send_started_at=now()
 where id=p_id and status='draft' returning *;
end $$;
revoke all on function public.freight_mail_claim(uuid) from public,anon;
grant execute on function public.freight_mail_claim(uuid) to authenticated;
insert into public.freight_mail_templates(name,purpose,subject,body) values
('老客户需求回访','维护客户','{{company}}近期运输需求沟通','您好{{name}}，\n\n想了解贵司近期是否有新的运输安排。我们可以针对{{routes}}的需求沟通线路、时效和报价。\n\n如有具体起运地、目的地、货物和计划时间，欢迎回复。\n\nBenjamin\nEurasiago\nbenjamin@eurasiago.com'),
('中欧铁路开发','开发客户','{{company}}中欧铁路运输需求沟通','您好{{name}}，\n\n我是Eurasiago的Benjamin，主要从事欧亚铁路和配套物流业务。想了解贵司是否有中欧铁路运输需求，以及是否方便与负责物流的同事沟通。\n\n如您愿意，可以回复起运地、目的地和货物信息，我们再讨论合适的方案。若不希望收到后续业务联系，请回复告知。\n\nBenjamin\nbenjamin@eurasiago.com'),
('English introduction','开发客户','Rail freight enquiry for {{company}}','Hello {{name}},\n\nThis is Benjamin from Eurasiago. I would like to understand whether your company has any rail freight requirements between China and Europe or Central Asia.\n\nIf relevant, please share the origin, destination, cargo details and planned shipping date so we can discuss an appropriate option. If you prefer not to receive further business enquiries, please let me know by replying.\n\nBest regards,\nBenjamin\nbenjamin@eurasiago.com');
