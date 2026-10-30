import {contactAlreadyChecked} from './contact-check.js';
export function companyContactPriority(company,sources){
 const refs=(company.source_refs||[]).filter(r=>r&&typeof r==='object'&&(r.lead_id||r.exhibitor_id));
 if(!refs.length)return false;
 return refs.every(r=>{const row=sources.get(r.lead_id?'lead:'+r.lead_id:'exhibitor:'+r.exhibitor_id);return row&&contactAlreadyChecked(row);});
}
export function prioritySources(leads,exhibitors){return new Map([...leads.map(r=>['lead:'+r.id,r]),...exhibitors.map(r=>['exhibitor:'+r.id,r])]);}
