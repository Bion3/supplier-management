import {researchWebsite} from './lead-website-research.js';
const BASE='https://hcorkkudgicarsmexnqf.supabase.co/rest/v1/';
const PUB='sb_publishable_nB2eShVqNNkND-zOSHYSnQ_Pf2xtBgp';
const UUID=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
export function createExhibitorContactCompletion({fetcher=fetch,researcher=researchWebsite}={}){
 return async request=>{
  const auth=request.headers.get('authorization')||'';
  if(!auth.toLowerCase().startsWith('bearer '))return json({error:'请先登录'},401);
  const jwt=auth.slice(7).trim();
  const input=await request.json().catch(()=>({}));
  const id=String(input.exhibitor_id||'');
  if(!UUID.test(id))return json({error:'展商 ID 无效'},400);
  const headers={apikey:PUB,Authorization:'Bearer '+jwt,'Content-Type':'application/json'};
  try{
   const response=await fetcher(BASE+'freight_exhibitors?id=eq.'+id+'&select=id,company_name,website,email,phone,status,notes&limit=1',{
    headers,signal:AbortSignal.timeout(12000)});
   if(!response.ok)return json({error:'展商无访问权限'},403);
   const records=await response.json();
   if(records.length!==1)return json({error:'找不到展商'},404);
   const company=records[0];
   if(!company.website?.startsWith('https://'))return json({error:'展商没有 HTTPS 官网，须先核实官网'},422);
   const found=await researcher(company.website);
   if(!found.evidence?.length)return json({error:'官网暂时无法安全访问',details:(found.errors||[]).slice(0,2)},422);
   const emails=found.contacts.filter(c=>c.type==='email').map(c=>c.value);
   const phones=found.contacts.filter(c=>c.type==='phone').map(c=>c.value);
   const result={};
   if(!company.email&&emails.length)result.email=emails[0];
   if(!company.phone&&phones.length)result.phone=phones[0];
   const sources=found.evidence.map(e=>e.url).slice(0,3);
   const existingNotes=String(company.notes||'');
   const sourceLine='官网公开联系方式候选（未核实）：'+sources.join('、');
   if(sources.length&&!existingNotes.includes(sourceLine))result.notes=(existingNotes+'\n'+sourceLine).trim().slice(0,5000);
   if(!Object.keys(result).length)return json({added:0,checked_pages:found.checked_pages||0,notice:'已有联系方式，未覆盖。官网仍需人工核实。'});
   result.updated_at=new Date().toISOString();
   const updated=await fetcher(BASE+'freight_exhibitors?id=eq.'+id,{
    method:'PATCH',headers:{...headers,Prefer:'return=representation'},body:JSON.stringify(result),signal:AbortSignal.timeout(12000)});
   if(!updated.ok)return json({error:'官网获取成功，但账号无权保存展商更新'},403);
   const changed=await updated.json();
   if(changed.length!==1)return json({error:'展商并发更新或保存失败'},409);
   return json({added:Number(Boolean(result.email))+Number(Boolean(result.phone)),email_added:Boolean(result.email),phone_added:Boolean(result.phone),checked_pages:found.checked_pages||0,notice:'补全的是官网公开信息，未自动认定邮箱有效，也未发送邮件。'});
  }catch(e){return json({error:String(e.message||'展商补全失败').slice(0,220)},500);}
 };
}
