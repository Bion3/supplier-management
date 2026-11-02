-- Read only the email fields used by the mail workspace. The CRM RLS policy
-- makes PostgREST plan a full scan and sort even for the first page.
create or replace function public.freight_mail_contacts_page(p_offset integer default 0, p_limit integer default 1000)
returns table(id text, company_id text, name text, channel text, value text, status text, email_allowed boolean, mail_groups text[])
language sql stable security definer
set search_path = ''
as $$
 select c.id,c.company_id,c.name,c.channel,c.value,c.status,c.email_allowed,c.mail_groups
 from public.freight_contacts c
 where auth.uid() = any (array['1520a854-1746-4add-af50-6605967bb72f'::uuid,'2c1dc7d7-ecc4-4992-9bca-301877e9cd66'::uuid])
   and c.channel = '邮箱'
 order by c.id
 limit least(greatest(p_limit,1),1000)
 offset greatest(p_offset,0);
$$;
revoke all on function public.freight_mail_contacts_page(integer,integer) from public, anon;
grant execute on function public.freight_mail_contacts_page(integer,integer) to authenticated;
