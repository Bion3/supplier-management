-- Applied to production. Keep verification separate from contact permission.
-- Historical false values are preserved: legacy data cannot reliably distinguish default-disabled from manually blocked.
do $change$
declare definition text; old_fragment text := $old$'source_type',item->>'source_type')),false);$old$; new_fragment text := $new$'source_type',item->>'source_type')),true);$new$;
begin
 select pg_get_functiondef('public.freight_acquisition_to_crm(text,uuid,text)'::regprocedure) into definition;
 if position(old_fragment in definition)=0 then
  if position(new_fragment in definition)=0 then raise exception 'Unexpected acquisition function definition'; end if;
 else
  if (length(definition)-length(replace(definition,old_fragment,'')))/length(old_fragment)<>1 then raise exception 'Ambiguous replacement'; end if;
  execute replace(definition,old_fragment,new_fragment);
 end if;
end $change$;
alter table public.freight_contacts alter column email_allowed set default true;