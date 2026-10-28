create or replace function public.freight_exhibitors_classify(p_ids uuid[],p_industry text default null,p_type text default null,p_tags text[] default '{}') returns table(id uuid,industry text,company_type text,tags text[],updated_at timestamptz) language plpgsql security invoker set search_path='' as $$
begin
 if auth.uid() is null or coalesce(cardinality(p_ids),0)=0 or cardinality(p_ids)>2000 then raise exception '请选择1至2000条展商';end if;
 if length(coalesce(p_industry,''))>120 or coalesce(cardinality(p_tags),0)>50 or exists(select 1 from unnest(p_tags) t where length(t)>100) then raise exception '分类或标签过长';end if;
 if p_type is not null and p_type not in ('待分类','进口商','批发商','分销商','制造商','货代','海外代理','服务商','其他') then raise exception '企业类型无效';end if;
 return query update public.freight_exhibitors e set industry=coalesce(nullif(trim(p_industry),''),e.industry),company_type=coalesce(p_type,e.company_type),tags=coalesce((select array_agg(distinct trim(t) order by trim(t)) from unnest(e.tags||coalesce(p_tags,'{}')) t where trim(t)<>''),'{}'),updated_at=now() where e.id=any(p_ids) returning e.id,e.industry,e.company_type,e.tags,e.updated_at;
end $$;
revoke all on function public.freight_exhibitors_classify(uuid[],text,text,text[]) from public,anon;
grant execute on function public.freight_exhibitors_classify(uuid[],text,text,text[]) to authenticated;
