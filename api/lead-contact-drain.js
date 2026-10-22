import {researchWebsite} from '../server/lead-website-research.js';
export const maxDuration=120;
const BASE='https://hcorkkudgicarsmexnqf.supabase.co/rest/v1/';
const PUB='sb_publishable_nB2eShVqNNkND-zOSHYSnQ_Pf2xtBgp';
const UUID=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const reply=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
const failMessage=e=>String(e?.message||e||'未知错误').slice(0,240);

export function createContactDrain({fetcher=fetch,researcher=researchWebsite,getSecret=()=>process.env.LEAD_WORKER_SECRET}={}){
 return async request=>{
  try{
   if(Number(request.headers.get('content-length')||0)>1800)return reply({error:'请求过大'},413);
   const token=(request.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
   if(!token)return reply({error:'请先登录'},401);
   const secret=getSecret();
   if(!secret)return reply({error:'生产环境官网核实密钥未配置'},503);
   const body=await request.json().catch(()=>({}));
   if(!Array.isArray(body.ids)||body.ids.length<1||body.ids.length>2||body.ids.some(id=>!UUID.test(id)))return reply({error:'每次只能处理1至2个核实任务'},400);
   const requested=[...new Set(body.ids)];
   // The user's JWT + RLS is the authority for every job claimed. Never accept arbitrary global job IDs.
   const res=await fetcher(BASE+'lead_enrich_jobs?select=id,lead_id,status&status=eq.queued&id=in.('+requested.join(',')+')',{headers:{apikey:PUB,Authorization:'Bearer '+token},signal:AbortSignal.timeout(15000)});
   if(!res.ok)return reply({error:'查询核实任务失败，请检查登录和权限'},res.status===401?401:403);
   const visible=await res.json();
   if(visible.length!==requested.length)return reply({error:'核实任务不存在、不是待处理状态或没有访问权限'},403);
   const rpc=async(action,id,result={})=>{
    const response=await fetcher(BASE+'rpc/lead_enrich_worker',{method:'POST',headers:{apikey:PUB,'Content-Type':'application/json'},body:JSON.stringify({p_secret:secret,p_action:action,p_job_id:id,p_result:result}),signal:AbortSignal.timeout(12000)});
    if(!response.ok)throw Error('核实任务状态写入失败');
    return response.json();
   };
   const results=[];
   for(const job of visible){
    const record={id:job.id,lead_id:job.lead_id,status:'skipped',added:0,checked_pages:0};
    let claimed=false;
    try{
     const lead=await rpc('claim',job.id);
     if(!lead.website){record.status='skipped';results.push(record);continue;}
     claimed=true;
     const extracted=await researcher(lead.website);
     if(!extracted.evidence?.length)throw Error('官网无法安全访问或无可读取页面：'+(extracted.errors||[]).slice(0,1).join(''));
     const saved=await rpc('finish',job.id,{contacts:extracted.contacts||[],evidence:extracted.evidence||[],checked_pages:extracted.checked_pages||0});
     record.status='completed';record.added=saved.added||0;record.checked_pages=extracted.checked_pages||0;
     record.notice='官网公开信息，尚未验证联系方式有效性';
    }catch(error){
     record.status='failed';record.error=failMessage(error);
     if(claimed)try{await rpc('finish',job.id,{error:record.error});}catch{record.error+='；任务状态回写失败';}
    }
    results.push(record);
   }
   return reply({results,completed:results.filter(x=>x.status==='completed').length,added:results.reduce((s,x)=>s+x.added,0)});
  }catch(error){return reply({error:failMessage(error)},500);}
 };
}
export const POST=createContactDrain();
