-- Retain every original notification; suppress bounced destinations without deleting customers.
alter table public.freight_mail_inbox add column mail_kind text not null default 'normal', add column bounce_recipient text, add column bounce_reason text;
alter table public.freight_mail_messages add column delivery_status text;
create or replace function freight_private.classify_bounce() returns trigger language plpgsql security definer set search_path='' as $$
declare address text; diagnostic text; kind text; reason text;
begin
 -- Only the provider's known notification template is eligible for automatic suppression.
 if lower(new.from_email) <> 'mailer-daemon@feishu.cn' or new.subject <> '邮件退信' or new.body_text not like '无法发送 %到以下收件人：%' then return new; end if;
 address:=lower(substring(new.body_text from '到以下收件人：[[:space:]]*收件人[[:space:]]+([^[:space:]<>]+@[^[:space:]<>]+)[[:space:]]+原因'));
 if address is null or address='benjamin@eurasiago.com' then return new; end if;
 diagnostic:=split_part(new.body_text,'管理员诊断信息',2);
 reason:=substring(new.body_text from ' 原因 (.*?) 解决方案');
 -- Policy blocks take precedence over the provider's sometimes imprecise Chinese reason.
 kind:=case
 when diagnostic ~* '(reputation|ERS-DUL|spam|blacklist|blocked using|access denied|open relay|5[.]7[.])' and diagnostic !~* '(user (unknown|not found|not exist)|no such user)' then 'bounce_policy'
 when diagnostic ~* '(5[.]1[.]1|user unknown|user not found|user not exist|no such user|recipient is not exist|dosn.t exist)' then 'bounce_invalid'
 when diagnostic ~* '(ips list is empty|NXDOMAIN)' then 'bounce_dns'
 when diagnostic ~* '(^|[^0-9])(4[0-9][0-9]|4[.][0-9][.][0-9])([^0-9]|$)|timed out|try again|greylist|mailbox full|5[.]2[.]2' then 'bounce_temporary'
 else 'bounce_review' end;
 new.mail_kind:=kind; new.bounce_recipient:=address; new.bounce_reason:=coalesce(reason,'退信需核实')||' · '||left(diagnostic,1200);
 update public.freight_contacts set email_allowed=false,status=case when kind='bounce_invalid' then '失效' else status end,updated_at=now()
 where channel='邮箱' and lower(trim(value))=address and (email_allowed is distinct from false or (kind='bounce_invalid' and status<>'失效'));
 update public.freight_mail_messages set status='failed',error='退信已筛除，停止发送：'||new.bounce_reason where lower(trim(recipient))=address and status in ('draft','scheduled');
 update public.freight_mail_messages set delivery_status=kind where lower(trim(recipient))=address and status='sent' and sent_at<=new.received_at and position(subject in new.body_text)>0;
 return new;
end $$;
revoke all on function freight_private.classify_bounce() from public,anon,authenticated;
create trigger freight_inbox_bounce before insert or update of body_text on public.freight_mail_inbox for each row execute function freight_private.classify_bounce();
-- Backfill retained messages through the same classification path.
update public.freight_mail_inbox set body_text=body_text where from_email='mailer-daemon@feishu.cn' and subject='邮件退信';
