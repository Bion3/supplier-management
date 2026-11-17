import {send} from '@vercel/queue';
import {createHash} from 'node:crypto';
const BASE='https://hcorkkudgicarsmexnqf.supabase.co';
const KEY='sb_publishable_nB2eShVqNNkND-zOSHYSnQ_Pf2xtBgp';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const respond=(x,status=200)=>Response.json(x,{status,headers:{'Cache-Control':'no-store'}});
export async function POST(request){
 try{
  if(Number(request.headers.get('content-length')||0)>24000)return respond({error:'请求过大'},413);
  const token=(request.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
  if(!token)return respond({error:'请先登录 CRM'},401);
  const data=await request.json(),ids=data.ids,retryFailed=data.retry_failed===true;
  if(!Array.isArray(ids)||ids.length<1||ids.length>(retryFailed?100:500)||ids.some(x=>!uuid.test(x)))return respond({error:'一次请选择1至500家候选企业'},400);
  const r=await fetch(BASE+'/rest/v1/rpc/'+(retryFailed?'lead_retry_failed_batch':'lead_enqueue_batch'),{method:'POST',headers:{apikey:KEY,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({p_ids:[...new Set(ids)]}),signal:AbortSignal.timeout(15000)});
  if(!r.ok)return respond({error:'创建补全任务失败，请检查账号权限或企业官网'},r.status>=500?503:403);
  const jobs=await r.json();
  if(!Array.isArray(jobs)||!jobs.length)return respond({queued:0,message:retryFailed?'未找到可重试任务：须是本人失败任务、距上次失败超过60分钟且重试次数未达上限。':'没有新的首次补全任务：已完成、已失败及已入库企业会自动跳过，不会重复采集。'});
  let published=0;
  try{
   for(let i=0;i<jobs.length;i+=100){await send('freight-lead-enrich',{ids:jobs.slice(i,i+100)},{retentionSeconds:7*86400,idempotencyKey:'lead-batch-'+createHash('sha256').update(jobs.slice(i,i+100).join(',')).digest('hex')+'-'+Math.floor(Date.now()/60000)});published+=Math.min(100,jobs.length-i);}
  }catch(e){console.error('lead_enqueue_publish_failed');return respond({queued:jobs.length,published,error:'任务已写入数据库，但部分后台派发失败；请刷新任务状态并使用重新派发。'},207);}
  return respond({queued:jobs.length,published,message:retryFailed?'已按明确重试请求加入后台任务队列。':'已优先创建首次补全任务，历史已完成及失败企业不会重复占用名额。'});
 }catch(e){return respond({error:'创建后台任务失败'},500);}
}
