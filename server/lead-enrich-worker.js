import {researchWebsite} from './lead-website-research.js';
const BASE='https://hcorkkudgicarsmexnqf.supabase.co/rest/v1/rpc/lead_enrich_worker';
const KEY='sb_publishable_nB2eShVqNNkND-zOSHYSnQ_Pf2xtBgp';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function makeLeadWorker({fetcher=fetch,enqueue,secret=process.env.LEAD_WORKER_SECRET,researcher=researchWebsite}={}){
 async function rpc(action,id,result={}){
  if(!secret)throw Error('LEAD_WORKER_SECRET missing');
  const response=await fetcher(BASE,{method:'POST',headers:{apikey:KEY,'Content-Type':'application/json'},body:JSON.stringify({p_secret:secret,p_action:action,p_job_id:id,p_result:result}),signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error('Lead worker RPC failed');
  return response.json();
 }
 return async message=>{
  if(!Array.isArray(message.ids)||message.ids.length<1||message.ids.length>100||message.ids.some(id=>!uuid.test(id)))throw Error('Invalid lead batch');
  const [batch,...rest]=[message.ids.slice(0,3),message.ids.slice(3)];
  for(const id of batch){
   const claimed=await rpc('claim',id);if(!claimed.website)continue;
   try{
    const found=await researcher(claimed.website);
    if(!found.evidence?.length)throw Error('官网无法访问或无可读取页面');
    await rpc('finish',id,{contacts:found.contacts,evidence:found.evidence,checked_pages:found.checked_pages});
   }catch(e){await rpc('finish',id,{error:String(e.message||'补全失败').slice(0,300)});}
  }
  if(rest[0].length)await enqueue('freight-lead-enrich',{ids:rest[0]},{retentionSeconds:7*86400,idempotencyKey:'lead-next-'+rest[0][0]});
 };
}
