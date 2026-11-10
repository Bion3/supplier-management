-- Indexed keyset pages for the mail workspace; keep the same account allowlist as CRM.
create or replace function public.freight_mail_companies_after(p_after text default '', p_limit integer default 1000)
returns table(id text, company_name text, status text, role text, region text, addresses jsonb,
 current_routes text, historical_routes jsonb, source_refs jsonb, development_stage text, is_key_customer boolean)
language sql stable security definer set search_path = '' as $$
 select c.id,c.company_name,c.status,c.role,c.region,c.addresses,c.current_routes,
        c.historical_routes,c.source_refs,c.development_stage,c.is_key_customer
 from public.freight_companies c
 where auth.uid() = any (array['1520a854-1746-4add-af50-6605967bb72f'::uuid,'2c1dc7d7-ecc4-4992-9bca-301877e9cd66'::uuid])
   and c.id > coalesce(p_after,'')
 order by c.id
 limit least(greatest(p_limit,1),1000);
$$;
revoke all on function public.freight_mail_companies_after(text,integer) from public, anon;
grant execute on function public.freight_mail_companies_after(text,integer) to authenticated;

create or replace function public.freight_mail_contacts_after(p_after text default '', p_limit integer default 1000)
returns table(id text, company_id text, name text, channel text, value text, status text,
 email_allowed boolean, mail_groups text[])
language sql stable security definer set search_path = '' as $$
 select c.id,c.company_id,c.name,c.channel,c.value,c.status,c.email_allowed,c.mail_groups
 from public.freight_contacts c
 where auth.uid() = any (array['1520a854-1746-4add-af50-6605967bb72f'::uuid,'2c1dc7d7-ecc4-4992-9bca-301877e9cd66'::uuid])
   and c.channel = '邮箱' and c.id > coalesce(p_after,'')
 order by c.id
 limit least(greatest(p_limit,1),1000);
$$;
revoke all on function public.freight_mail_contacts_after(text,integer) from public, anon;
grant execute on function public.freight_mail_contacts_after(text,integer) to authenticated;
