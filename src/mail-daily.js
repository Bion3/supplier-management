import {outreachPlan} from './mail-acquisition-model.js';
import {regionInfo} from './mail-model.js';

const europe=new Set(['德国','波兰','荷兰','法国','捷克','匈牙利','意大利','英国','比利时','奥地利','西班牙','葡萄牙','瑞典','丹麦','芬兰','爱尔兰','斯洛伐克','斯洛文尼亚','罗马尼亚','保加利亚','克罗地亚','希腊','立陶宛','拉脱维亚','爱沙尼亚','卢森堡','马耳他','塞浦路斯','挪威','瑞士','塞尔维亚','阿尔巴尼亚','黑山','波黑','北马其顿','Germany','Poland','Netherlands','France','Czech Republic','Hungary','Italy','United Kingdom','Belgium','Austria','Spain','Portugal','Sweden','Denmark','Finland','Ireland','Slovakia','Slovenia','Romania','Bulgaria','Croatia','Greece','Lithuania','Latvia','Estonia','Luxembourg','Malta','Cyprus','Norway','Switzerland','Serbia']);
const email=m=>String(m.recipient||'').trim().toLowerCase();
const day=(value,timezone)=>new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));

// A local preparation aid. The server still checks permissions and sending limits.
export function dailyOutreachPlan(visible,allContacts,companies,messages,{now=Date.now(),limit=10,audience='直客'}={}){
 const byCompany=new Map(companies.map(c=>[c.id,c]));
 const today=day(now,'Asia/Shanghai');
 const used=messages.filter(m=>m.purpose==='开发客户'&&m.status!=='draft'&&day(m.created_at||now,'Asia/Shanghai')===today).length;
 const remaining=Math.max(0,Math.min(limit,10-used));
 const pastCompanies=new Set(messages.filter(m=>m.purpose==='开发客户').map(m=>m.company_id).filter(Boolean));
 const pastEmails=new Set(messages.filter(m=>m.purpose==='开发客户').map(email));
 const candidates=visible.filter(c=>{
  const company=byCompany.get(c.company_id),region=company&&regionInfo(company);
  return company&&company.role===audience&&region&&!region.inferred&&europe.has(region.value)
   &&!pastCompanies.has(company.id)&&!pastEmails.has(String(c.value||'').trim().toLowerCase());
 });
 const plan=outreachPlan(candidates,allContacts,messages,{onePerCompany:true,recentDays:30,now,companyRows:companies});
 const rows=plan.rows.slice(0,remaining);
 return {rows,used,remaining,available:plan.rows.length,skipped:plan.skipped.length};
}
