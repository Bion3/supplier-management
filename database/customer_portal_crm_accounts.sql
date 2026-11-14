-- Keep CRM portal email validation aligned with the live database.
-- A character class is used for the dot to avoid double-escaping it in PostgreSQL regex strings.
create or replace function public.freight_crm_portal_assign(p_crm_company_id text, p_email text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  cid uuid;
  cname text;
  clean_email text := lower(trim(p_email));
begin
  if auth.uid() is null or not public.freight_portal_admin() then
    raise exception 'Not authorized';
  end if;

  if clean_email is null
     or clean_email !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' then
    raise exception 'Invalid email';
  end if;

  select company_name
    into cname
    from public.freight_companies
   where id = p_crm_company_id;

  if cname is null then
    raise exception 'CRM company not found';
  end if;

  if not exists (
    select 1
      from auth.users
     where lower(email) = clean_email
       and email_confirmed_at is not null
  ) then
    raise exception 'User must register and verify email before assignment';
  end if;

  select portal_company_id
    into cid
    from public.freight_portal_crm_links
   where crm_company_id = p_crm_company_id;

  if cid is null then
    insert into public.freight_portal_companies(name)
    values (cname)
    returning id into cid;

    insert into public.freight_portal_crm_links(crm_company_id, portal_company_id)
    values (p_crm_company_id, cid);
  end if;

  if exists (
    select 1
      from public.freight_portal_members
     where lower(email) = clean_email
       and company_id <> cid
  ) then
    raise exception 'Email is assigned to another company';
  end if;

  insert into public.freight_portal_members(email, company_id)
  values (clean_email, cid)
  on conflict(email) do update
    set company_id = excluded.company_id;

  return public.freight_crm_portal_account(p_crm_company_id);
end
$function$;
