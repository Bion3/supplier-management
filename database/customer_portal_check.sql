-- Transactional integration check; fixtures and orders are always rolled back.
begin;
select set_config('portal.test_user',gen_random_uuid()::text,true),set_config('portal.test_company',gen_random_uuid()::text,true);
insert into auth.users(id,email,email_confirmed_at) values(current_setting('portal.test_user')::uuid,current_setting('portal.test_user')||'@example.invalid',now());
insert into public.freight_portal_companies(id,name) values(current_setting('portal.test_company')::uuid,'Portal integration fixture');
insert into public.freight_portal_members(email,company_id) values(current_setting('portal.test_user')||'@example.invalid',current_setting('portal.test_company')::uuid);
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('portal.test_user'),'role','authenticated')::text,true);
do $$declare b jsonb; rid uuid=gen_random_uuid(); oid text; repeated text; n integer; projection jsonb; begin
 b='{"origin":"Shanghai","destination":"Warsaw","shipper":{"company":"Shipper"},"consignee":{"company":"Consignee"},"notify":{},"notifySame":true,"declaredWeight":"3510","declaredVolume":"14","cargo":[{"cn":"测试货物","quantity":"7","weight":"","length":"","width":"","height":""}]}';
 oid=public.freight_portal_submit(b,rid);repeated=public.freight_portal_submit(b,rid);
 if oid<>repeated then raise exception 'idempotency failed';end if;
 select data into projection from public.freight_portal_orders where id=oid;
 if projection is null or projection->>'status' is distinct from '待审核' or (projection->>'pieces')::numeric<>7 or (projection->>'weight')::numeric<>3510 or projection ?| array['fees','logs','owner','todo'] then raise exception 'projection mismatch';end if;
 select count(*) into n from public.freight_booking_orders;if n<>0 then raise exception 'internal order leak';end if;
 perform set_config('portal.test_order',oid,true);
end $$;
reset role;
-- A normal status PATCH cannot bypass review, even from an internal admin.
select set_config('request.jwt.claims','{"sub":"1520a854-1746-4add-af50-6605967bb72f","role":"authenticated"}',true);
set local role authenticated;
do $$begin begin update public.freight_booking_orders set data=jsonb_set(data,'{status}','"待入仓"') where id=current_setting('portal.test_order');raise exception 'review bypass accepted';exception when others then if sqlerrm<>'客户订单须先审核通过，才能进入入仓及后续流程' then raise;end if;end;end $$;
update public.freight_booking_orders set data=data||'{"status":"待入仓","review":{"status":"approved"}}'::jsonb where id=current_setting('portal.test_order');
update public.freight_booking_orders set data=jsonb_set(data,'{status}','"运输中"') where id=current_setting('portal.test_order');
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('portal.test_user'),'role','authenticated')::text,true);
do $$ begin if (select data->>'status' from public.freight_portal_orders where id=current_setting('portal.test_order')) is distinct from '运输中' then raise exception 'status not synchronized';end if;end $$;
reset role;
delete from public.freight_portal_members where company_id=current_setting('portal.test_company')::uuid;
set local role authenticated;
do $$begin if public.freight_portal_company() is not null or exists(select 1 from public.freight_portal_orders) then raise exception 'revoked membership retained access';end if;end $$;
rollback;
