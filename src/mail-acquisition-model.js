import {validEmail} from './mail-model.js';
const address=value=>String(value||'').trim().toLowerCase();
// A preview plan only: server-side permission and contact checks remain authoritative.
export function outreachPlan(chosen,contacts,messages=[],{onePerCompany=false,recentDays=14,now=Date.now()}={}){
 const blocked=new Set(contacts.filter(c=>c.channel==='邮箱'&&c.email_allowed===false).map(c=>address(c.value)));
 const active=new Set(),recent=new Set();
 for(const m of messages){const email=address(m.recipient);if(['scheduled','sending','unknown'].includes(m.status))active.add(email);if(m.status==='sent'&&Date.parse(m.sent_at||m.created_at)>now-recentDays*86400000)recent.add(email);}
 const emails=new Set(),companies=new Set(),rows=[],skipped=[];
 for(const c of chosen){const email=address(c.value);let reason='';
  if(c.channel!=='邮箱'||!validEmail(email))reason='邮箱格式无效';
  else if(blocked.has(email)||c.email_allowed!==true)reason='停止联系或未允许联系';
  else if(c.status!=='有效')reason='邮箱待核实或已失效';
  else if(active.has(email))reason='正在排队或发送结果待核查';
  else if(recentDays>0&&recent.has(email))reason='近期已联系';
  else if(emails.has(email))reason='重复邮箱';
  else if(onePerCompany&&c.company_id&&companies.has(c.company_id))reason='同公司其他邮箱';
  if(reason)skipped.push({contact:c,reason});else{rows.push(c);emails.add(email);if(c.company_id)companies.add(c.company_id);}
 }
 return {rows,skipped};
}
export function handoffContacts(handoff,userId,contacts,now=Date.now()){
 if(!handoff||handoff.userId!==userId||!Number.isFinite(handoff.createdAt)||now-handoff.createdAt>1800000||handoff.createdAt>now||!Array.isArray(handoff.companyIds))return null;
 const ids=new Set(handoff.companyIds);return contacts.filter(c=>ids.has(c.company_id)&&c.channel==='邮箱');
}
