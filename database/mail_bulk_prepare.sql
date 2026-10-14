create or replace function public.freight_mail_prepare_batch(p_ids uuid[],p_scheduled_at timestamptz)
returns table(id uuid,status text,scheduled_at timestamptz,error text)
language plpgsql security invoker set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.freight_mail_access a where a.user_id=auth.uid()) then raise exception '账号未获邮件系统权限。'; end if;
 if coalesce(array_length(p_ids,1),0) not between 1 and 1000 or array_position(p_ids,null) is not null then raise exception '批次需包含1至1000个草稿编号。'; end if;
 if p_scheduled_at is null or p_scheduled_at<=clock_timestamp()+interval '30 seconds' then raise exception '请选择未来的发送时间。'; end if;
 return query
 with inputs as(select x.value as mail_id,min(x.ordinality) as position from unnest(p_ids) with ordinality x(value,ordinality) group by x.value),
 updated as(
  update public.freight_mail_messages m set status='scheduled',scheduled_at=p_scheduled_at,owner_id=auth.uid(),error=null
  from inputs i,public.freight_contacts c
  where m.id=i.mail_id and m.status='draft' and c.id=m.contact_id and c.company_id=m.company_id
  and c.channel='邮箱' and c.status='有效' and c.email_allowed=true
  and lower(btrim(c.value))=lower(btrim(m.recipient))
  and m.recipient ~ '^[A-Za-z0-9.!#$%&''*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$'
  and length(m.recipient)<=254 and m.purpose in('维护客户','开发客户')
  and m.subject !~ E'[\r\n]' and m.subject !~ '\{\{[^}]+\}\}' and m.body !~ '\{\{[^}]+\}\}'
  and not exists(select 1 from public.freight_contacts b where b.channel='邮箱' and b.email_allowed=false and lower(btrim(b.value))=lower(btrim(m.recipient)))
  returning m.id as mail_id
 )
 select i.mail_id,case when u.mail_id is not null then 'scheduled' else 'draft' end,
 case when u.mail_id is not null then p_scheduled_at else null::timestamptz end,
 case when u.mail_id is null then '草稿不可发送：请刷新核对草稿状态、邮箱核实结果或联系许可。' else null::text end
 from inputs i left join updated u on u.mail_id=i.mail_id order by i.position;
end;$$;
create or replace function public.freight_mail_restore_batch(p_ids uuid[],p_scheduled_at timestamptz)
returns integer language plpgsql security invoker set search_path='' as $$
declare restored integer;
begin
 if auth.uid() is null or not exists(select 1 from public.freight_mail_access a where a.user_id=auth.uid()) then raise exception '账号未获邮件系统权限。'; end if;
 if coalesce(array_length(p_ids,1),0) not between 1 and 1000 then raise exception '无效批次'; end if;
 update public.freight_mail_messages m set status='draft',scheduled_at=null where m.id=any(p_ids) and m.owner_id=auth.uid() and m.status='scheduled' and m.scheduled_at=p_scheduled_at;
 get diagnostics restored=row_count;return restored;
end;$$;
revoke all on function public.freight_mail_prepare_batch(uuid[],timestamptz) from public,anon;
revoke all on function public.freight_mail_restore_batch(uuid[],timestamptz) from public,anon;
grant execute on function public.freight_mail_prepare_batch(uuid[],timestamptz) to authenticated;
grant execute on function public.freight_mail_restore_batch(uuid[],timestamptz) to authenticated;
