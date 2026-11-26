alter table public.freight_contacts
add column if not exists mail_stop_reason text;

create or replace function public.freight_clear_mail_stop_reason()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.email_allowed or new.channel<>'邮箱' or lower(btrim(new.value)) is distinct from lower(btrim(old.value)) then
  new.mail_stop_reason:=null;
 end if;
 return new;
end;
$$;

drop trigger if exists freight_clear_mail_stop_reason on public.freight_contacts;
create trigger freight_clear_mail_stop_reason before update of email_allowed,channel,value on public.freight_contacts
for each row execute function public.freight_clear_mail_stop_reason();

create or replace function public.freight_crm_mail_permissions(p_company_id text)
returns table(contact_id text, stopped boolean, stop_reason text, bounce_kind text, bounce_reason text)
language sql stable security invoker set search_path='' as $$
 select x.id, blocked.n > 0, blocked.reason, bounce.mail_kind, bounce.bounce_reason
 from public.freight_contacts x
 cross join lateral (
  select count(*) n, (array_agg(nullif(btrim(c.mail_stop_reason),'') order by c.updated_at desc, c.id)
     filter (where nullif(btrim(c.mail_stop_reason),'') is not null))[1] reason
  from public.freight_contacts c
  where c.channel='邮箱' and c.email_allowed=false and lower(btrim(c.value))=lower(btrim(x.value))
 ) blocked
 left join lateral (
  select i.mail_kind,i.bounce_reason
  from public.freight_mail_inbox i
  where blocked.n>0 and i.bounce_recipient=lower(btrim(x.value))
  order by i.received_at desc,i.id desc limit 1
 ) bounce on true
 where x.company_id=p_company_id and x.channel='邮箱' and btrim(x.value)<>'';
$$;

create or replace function public.freight_crm_set_mail_permission(p_contact_id text,p_allowed boolean,p_reason text default null)
returns integer language plpgsql security invoker set search_path='' as $$
declare target text; affected integer;
begin
 if auth.uid() is null then raise exception '请先登录'; end if;
 if p_allowed is null then raise exception '请选择邮件联系状态'; end if;
 if not p_allowed and (nullif(btrim(p_reason),'') is null or char_length(btrim(p_reason))>500) then
  raise exception '请填写停发原因（最多500字）';
 end if;
 select lower(btrim(value)) into target from public.freight_contacts
 where id=p_contact_id and channel='邮箱' and btrim(value)<>'';
 if target is null then raise exception '找不到此邮箱或无权修改'; end if;
 update public.freight_contacts
 set email_allowed=p_allowed,mail_stop_reason=case when p_allowed then null else btrim(p_reason) end,updated_at=now()
 where channel='邮箱' and lower(btrim(value))=target;
 get diagnostics affected=row_count;
 if affected=0 then raise exception '邮箱状态未保存'; end if;
 return affected;
end;
$$;

revoke all on function public.freight_crm_mail_permissions(text), public.freight_crm_set_mail_permission(text,boolean,text) from public,anon;
grant execute on function public.freight_crm_mail_permissions(text), public.freight_crm_set_mail_permission(text,boolean,text) to authenticated;
