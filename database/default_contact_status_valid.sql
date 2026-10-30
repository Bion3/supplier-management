-- Operational availability default; does not assert source or delivery verification.
alter table public.freight_contacts alter column status set default '有效';
do $change$
declare definition text;
begin
 select pg_get_functiondef('public.freight_acquisition_to_crm(text,uuid,text)'::regprocedure) into definition;
 if position($old$'获客来源公开资料，待核实','待核实'$old$ in definition)=0 then raise exception 'Unexpected acquisition contact default'; end if;
 definition:=replace(definition,$old$'获客来源公开资料，待核实','待核实'$old$,$new$'获客来源公开资料，默认可用；未做投递验证','有效'$new$);
 execute definition;
 select pg_get_functiondef('public.freight_create_company(jsonb,jsonb)'::regprocedure) into definition;
 definition:=replace(definition,$old$item->>'status') returning$old$,$new$coalesce(nullif(item->>'status',''),'有效')) returning$new$);
 execute definition;
end $change$;
-- One-time conversion. Explicit stop-contact and invalid records remain untouched.
update public.freight_contacts set status='有效',updated_at=now()
where status='待核实' and email_allowed=true;
