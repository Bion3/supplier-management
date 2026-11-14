-- Automatically associate website inquiries with a verified CRM client account
-- when the public inquiry uses the same email that CRM has already authorized.
create or replace function portal_private.link_website_inquiry_to_client()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_company_id uuid;
  v_user_id uuid;
begin
  if new.source_type is distinct from 'website_form'
     or nullif(trim(new.email), '') is null then
    return new;
  end if;

  select m.company_id, u.id
    into v_company_id, v_user_id
    from public.freight_portal_members m
    join auth.users u
      on lower(u.email) = lower(m.email)
     and u.email_confirmed_at is not null
   where lower(m.email) = lower(trim(new.email))
   limit 1;

  if v_company_id is not null and v_user_id is not null then
    insert into public.freight_inquiry_threads(
      inquiry_id, company_id, linked_by, linked_at, updated_at
    )
    values (new.id, v_company_id, v_user_id, now(), now())
    on conflict (inquiry_id) do nothing;
  end if;

  return new;
end
$function$;

create trigger freight_auto_link_website_inquiry
after insert on public.leads
for each row execute function portal_private.link_website_inquiry_to_client();

revoke all on function portal_private.link_website_inquiry_to_client()
from public, anon, authenticated;

insert into public.freight_inquiry_threads(
  inquiry_id, company_id, linked_by, linked_at, updated_at
)
select l.id, m.company_id, u.id, now(), now()
from public.leads l
join public.freight_portal_members m
  on lower(m.email) = lower(l.email)
join auth.users u
  on lower(u.email) = lower(m.email)
 and u.email_confirmed_at is not null
left join public.freight_inquiry_threads t
  on t.inquiry_id = l.id
where l.source_type = 'website_form'
  and t.inquiry_id is null
on conflict (inquiry_id) do nothing;
