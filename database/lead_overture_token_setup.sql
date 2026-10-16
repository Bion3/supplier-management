-- Authorized CRM operators can rotate a one-purpose machine token.
-- Raw token is returned once over the authenticated RPC response; only hash is stored.
create or replace function public.lead_overture_issue_ingest_token()
returns text language plpgsql security definer set search_path='' as $$
declare secret text;
begin
 if (select auth.uid()) is null or (select auth.uid()) <> all(
   array['1520a854-1746-4add-af50-6605967bb72f'::uuid,
         '2c1dc7d7-ecc4-4992-9bca-301877e9cd66'::uuid])
 then raise exception 'Not authorized to configure lead ingestion'; end if;
 secret:=pg_catalog.encode(extensions.gen_random_bytes(32),'hex');
 insert into lead_private.overture_ingest_credentials(id,secret_sha256)
 values(1,pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(secret,'UTF8')),'hex'))
 on conflict (id) do update set secret_sha256=excluded.secret_sha256, created_at=now();
 return secret;
end $$;
revoke all on function public.lead_overture_issue_ingest_token() from public,anon;
grant execute on function public.lead_overture_issue_ingest_token() to authenticated;
