-- Customer data is a separate, explicitly whitelisted projection of internal orders.
create schema if not exists portal_private;
revoke all on schema portal_private from public,anon,authenticated;
create table public.freight_portal_companies(id uuid primary key default gen_random_uuid(),name text not null check(length(trim(name)) between 1 and 200),created_at timestamptz default now());
create table public.freight_portal_members(email text primary key check(email=lower(trim(email))),company_id uuid not null references public.freight_portal_companies(id),created_at timestamptz default now());
alter table public.freight_booking_orders add column company_id uuid references public.freight_portal_companies(id);
create index freight_booking_orders_company on public.freight_booking_orders(company_id);
create table public.freight_portal_orders(id text primary key references public.freight_booking_orders(id),company_id uuid not null references public.freight_portal_companies(id),data jsonb not null,updated_at timestamptz not null);
create index freight_portal_orders_company on public.freight_portal_orders(company_id,updated_at desc);
create function public.freight_portal_admin() returns boolean language sql stable security invoker set search_path='' as $$select coalesce(auth.uid()=any(array['1520a854-1746-4add-af50-6605967bb72f'::uuid,'2c1dc7d7-ecc4-4992-9bca-301877e9cd66'::uuid]),false)$$;
create function public.freight_portal_company() returns uuid language sql stable security definer set search_path='' as $$select m.company_id from public.freight_portal_members m join auth.users u on lower(u.email)=m.email where u.id=auth.uid() and u.email_confirmed_at is not null$$;
alter table public.freight_portal_companies enable row level security;
alter table public.freight_portal_members enable row level security;
alter table public.freight_portal_orders enable row level security;
revoke all on public.freight_portal_companies,public.freight_portal_members,public.freight_portal_orders from public,anon,authenticated;
grant select,insert,update on public.freight_portal_companies,public.freight_portal_members to authenticated;
grant delete on public.freight_portal_members to authenticated;
grant select on public.freight_portal_orders to authenticated;
create policy portal_companies_admin on public.freight_portal_companies for all to authenticated using ((select public.freight_portal_admin())) with check((select public.freight_portal_admin()));
create policy portal_companies_customer on public.freight_portal_companies for select to authenticated using(id=(select public.freight_portal_company()));
create policy portal_members_admin on public.freight_portal_members for all to authenticated using((select public.freight_portal_admin())) with check((select public.freight_portal_admin()));
create policy portal_orders_read on public.freight_portal_orders for select to authenticated using(company_id=(select public.freight_portal_company()));
create function portal_private.sync_order() returns trigger language plpgsql security definer set search_path='' as $$declare b jsonb; begin
 if new.company_id is null then delete from public.freight_portal_orders where id=new.id;return new;end if;
 select coalesce(jsonb_object_agg(key,value),'{}') into b from jsonb_each(new.data->'booking') where key=any(array['reference','shipper','consignee','notify','notifySame','mode','loadType','origin','destination','readyDate','departureDate','cargo','declaredWeight','declaredVolume']);
 insert into public.freight_portal_orders(id,company_id,data,updated_at) values(new.id,new.company_id,jsonb_build_object('id',new.id,'ref',new.data->'ref','status',new.data->'status','origin',new.data->'origin','destination',new.data->'destination','cargo',new.data->'cargo','pieces',new.data->'pieces','weight',new.data->'weight','volume',new.data->'volume','date',new.data->'date','booking',b),new.updated_at)
 on conflict(id) do update set company_id=excluded.company_id,data=excluded.data,updated_at=excluded.updated_at;return new;end$$;
