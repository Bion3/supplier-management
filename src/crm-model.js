export const customerStatuses=['待核实','潜在','正在跟进','合作中','沉睡','流失'];
export function chinaDate(now=new Date()){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);}
export function latestFollowups(rows){
 const result=new Map();
 for(const r of rows)if(!result.has(r.company_id)||r.created_at>result.get(r.company_id).created_at)result.set(r.company_id,r);
 return result;
}
export function filterCompanies(companies,contacts,followups,{query='',status='',due='',region='',role='',industry='',owner='',contact='',today=chinaDate()}={}){
 const q=query.trim().toLowerCase(),latest=latestFollowups(followups),text=new Map(),byCompany=new Map();
 for(const c of contacts){text.set(c.company_id,(text.get(c.company_id)||'')+' '+c.name+' '+c.value);if(!byCompany.has(c.company_id))byCompany.set(c.company_id,[]);byCompany.get(c.company_id).push(c);}
 return companies.filter(c=>{
  const next=latest.get(c.id)?.next_date;
  const companyContacts=byCompany.get(c.id)||[],dueMatch=!due||due==='due'&&next&&next<=today||due==='overdue'&&next&&next<today||due==='none'&&!next||due==='future'&&next&&next>today;
  const contactMatch=!contact||contact==='none'&&!companyContacts.length||contact==='email'&&companyContacts.some(x=>x.channel==='邮箱')||contact==='verified-email'&&companyContacts.some(x=>x.channel==='邮箱'&&x.status==='有效'&&x.email_allowed!==false);
  return (!status||c.status===status)&&dueMatch&&(!region||(c.region||'').toLowerCase().includes(region.toLowerCase()))&&(!role||c.role===role)&&(!industry||(c.industry||'').toLowerCase().includes(industry.toLowerCase()))&&(!owner||c.owner===owner)&&contactMatch&&[c.company_name,c.owner,c.role,c.region,c.industry,c.notes,JSON.stringify(c.source_refs),c.current_routes,JSON.stringify(c.historical_routes),text.get(c.id)||''].join(' ').toLowerCase().includes(q);
 });
}
export function validateCompany(data){
 const r={};for(const [key,max] of Object.entries({company_name:240,role:80,region:80,owner:80,industry:120,current_routes:1000,notes:5000})){r[key]=String(data[key]||'').trim();if(r[key].length>max)throw Error('字段过长：'+key);}
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


export function initialContacts(rows){
 const contacts=[],seen=new Set();
 for(const row of rows){let count=0;for(const [field,channel] of [['email','邮箱'],['phone','电话'],['wechat','微信']]){const value=String(row[field]||'').trim();if(!value)continue;const contact=validateContact({name:row.name,channel,value,context:row.context,status:row.status||'待核实'}),key=channel+':'+value.toLowerCase();if(seen.has(key))throw Error('联系方式重复：'+value);seen.add(key);contacts.push(contact);count++;}if(!count&&(String(row.name||'').trim()||String(row.context||'').trim()))throw Error('请为联系人填写至少一种联系方式，或移除该联系人。');}
 return contacts;
}
