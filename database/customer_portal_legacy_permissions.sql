-- Match supplier child permissions to the existing supplier-hub administrator policy.
do $$ declare r record; definition text; begin
 for r in select * from (values
 ('supplier_contacts','authenticated users can manage supplier contacts'),
 ('supplier_routes','authenticated users can manage supplier routes'),
 ('supplier_documents','authenticated users can manage supplier documents'),
 ('supplier_reviews','authenticated users can manage supplier reviews'),
 ('supplier_incidents','authenticated users can manage supplier incidents')) as policies(tab,pol)
 loop execute format('alter policy %I on public.%I using ((select public.freight_portal_admin())) with check ((select public.freight_portal_admin()))',r.pol,r.tab); end loop;
 -- These legacy SECURITY DEFINER RPCs bypass table RLS. Keep them available to
 -- internal admins and trusted app_metadata roles, never ordinary customer users.
 for r in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in ('app_convert_lead_to_customer','app_convert_quote_to_order','app_generate_payables_for_order','app_generate_receivable_for_order')
 loop
  definition=pg_get_functiondef(r.oid);
  if position('portal_internal_rpc_guard' in definition)=0 then
   definition=replace(definition,E'\nbegin\n',E'\nbegin\n  -- portal_internal_rpc_guard\n  if not public.freight_portal_admin() and coalesce(public.app_user_role(),\'anon\') not in (\'admin\',\'sales\',\'ops\',\'finance\') then raise exception \'internal_access_required\'; end if;\n');
   execute definition;
  end if;
 end loop;
end $$;
