export const customerStatuses=['待核实','潜在','正在跟进','合作中','沉睡','流失'];
export function chinaDate(now=new Date()){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);}
export function latestFollowups(rows){
 const result=new Map();
 for(const r of rows)if(!result.has(r.company_id)||r.created_at>result.get(r.company_id).created_at)result.set(r.company_id,r);
 return result;
}
export function filterCompanies(companies,contacts,followups,{query='',status='',due='',today=chinaDate()}={}){
 const q=query.trim().toLowerCase(),latest=latestFollowups(followups),text=new Map();
 for(const c of contacts)text.set(c.company_id,(text.get(c.company_id)||'')+' '+c.name+' '+c.value);
 return companies.filter(c=>{
  const next=latest.get(c.id)?.next_date;
  return (!status||c.status===status)&&(!due||(next&&next<=today))&&[c.company_name,c.owner,c.current_routes,JSON.stringify(c.historical_routes),text.get(c.id)||''].join(' ').toLowerCase().includes(q);
 });
}
export function validateCompany(data){
 const r={};for(const [key,max] of Object.entries({company_name:240,role:80,owner:80,industry:120,current_routes:1000,notes:5000})){r[key]=String(data[key]||'').trim();if(r[key].length>max)throw Error('字段过长：'+key);}
 if(!r.company_name)throw Error('请输入公司名称。');
 if(!customerStatuses.includes(data.status))throw Error('客户状态无效。');
 return {...r,status:data.status,addresses:String(data.addresses||'').split('\n').map(x=>x.trim()).filter(Boolean),updated_at:new Date().toISOString()};
}
export function validateContact(data){
 const r={name:String(data.name||'').trim(),channel:data.channel,value:String(data.value||'').trim(),context:String(data.context||'').trim(),status:data.status,updated_at:new Date().toISOString()};
 if(!['邮箱','电话','微信'].includes(r.channel)||!['待核实','有效','失效'].includes(r.status)||!r.value)throw Error('请完整填写联系方式。');
 if(r.channel==='邮箱'&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.value))throw Error('邮箱格式不正确。');
 if(Object.values(r).some(x=>typeof x==='string'&&x.length>500))throw Error('联系方式字段过长。');
 return r;
}
