export const crmFilterFields={query:'search',stage:'stage-filter',focus:'focus-filter',source:'source-filter',group:'group-filter',status:'status',due:'due',region:'region-filter',role:'role-filter',industry:'industry-filter',owner:'owner-filter',contact:'contact-filter'};
export function mergeRows(previous,next){const rows=new Map(previous.map(r=>[r.id,r]));for(const row of next)rows.set(row.id,{...rows.get(row.id),...row});return [...rows.values()];}
export function pageRequest(filters,page,size,extra={}){return {p_filters:filters,p_offset:(Math.max(1,page)-1)*size,p_limit:size,...extra};}
export function pageCount(total,size){return Math.max(1,Math.ceil(total/size));}
