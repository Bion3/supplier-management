import {contactAlreadyChecked,contactClueKey} from '../server/contact-check.js';
import {createExhibitorContactCompletion} from '../server/exhibitor-contact-completion.js';
import {createMapDispatcher} from '../server/lead-map-dispatch.js';
import {createContactDrain} from '../server/lead-contact-drain.js';
import {researchWebsite} from '../server/lead-website-research.js';
const BASE='https://hcorkkudgicarsmexnqf.supabase.co';
const PUB='sb_publishable_nB2eShVqNNkND-zOSHYSnQ_Pf2xtBgp';
const reply=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
export async function POST(request){
 try{
  const probe=await request.clone().json().catch(()=>({}));
  if(probe?.action==='drain')return createContactDrain()(request);
  if(probe?.action==='start-map-job')return createMapDispatcher()(request);
  if(probe?.action==='enrich-exhibitor')return createExhibitorContactCompletion()(request);
  if(Number(request.headers.get('content-length')||0)>1024)return reply({error:'请求过大'},413);
  const token=(request.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
  if(!token)return reply({error:'请先登录 CRM'},401);
  const body=await request.json(),id=String(body.lead_id||'');
  if(!/^[0-9a-f-]{36}$/i.test(id))return reply({error:'企业候选 ID 无效'},400);
  const auth={apikey:PUB,Authorization:'Bearer '+token,'Content-Type':'application/json'};
  const rest=async(path,options={})=>{
   const response=await fetch(BASE+'/rest/v1/'+path,{...options,headers:{...auth,...options.headers},signal:AbortSignal.timeout(12000)});
   if(!response.ok)throw Error('数据库操作失败，请检查登录权限');return response.json().catch(()=>null);
  };
  const leads=await rest('lead_discovery_leads?id=eq.'+encodeURIComponent(id)+'&select=id,company_name,website,provider,contacts,source_evidence,crm_company_id,review_status&limit=1');
  if(leads.length!==1)return reply({error:'企业不存在或没有访问权限'},404);
  const lead=leads[0];
  if(!lead.website)return reply({error:'该企业没有官网，无法自动提取'},400);
  // Do not enrich Google Places records into a persistent independent business database.
  if(lead.provider==='google_places')return reply({error:'请先用独立来源核实网站，再持久化相关资料'},400);
  if(contactAlreadyChecked(lead))return reply({added:0,skipped:true,reason:'已补全，暂无新线索'});
  const researched=await researchWebsite(lead.website);
  if(!researched.evidence.length)return reply({error:'无法安全访问官网；'+researched.errors.slice(0,2).join('；')},422);
  const existing=Array.isArray(lead.contacts)?lead.contacts:[];
  const additions=researched.contacts.filter(c=>!existing.some(x=>x.type===c.type&&String(x.value).toLowerCase()===c.value.toLowerCase()));
  const updated=[...existing,...additions].slice(0,100);
  const evidence=[...(Array.isArray(lead.source_evidence)?lead.source_evidence:[]),...researched.evidence,{contact_check:contactClueKey(lead),checked_at:new Date().toISOString()}].slice(-60);
  // Never auto-approve. Existing manually approved lead moves back to pending review.
  await rest('lead_discovery_leads?id=eq.'+encodeURIComponent(id),{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({contacts:updated,source_evidence:evidence,verification_status:'website_found_unverified',review_status:'pending',updated_at:new Date().toISOString()})});
  return reply({added:additions.length,total:updated.length,checked_pages:researched.checked_pages,errors:researched.errors,notice:'从公开官网提取，尚未经交叉验证；联系方式已同步客户档案，可继续跟进。'});
 }catch(e){return reply({error:e?.name==='TimeoutError'?'连接超时':e.message||'官网核实失败'},500);}
}
