export const locationTypes={city:'城市 / 地区',port:'港口',rail:'铁路站',terminal:'具体场站',warehouse:'仓库',border:'口岸',airport:'机场',other:'其他'};
export const chargeTypes={domestic:'国内段',international:'国际段',delivery:'境外配送',customs:'关务',container:'箱务',other:'其他'};
export const roleLabels={origin:'起运地',destination:'目的地',transit:'中转地'};
export function validateMaster(value){
 const row={};
 for(const key of ['kind','code','name_zh','name_en','category','country','city','unit','notes'])row[key]=String(value[key]??'').trim();
 row.code=row.code.toUpperCase();row.enabled=value.enabled!==false;
 row.aliases=[...new Set((Array.isArray(value.aliases)?value.aliases:String(value.aliases||'').split(/[\n,，;；]/)).map(x=>String(x).trim()).filter(Boolean))];
 row.roles=[...new Set(value.roles||[])];
 if(!['location','charge'].includes(row.kind))throw Error('请选择档案类型');
 if(!/^[A-Z0-9][A-Z0-9_-]{1,39}$/.test(row.code))throw Error('编号使用2–40位字母、数字、短横线或下划线');
 if(!row.name_zh||row.name_zh.length>120)throw Error('请填写名称（最多120字）');
 if(!Object.hasOwn(row.kind==='location'?locationTypes:chargeTypes,row.category))throw Error('请选择有效分类');
 if(row.kind==='location'&&!row.roles.length)throw Error('地点至少选择一种用途');
 if(row.roles.some(x=>!Object.hasOwn(roleLabels,x)))throw Error('地点用途无效');
 if(row.kind==='charge'){row.roles=[];row.country='';row.city='';}
 return row;
}
export function masterMatches(row,search){return [row.code,row.name_zh,row.name_en,row.country,row.city,...(row.aliases||[])].join(' ').toLowerCase().includes(search.trim().toLowerCase());}
export function locationChoices(rows,role){return rows.filter(r=>r.kind==='location'&&r.enabled&&r.roles.includes(role));}
export function resolveLocation(rows,value,role){const key=value.trim().toLowerCase();const found=locationChoices(rows,role).filter(r=>[r.name_zh,r.name_en,r.code,...r.aliases].filter(Boolean).some(x=>x.toLowerCase()===key));return found.length===1?found[0]:null;}
