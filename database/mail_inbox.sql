create schema if not exists freight_private;
revoke all on schema freight_private from public, anon, authenticated;
create table freight_private.mail_connection(id integer primary key check(id=1),secret_hash text not null,cipher text,lease uuid,lease_until timestamptz,last_sync timestamptz,error text,page_token text,cycle integer not null default 0);
alter table freight_private.mail_connection enable row level security;
create table public.freight_mail_inbox(id text primary key,mailbox text not null,thread_id text,from_email text,from_name text,subject text,body_text text,received_at timestamptz,unread boolean,company_id text,contact_id text,reply_message_id uuid references public.freight_mail_messages(id),attachments jsonb default '[]',risk jsonb,created_at timestamptz default now());
alter table public.freight_mail_inbox enable row level security;
revoke all on public.freight_mail_inbox from anon,authenticated;
grant select on public.freight_mail_inbox to authenticated;
create policy inbox_team_read on public.freight_mail_inbox for select to authenticated using(exists(select 1 from public.freight_mail_access where user_id=(select auth.uid())));
create or replace function public.freight_inbox_worker(p_secret text,p_action text,p_lease uuid default null,p_data jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare c freight_private.mail_connection; r jsonb; co text; ct text; matched uuid; refs text;
begin
 select * into c from freight_private.mail_connection where id=1 for update;
 if c.id is null or c.secret_hash<>encode(extensions.digest(p_secret,'sha256'),'hex') then raise exception 'Forbidden';end if;
 if p_action='claim' then
  if c.lease_until>now() then return jsonb_build_object('busy',true);end if;
  update freight_private.mail_connection set lease=p_lease,lease_until=now()+interval '150 seconds' where id=1;
  return jsonb_build_object('cipher',c.cipher,'page_token',c.page_token,'cycle',c.cycle,'last_sync',c.last_sync);
 end if;
 if p_action='status' then return jsonb_build_object('last_sync',c.last_sync,'error',c.error,'connected',c.cipher is not null);end if;
 if c.lease is distinct from p_lease or c.lease_until<=now() then raise exception 'Lease lost';end if;
 if p_action='token' then update freight_private.mail_connection set cipher=p_data->>'cipher' where id=1;return '{"saved":true}';end if;
 if p_action='finish' then
  update freight_private.mail_connection set lease=null,lease_until=null,last_sync=case when p_data->>'error' is null then now() else last_sync end,error=p_data->>'error',page_token=case when p_data ? 'page_token' then p_data->>'page_token' else page_token end,cycle=case when p_data ? 'cycle' then (p_data->>'cycle')::integer else cycle end where id=1;
  return '{"finished":true}';
 end if;
 if p_action='upsert' then
  for r in select value from jsonb_array_elements(p_data->'messages') loop
   co:=null;ct:=null;matched:=null;
   if (select count(distinct company_id) from public.freight_contacts where channel='邮箱' and lower(trim(value))=lower(r->>'from_email'))=1 then select company_id,id into co,ct from public.freight_contacts where channel='邮箱' and lower(trim(value))=lower(r->>'from_email') order by id limit 1;end if;
   refs:=r->>'reply_refs';
   select m.id into matched from public.freight_mail_messages m where m.status='sent' and lower(m.recipient)=lower(r->>'from_email') and m.recipient<>'benjamin@eurasiago.com' and exists(select 1 from regexp_split_to_table(refs,'[<>[:space:]]+') x where x<>'' and x in(trim(both '<>' from m.message_id),m.id::text||'@eurasiago.com')) order by m.sent_at desc limit 1;
   if matched is not null then select company_id,contact_id into co,ct from public.freight_mail_messages where id=matched;update public.freight_mail_messages set reply_status='已回复' where id=matched and reply_status='待回复';end if;
   insert into public.freight_mail_inbox(id,mailbox,thread_id,from_email,from_name,subject,body_text,received_at,unread,company_id,contact_id,reply_message_id,attachments,risk) values(r->>'id','benjamin@eurasiago.com',r->>'thread_id',r->>'from_email',r->>'from_name',r->>'subject',r->>'body_text',(r->>'received_at')::timestamptz,(r->>'unread')::boolean,co,ct,matched,r->'attachments',r->'risk') on conflict(id) do update set unread=excluded.unread,company_id=excluded.company_id,contact_id=excluded.contact_id,reply_message_id=excluded.reply_message_id;
  end loop;return '{"saved":true}';
 end if;
 raise exception 'Invalid action';
end $$;
revoke all on function public.freight_inbox_worker(text,text,uuid,jsonb) from public;
grant execute on function public.freight_inbox_worker(text,text,uuid,jsonb) to anon;
