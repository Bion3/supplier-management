-- One unattended development run per China calendar day. The private ledger makes retries idempotent.
create table if not exists mail_private.daily_outreach (
  run_day date not null,
  company_id text not null references public.freight_companies(id),
  message_id uuid not null unique references public.freight_mail_messages(id),
  primary key (run_day, company_id)
);
alter table mail_private.daily_outreach enable row level security;
revoke all on mail_private.daily_outreach from public, anon, authenticated;

create or replace function mail_private.daily_prepare(p_secret text, p_preview boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  d date := (now() at time zone 'Asia/Shanghai')::date;
  r record;
  t public.freight_mail_templates;
  owner uuid;
  n integer;
  msg uuid;
  output jsonb := '[]'::jsonb;
begin
  if p_secret is null or not exists (
    select 1 from mail_private.worker_credentials
    where id=1 and secret_hash=pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_secret,'UTF8')),'hex')
  ) then raise exception 'Invalid worker credential'; end if;
  perform pg_advisory_xact_lock(72744002);
  select u.id into owner from auth.users u join public.freight_mail_access a on a.user_id=u.id
    where lower(u.email)='benjamin@eurasiago.com';
  if owner is null then raise exception 'Outreach owner access missing'; end if;
  select * into t from public.freight_mail_templates where name='欧洲进口商｜中国发货' and purpose='开发客户';
  if t.id is null or t.body not like '%If this is not relevant, reply and I will stop contacting you.%'
    then raise exception 'Approved outreach template missing'; end if;
  select count(*) into n from public.freight_mail_messages
    where purpose='开发客户' and ((created_at at time zone 'Asia/Shanghai')::date=d
      or (send_started_at at time zone 'Asia/Shanghai')::date=d);
  -- A retry returns existing rows so the queue can be repaired without selecting new contacts.
  if exists(select 1 from mail_private.daily_outreach where run_day=d) then
    return (select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'scheduled_at',m.scheduled_at,'status',m.status) order by m.scheduled_at),'[]'::jsonb)
      from mail_private.daily_outreach x join public.freight_mail_messages m on m.id=x.message_id where x.run_day=d);
  end if;
  if n>=10 then return '[]'::jsonb; end if;
  for r in
    select distinct on (co.id) co.id company_id, co.company_name, ct.id contact_id, lower(trim(ct.value)) recipient,
      nullif(trim(ct.name),'') contact_name
    from public.freight_companies co join public.freight_contacts ct on ct.company_id=co.id
    where co.id like 'dir-%' and co.role='直客'
      and co.region in ('德国','波兰','荷兰','法国','意大利','比利时','西班牙','英国','捷克','奥地利','瑞士','瑞典','丹麦')
      and co.development_stage is distinct from '暂不开发' and co.status is distinct from '流失'
      and co.company_name !~* 'logistic|freight|forward|transport'
      and ct.channel='邮箱' and ct.status='有效' and ct.email_allowed
      and trim(ct.value) ~* '^(info|sales|contact|office|hello|enquiries|export|import)@[a-z0-9.-]+\.[a-z]{2,}$'
      and exists(select 1 from pg_catalog.jsonb_array_elements(co.source_refs) s
        where s->>'source'='行业名录' and s->>'provider' in ('EUROPUR','EUROPAGES','HMRC')
        and s->>'source_url' like 'https://%'
        and lower(pg_catalog.regexp_replace(pg_catalog.split_part(pg_catalog.split_part(s->>'website','://',2),'/',1),'^www\.',''))
          =lower(pg_catalog.split_part(trim(ct.value),'@',2)))
      and not exists(select 1 from public.freight_mail_messages m
        where m.company_id=co.id or lower(m.recipient)=lower(trim(ct.value)))
      and not exists(select 1 from public.freight_contacts blocked where blocked.channel='邮箱'
        and blocked.email_allowed=false and lower(trim(blocked.value))=lower(trim(ct.value)))
      and not exists(select 1 from public.freight_mail_inbox inbox
        where inbox.company_id=co.id or inbox.contact_id=ct.id
          or lower(inbox.from_email)=lower(trim(ct.value)) or lower(inbox.bounce_recipient)=lower(trim(ct.value)))
    order by co.id, ct.id
    limit greatest(0,10-n)
  loop
    if p_preview then
      output := output || jsonb_build_array(jsonb_build_object('company_id',r.company_id,'company',r.company_name,'recipient',r.recipient));
    else
      insert into public.freight_mail_messages(company_id,contact_id,recipient,purpose,subject,body,status,owner_id,scheduled_at)
      values(r.company_id,r.contact_id,r.recipient,'开发客户',t.subject,
        pg_catalog.replace(t.body,'Hello {{name}},',case when r.contact_name is null then 'Hello,' else 'Hello '||r.contact_name||',' end),
        'scheduled',owner,now()+(pg_catalog.jsonb_array_length(output)*interval '6 minutes')) returning id into msg;
      insert into mail_private.daily_outreach(run_day,company_id,message_id) values(d,r.company_id,msg);
      output := output || jsonb_build_array(jsonb_build_object('id',msg,'recipient',r.recipient,'scheduled_at',now()+(pg_catalog.jsonb_array_length(output)*interval '6 minutes'),'status','scheduled'));
    end if;
  end loop;
  return output;
end $$;
revoke all on function mail_private.daily_prepare(text,boolean) from public;
grant execute on function mail_private.daily_prepare(text,boolean) to anon;
create or replace function public.freight_mail_daily_prepare(p_secret text,p_preview boolean default false)
returns jsonb language sql security invoker set search_path='' as $$
  select mail_private.daily_prepare(p_secret,p_preview);
$$;
revoke all on function public.freight_mail_daily_prepare(text,boolean) from public;
grant execute on function public.freight_mail_daily_prepare(text,boolean) to anon;
