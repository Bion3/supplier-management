// Evidence-based lead prioritization, not email deliverability or consent verification.
// "Multiple sources" requires distinct origins: two pages of one website count as ONE source.
const originOf = value => {try{const u=new URL(String(value||''));return ['http:','https:'].includes(u.protocol)?u.hostname.toLowerCase().replace(/^www\./,''):'';}catch{return '';}};
const thirdPartyHosts=['gelbeseiten.de','dasoertliche.de','11880.com','facebook.com','instagram.com','linkedin.com','myhermes.de','dhl.de','ups.com','google.com','google.de','foursquare.com'];
const isThirdParty = host => thirdPartyHosts.some(x=>host===x||host.endsWith('.'+x));
const normalizeType = type => ['email','邮箱'].includes(type)?'email':['phone','电话'].includes(type)?'phone':'other';
const classify = (contact,websiteHost) => {
 const type=normalizeType(contact.type),value=String(contact.value||'').trim(),source=originOf(contact.source_url);
 const valid=type==='email'?/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value):type==='phone'?/^\+?[\d\s().-]{5,40}$/.test(value):false;
 const emailHost=type==='email'?value.split('@').at(-1)?.toLowerCase()||'':'';
 const domainMatch=type==='email'&&websiteHost&&emailHost===websiteHost;
 const official=!!websiteHost&&source===websiteHost&&String(contact.source_type||'')==='official_website';
 return {type,value,source,valid,domainMatch,official};
};
export function assessLead(lead){
 const rawWebsiteHost=originOf(lead.website),websiteHost=isThirdParty(rawWebsiteHost)?'':rawWebsiteHost,contacts=Array.isArray(lead.contacts)?lead.contacts:[];
 const evidence=Array.isArray(lead.source_evidence)?lead.source_evidence:[];
 const evidenceHosts=new Set(evidence.map(e=>originOf(e.url)).filter(Boolean));
 const contactHosts=new Set(contacts.map(c=>originOf(c.source_url)).filter(Boolean));
 const sources=new Set([...evidenceHosts,...contactHosts]);
 const rows=contacts.map(c=>classify(c,websiteHost)),emails=rows.filter(c=>c.type==='email'&&c.valid),phones=rows.filter(c=>c.type==='phone'&&c.valid);
 const hasOfficialContact=rows.some(c=>c.official),hasMatchingEmail=emails.some(c=>c.domainMatch);
 // Exclude double-counting multiple pages on the same website.
 const independentSources=sources.size;
 let score=0;
 const reasons=[];
 if(websiteHost){score+=15;reasons.push('存在疑似企业官网（尚需核实归属）');}
 if(hasOfficialContact){score+=25;reasons.push('官网直接公布联系方式');}
 if(hasMatchingEmail){score+=20;reasons.push('邮箱域名与企业官网一致');}
 if(phones.length){score+=10;reasons.push('有格式合理的电话');}
 if(emails.length){score+=10;reasons.push('有格式合理的邮箱');}
 if(independentSources>=2){score+=15;reasons.push('至少两个不同网站来源');}
 if(lead.company_name&&lead.country&&lead.city){score+=5;reasons.push('企业和地区信息较完整');}
 const allEmailGeneric=emails.length>0&&emails.every(e=>/^(gmail\.com|outlook\.com|hotmail\.com|yahoo\.com|qq\.com|163\.com)$/i.test(e.value.split('@')[1]));
 if(allEmailGeneric){score=Math.max(0,score-10);reasons.push('仅找到公共邮箱域名，需核对企业归属');}
 const level=score>=70?'high':score>=40?'medium':'low';
 const missing=[];
 if(!websiteHost)missing.push(rawWebsiteHost?'提供的是黄页/平台链接，不是已核实的企业官网':'缺少企业官网');
 if(!hasOfficialContact)missing.push('尚未确认官网直接公布');
 if(!hasMatchingEmail)missing.push('邮箱域名尚未与企业官网一致');
 if(independentSources<2)missing.push('缺少独立第二来源');
 return {score,level,reasons,missing,source_count:independentSources,email_count:emails.length,phone_count:phones.length,websiteHost,
  note:'分数仅用于确定人工核实优先级，不代表收件人真实存在、同意营销或邮件可送达。'};
}
