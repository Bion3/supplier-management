-- Booking-letter order workspace. Existing public.orders belongs to the legacy
-- customers/quotes application and is intentionally not repurposed.
create table public.freight_booking_orders (
 id text primary key default ('EG'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,16))),
 data jsonb not null,
 version integer not null default 1 check(version>0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 created_by uuid not null default auth.uid(),
 updated_by uuid not null default auth.uid(),
 reference text generated always as (data->>'ref') stored,
 customer_name text generated always as (data->>'customer') stored,
 destination text generated always as (data->>'destination') stored,
 status text generated always as (data->>'status') stored,
 constraint booking_order_object check(jsonb_typeof(data)='object' and jsonb_typeof(data->'booking')='object' and data ? 'booking'),
 constraint booking_order_required check(coalesce(length(trim(data->>'customer')),0)>0 and coalesce(length(trim(data->>'origin')),0)>0 and coalesce(length(trim(data->>'destination')),0)>0),
 constraint booking_order_status check(coalesce(data->>'status','') in ('待确认','待订舱','待入仓','待发运','运输中','待派送','已签收')),
 constraint booking_order_arrays check(jsonb_typeof(data->'fees')='array' and jsonb_typeof(data->'booking'->'cargo')='array' and data ? 'fees' and (data->'booking') ? 'cargo'),
 constraint booking_order_size check(octet_length(data::text)<=1048576),
 constraint booking_order_id check(length(id) between 4 and 80),
 constraint booking_order_nonnegative check(coalesce((data->>'pieces')::numeric,0)>=0 and coalesce((data->>'weight')::numeric,0)>=0 and coalesce((data->>'volume')::numeric,0)>=0)
);
create index freight_booking_orders_created on public.freight_booking_orders(created_at desc,id);
create index freight_booking_orders_reference on public.freight_booking_orders(reference);
alter table public.freight_booking_orders enable row level security;
revoke all on public.freight_booking_orders from public,anon,authenticated;
grant select,insert,update on public.freight_booking_orders to authenticated;
create policy freight_booking_orders_team on public.freight_booking_orders for all to authenticated
 using ((select auth.uid())=any(array['1520a854-1746-4add-af50-6605967bb72f'::uuid,'2c1dc7d7-ecc4-4992-9bca-301877e9cd66'::uuid]))
 with check ((select auth.uid())=any(array['1520a854-1746-4add-af50-6605967bb72f'::uuid,'2c1dc7d7-ecc4-4992-9bca-301877e9cd66'::uuid]));
create function public.freight_booking_order_stamp() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if TG_OP='UPDATE' then
  if new.id<>old.id then raise exception 'Order ID cannot change'; end if;
  new.created_at=old.created_at;new.created_by=old.created_by;new.version=old.version+1;
 else
  new.created_at=now();new.created_by=auth.uid();new.version=1;
 end if;
 new.updated_at=clock_timestamp();new.updated_by=auth.uid();
 new.data=jsonb_set(new.data,'{id}',to_jsonb(new.id));
 return new;
end;
$$;
revoke all on function public.freight_booking_order_stamp() from public,anon,authenticated;
create trigger freight_booking_order_stamp before insert or update on public.freight_booking_orders for each row execute function public.freight_booking_order_stamp();
