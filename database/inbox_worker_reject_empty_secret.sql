-- Existing installations: fail closed for missing worker credentials.
do $migration$ declare definition text; begin
 definition:=pg_get_functiondef('public.freight_inbox_worker(text,text,uuid,jsonb)'::regprocedure);
 if position('c.secret_hash<>' in definition)>0 then
  execute replace(definition,'c.secret_hash<>','c.secret_hash is distinct from ');
 end if;
end $migration$;
