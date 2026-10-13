create table public.freight_mail_rules(
 id integer primary key check(id=1), batch_limit integer not null default 10 check(batch_limit between 1 and 100),
 daily_limit integer not null default 50 check(daily_limit between 1 and 1000),
 send_mode text not null default 'now' check(send_mode in ('now','scheduled')),
 default_scheduled_at timestamptz, updated_at timestamptz not null default now(),
 check(batch_limit<=daily_limit),check(send_mode='now' or default_scheduled_at is not null)
);
insert into public.freight_mail_rules(id) values(1);
alter table public.freight_mail_rules enable row level security;
revoke all on public.freight_mail_rules from public,anon,authenticated;
grant select,update on public.freight_mail_rules to authenticated;
create policy mail_rules_select on public.freight_mail_rules for select to authenticated using(exists(select 1 from public.freight_mail_access where user_id=(select auth.uid())));
create policy mail_rules_update on public.freight_mail_rules for update to authenticated using(exists(select 1 from public.freight_mail_access where user_id=(select auth.uid()))) with check(exists(select 1 from public.freight_mail_access where user_id=(select auth.uid())));
alter table public.freight_mail_messages add column scheduled_at timestamptz;
alter table public.freight_mail_messages drop constraint freight_mail_messages_status_check;
alter table public.freight_mail_messages add constraint freight_mail_messages_status_check check(status in ('draft','scheduled','sending','sent','failed','unknown'));
alter table public.freight_mail_messages add constraint freight_mail_scheduled_at_check check(status<>'scheduled' or scheduled_at is not null);
create or replace function public.freight_mail_claim(p_id uuid) returns setof public.freight_mail_messages
language plpgsql security invoker set search_path='' as $$
declare cap integer; begin
 perform pg_advisory_xact_lock(72744001);
 select daily_limit into cap from public.freight_mail_rules where id=1;
 if cap is null then raise exception '邮件发送规则不可访问'; end if;
 if (select count(*) from public.freight_mail_messages where status in ('sending','sent','unknown') and send_started_at >= (date_trunc('day',now() at time zone 'Asia/Shanghai') at time zone 'Asia/Shanghai')) >= cap then
 raise exception '每日发送上限为%封，请次日再发送',cap; end if;
 return query update public.freight_mail_messages set status='sending',send_started_at=now()
 where id=p_id and status='draft' returning *;
end $$;
create schema if not exists mail_private;
revoke all on schema mail_private from public;
create table mail_private.worker_credentials(id integer primary key check(id=1),secret_hash text not null);
alter table mail_private.worker_credentials enable row level security;
revoke all on mail_private.worker_credentials from public,anon,authenticated;
-- Narrow worker capability: only approved scheduled messages, no general database access.
create function mail_private.worker(p_secret text,p_action text,p_id uuid,p_result jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare m public.freight_mail_messages; cap integer; begin
 if not exists(select 1 from mail_private.worker_credentials where id=1 and secret_hash=pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_secret,'UTF8')),'hex')) then raise exception 'Invalid worker credential'; end if;
 if auth.uid() is not null and not exists(select 1 from public.freight_mail_access where user_id=auth.uid()) then raise exception 'Invalid caller'; end if;
 select * into m from public.freight_mail_messages where id=p_id;
 if m.id is null then return '{}'::jsonb; end if;
 if p_action='finish' then
  if m.status<>'sending' then return '{}'::jsonb; end if;
  if p_result->>'status' is null or p_result->>'status' not in ('sent','failed','unknown') then raise exception 'Invalid result'; end if;
  update public.freight_mail_messages set status=p_result->>'status',error=left(p_result->>'error',2000),message_id=left(p_result->>'message_id',500),sent_at=case when p_result->>'status'='sent' then now() else null end where id=p_id and status='sending';
  return jsonb_build_object('finished',true);
 end if;
 if p_action is null or p_action not in ('get','claim') then raise exception 'Invalid action'; end if;
 if p_action='get' and m.status='sending' then
  if m.send_started_at<now()-interval '10 minutes' then update public.freight_mail_messages set status='unknown',error='后台发送结果未确认，请核查飞书邮件后处理' where id=p_id and status='sending';return '{}'::jsonb; end if;
  return jsonb_build_object('in_progress_until',m.send_started_at+interval '10 minutes');
 end if;
 if m.status<>'scheduled' then return '{}'::jsonb; end if;
 if not exists(select 1 from public.freight_mail_access where user_id=m.owner_id) then
  update public.freight_mail_messages set status='failed',error='确认定时发送的账号权限已失效' where id=p_id and status='scheduled';return '{}'::jsonb;
 end if;
 if p_action='get' then return jsonb_build_object('row',to_jsonb(m)); end if;
 perform pg_advisory_xact_lock(72744001);
 if m.scheduled_at>now() then return jsonb_build_object('not_due',m.scheduled_at); end if;
 if m.purpose='测试' then
  if lower(m.recipient)<>'benjamin@eurasiago.com' then raise exception 'Invalid test recipient'; end if;
 elsif not exists(select 1 from public.freight_contacts c where c.id=m.contact_id and c.company_id=m.company_id and c.channel='邮箱' and c.status='有效' and c.email_allowed and lower(trim(c.value))=lower(m.recipient))
 or exists(select 1 from public.freight_contacts c where c.channel='邮箱' and not c.email_allowed and lower(trim(c.value))=lower(m.recipient)) then
  update public.freight_mail_messages set status='failed',error='收件邮箱未核实或已停止联系' where id=p_id and status='scheduled';return '{}'::jsonb;
 end if;
 select daily_limit into cap from public.freight_mail_rules where id=1;
 if (select count(*) from public.freight_mail_messages where status in ('sending','sent','unknown') and send_started_at >= (date_trunc('day',now() at time zone 'Asia/Shanghai') at time zone 'Asia/Shanghai')) >= cap then
 return jsonb_build_object('deferred_until',((date_trunc('day',now() at time zone 'Asia/Shanghai')+interval '1 day 1 minute') at time zone 'Asia/Shanghai')); end if;
 update public.freight_mail_messages set status='sending',send_started_at=now() where id=p_id and status='scheduled' and scheduled_at<=now() returning * into m;
 if m.id is null then return '{}'::jsonb; end if;
 return jsonb_build_object('row',to_jsonb(m));
end $$;
revoke all on function mail_private.worker(text,text,uuid,jsonb) from public;
grant usage on schema mail_private to anon,authenticated;
grant execute on function mail_private.worker(text,text,uuid,jsonb) to anon,authenticated;
create function public.freight_mail_worker(p_secret text,p_action text,p_id uuid,p_result jsonb default '{}'::jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select mail_private.worker(p_secret,p_action,p_id,p_result); $$;
revoke all on function public.freight_mail_worker(text,text,uuid,jsonb) from public;
grant execute on function public.freight_mail_worker(text,text,uuid,jsonb) to anon,authenticated;
