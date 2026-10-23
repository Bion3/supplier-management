create table if not exists mail_private.inquiry_notices (
 lead_id uuid primary key references public.leads(id),
 status text not null check(status in ('sending','sent','unknown','failed')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table mail_private.inquiry_notices enable row level security;
revoke all on mail_private.inquiry_notices from public,anon,authenticated;
create or replace function mail_private.inquiry_notice(p_secret text,p_id uuid,p_action text,p_status text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare l public.leads; n mail_private.inquiry_notices; begin
 if not exists(select 1 from mail_private.worker_credentials where id=1 and secret_hash=pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_secret,'UTF8')),'hex')) then raise exception 'Invalid worker credential'; end if;
 perform pg_catalog.pg_advisory_xact_lock(72744003);
 select * into n from mail_private.inquiry_notices where lead_id=p_id;
 if p_action='finish' then
  if p_status not in ('sent','unknown','failed') or p_status is null then raise exception 'Invalid status'; end if;
  update mail_private.inquiry_notices set status=p_status,updated_at=now() where lead_id=p_id and status='sending';
  return jsonb_build_object('status',p_status);
 end if;
 if p_action is distinct from 'claim' then raise exception 'Invalid action'; end if;
 if n.lead_id is not null then return jsonb_build_object('status',n.status); end if;
 select * into l from public.leads where id=p_id and created_at>now()-interval '1 day';
 if l.id is null then return '{}'::jsonb; end if;
 if (select count(*) from mail_private.inquiry_notices where created_at>now()-interval '1 day')>=100 then return jsonb_build_object('status','limited'); end if;
 insert into mail_private.inquiry_notices(lead_id,status) values(p_id,'sending');
 return jsonb_build_object('status','claimed','lead',jsonb_build_object('id',l.id,'contact_name',l.contact_name,'email',l.email,'phone',l.phone,'origin',l.origin,'destination',l.destination,'cargo_desc',l.cargo_desc,'message',l.message));
end $$;
revoke all on function mail_private.inquiry_notice(text,uuid,text,text) from public;
grant execute on function mail_private.inquiry_notice(text,uuid,text,text) to anon,authenticated;
create or replace function public.freight_inquiry_notice(p_secret text,p_id uuid,p_action text,p_status text default null)
returns jsonb language sql security invoker set search_path='' as $$ select mail_private.inquiry_notice(p_secret,p_id,p_action,p_status); $$;
revoke all on function public.freight_inquiry_notice(text,uuid,text,text) from public;
grant execute on function public.freight_inquiry_notice(text,uuid,text,text) to anon,authenticated;
