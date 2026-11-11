alter table public.freight_booking_orders drop constraint booking_order_status;
alter table public.freight_booking_orders add constraint booking_order_status check(coalesce(data->>'status','')=any(array['待审核','待确认','待订舱','待入仓','待发运','运输中','待派送','已签收']));
-- Customer bookings must pass an explicit internal review before warehouse flow.
create or replace function portal_private.review_order() returns trigger language plpgsql set search_path='' as $$
declare required boolean; approved boolean; begin
 if tg_op='INSERT' then
  if new.data ? 'portalRequestId' or new.data->>'status'='待审核' then
   new.data=new.data||jsonb_build_object('status','待审核','todo','审核客户托书','reviewRequired',true,'review',jsonb_build_object('status','pending'));
  end if;return new;
 end if;
 required=coalesce((old.data->>'reviewRequired')::boolean,false) or old.data ? 'portalRequestId' or old.data->>'status'='待审核' or new.data->>'status'='待审核';
 if not required then return new;end if;
 new.data=new.data||jsonb_build_object('reviewRequired',true);
 if old.data ? 'portalRequestId' then new.data=jsonb_set(new.data,'{portalRequestId}',old.data->'portalRequestId');end if;
 approved=coalesce(old.data->'review'->>'status'='approved',false);
 if new.data->>'status'='待审核' then
  new.data=new.data||jsonb_build_object('review',jsonb_build_object('status','pending'),'todo','审核客户托书');return new;
 end if;
 if not approved then
  if not public.freight_portal_admin() or new.data->'review'->>'status' is distinct from 'approved' or new.data->>'status' is distinct from '待入仓' then
   raise exception '客户订单须先审核通过，才能进入入仓及后续流程';
  end if;
  new.data=new.data||jsonb_build_object('review',jsonb_build_object('status','approved','by',auth.uid(),'at',now()),'todo','安排入仓');
 else
  new.data=jsonb_set(new.data,'{review}',old.data->'review');
 end if;return new;
end $$;
revoke all on function portal_private.review_order() from public,anon,authenticated;
create trigger freight_booking_review before insert or update on public.freight_booking_orders for each row execute function portal_private.review_order();
-- Existing customer submissions waiting for acceptance join the review queue.
update public.freight_booking_orders set data=jsonb_set(data,'{status}','"待审核"') where data ? 'portalRequestId' and data->>'status'='待确认';
