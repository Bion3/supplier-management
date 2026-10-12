alter table public.freight_companies add column region text not null default '';
alter table public.freight_contacts add column mail_groups text[] not null default array[]::text[];
alter table public.freight_companies add constraint freight_company_region_length check(length(region)<=80);
alter table public.freight_contacts add constraint freight_mail_group_count check(cardinality(mail_groups)<=20);
