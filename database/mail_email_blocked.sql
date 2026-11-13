create or replace function public.freight_mail_email_blocked(p_email text)
returns boolean language sql stable security invoker set search_path = ''
as $$
  select exists (
    select 1 from public.freight_contacts
    where channel = '邮箱' and email_allowed = false
      and lower(btrim(value)) = lower(btrim(p_email))
  );
$$;
revoke execute on function public.freight_mail_email_blocked(text) from public, anon;
grant execute on function public.freight_mail_email_blocked(text) to authenticated;
