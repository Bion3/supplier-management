alter table public.freight_exhibitors
 add column if not exists contacts jsonb not null default '[]'::jsonb;
alter table public.freight_exhibitors
 drop constraint if exists freight_exhibitors_contacts_array;
alter table public.freight_exhibitors
 add constraint freight_exhibitors_contacts_array
 check (jsonb_typeof(contacts)='array' and jsonb_array_length(contacts)<=100);
update public.freight_exhibitors e set contacts=
 (case when nullif(trim(e.email),'') is not null then
 jsonb_build_array(jsonb_build_object('type','email','value',trim(e.email),'source_type','legacy_exhibitor','verification','unverified')) else '[]'::jsonb end)
 ||(case when nullif(trim(e.phone),'') is not null then
 jsonb_build_array(jsonb_build_object('type','phone','value',trim(e.phone),'source_type','legacy_exhibitor','verification','unverified')) else '[]'::jsonb end)
where e.contacts='[]'::jsonb and (nullif(trim(e.email),'') is not null or nullif(trim(e.phone),'') is not null);