create trigger freight_portal_sync after insert or update on public.freight_booking_orders for each row execute function portal_private.sync_order();
create function public.freight_portal_submit(booking jsonb,request_id uuid) returns text language plpgsql security definer set search_path='' as $$
declare cid uuid; cname text; oid text; pieces numeric; weight numeric; volume numeric; b jsonb; begin
 cid=public.freight_portal_company();if cid is null then raise exception '请先验证邮箱，并联系业务人员绑定公司';end if;
 if jsonb_typeof(booking)<>'object' or octet_length(booking::text)>200000 or jsonb_typeof(booking->'cargo') is distinct from 'array' or jsonb_array_length(booking->'cargo')=0 or request_id is null then raise exception '托书内容不完整';end if;
 if coalesce(trim(booking->>'origin'),'')='' or coalesce(trim(booking->>'destination'),'')='' then raise exception '请填写起运地和目的地';end if;
 select name into cname from public.freight_portal_companies where id=cid;
 -- Idempotency prevents repeated button presses/network retries from duplicating an order.
 perform pg_advisory_xact_lock(hashtextextended(cid::text||request_id::text,0));
 select id into oid from public.freight_booking_orders where company_id=cid and data->>'portalRequestId'=request_id::text;if oid is not null then return oid;end if;
 select sum(nullif(r->>'quantity','')::numeric),case when bool_and(coalesce(r->>'weight','')<>'') then sum(nullif(r->>'quantity','')::numeric*nullif(r->>'weight','')::numeric) else null end,
 case when bool_and(coalesce(r->>'length','')<>'' and coalesce(r->>'width','')<>'' and coalesce(r->>'height','')<>'') then sum(nullif(r->>'quantity','')::numeric*nullif(r->>'length','')::numeric*nullif(r->>'width','')::numeric*nullif(r->>'height','')::numeric/1000000) else null end into pieces,weight,volume from jsonb_array_elements(booking->'cargo') r;
 weight=coalesce(weight,nullif(booking->>'declaredWeight','')::numeric,0);volume=coalesce(volume,nullif(booking->>'declaredVolume','')::numeric,0);
 if exists(select 1 from jsonb_array_elements(booking->'cargo') r cross join lateral jsonb_each(r) e where jsonb_typeof(e.value)<>'string') then raise exception '货物明细必须为文字或数字文本';end if;
 if coalesce(pieces,0)<=0 or weight<0 or volume<0 then raise exception '请检查件重尺';end if;
 if exists(select 1 from jsonb_each(booking) where key not in ('cargo','shipper','consignee','notify','notifySame') and jsonb_typeof(value)<>'string') or exists(select 1 from jsonb_array_elements(booking->'cargo') r where jsonb_typeof(r)<>'object' or coalesce(nullif(r->>'quantity','')::numeric,0)<=0) then raise exception '托书字段格式无效';end if;
 if jsonb_typeof(booking->'shipper') is distinct from 'object' or jsonb_typeof(booking->'consignee') is distinct from 'object' or jsonb_typeof(booking->'notify') is distinct from 'object' or jsonb_typeof(booking->'notifySame') is distinct from 'boolean' then raise exception '请填写收发通资料';end if;
 if exists(select 1 from jsonb_each(booking->'shipper') where jsonb_typeof(value)<>'string') or exists(select 1 from jsonb_each(booking->'consignee') where jsonb_typeof(value)<>'string') or exists(select 1 from jsonb_each(booking->'notify') where jsonb_typeof(value)<>'string') then raise exception '收发通格式无效';end if;
 b=booking||jsonb_build_object('customer',cname);
 oid='Eurasiago-'||to_char(now() at time zone 'Asia/Shanghai','YYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
 insert into public.freight_booking_orders(id,company_id,data) values(oid,cid,jsonb_build_object('booking',b,'portalRequestId',request_id,'customer',cname,'ref',coalesce(b->>'reference',''),'origin',b->>'origin','destination',b->>'destination','cargo',(select string_agg(coalesce(nullif(r->>'cn',''),r->>'en'),' / ') from jsonb_array_elements(b->'cargo') r),'pieces',pieces,'weight',weight,'volume',round(volume,3),'date',coalesce(b->>'departureDate',''),'status','待确认','owner','客户提交','todo','核对客户委托','fees','[]'::jsonb,'logs','[]'::jsonb));return oid;
end$$;
create unique index freight_portal_request_unique on public.freight_booking_orders(company_id,(data->>'portalRequestId')) where data ? 'portalRequestId';
revoke all on function public.freight_portal_admin(),public.freight_portal_company(),public.freight_portal_submit(jsonb,uuid),portal_private.sync_order() from public,anon,authenticated;
grant execute on function public.freight_portal_admin(),public.freight_portal_company(),public.freight_portal_submit(jsonb,uuid) to authenticated;
