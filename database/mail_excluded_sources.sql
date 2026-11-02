-- The original historical list is identified by its source file, including
-- companies that have since received additional source references.
begin;
alter table public.freight_companies drop constraint freight_companies_development_stage_check;
alter table public.freight_companies add constraint freight_companies_development_stage_check
 check (development_stage in ('','待开发','开发中','有意向','报价中','已合作','暂缓开发','暂不开发'));
update public.freight_companies c set development_stage='暂不开发',updated_at=now()
where exists (
 select 1 from public.freight_sources s where s.company_id=c.id
 and s.source_sha256='acaf4d8ede370a60e321b62f4cd216a45df381ec38ee64e3112dc93639d36db8'
) and c.development_stage in ('','待开发');

create or replace function public.freight_mail_excluded_company_guard()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.purpose<>'测试' and new.status in ('scheduled','sending') and exists (
      select 1 from public.freight_companies c where c.id=new.company_id
       and (c.development_stage='暂不开发' or c.source_refs @> '[{"source":"landbridge"}]'::jsonb
            or c.source_refs ? 'LANDBRIDGE-20261030')
    ) then
  raise exception '此客户来源暂不参与开发邮件发送';
 end if;
 return new;
end $$;
revoke all on function public.freight_mail_excluded_company_guard() from public,anon,authenticated;
drop trigger if exists freight_mail_excluded_company_guard on public.freight_mail_messages;
create trigger freight_mail_excluded_company_guard
before insert or update of status,company_id on public.freight_mail_messages
for each row execute function public.freight_mail_excluded_company_guard();
commit;
