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
  const data=await request.json(),ids=data.ids,retryFailed=data.retry_failed===true,priority=data.action==='enqueue_priority';
  if(priority&&retryFailed)return respond({error:'首次补全不可同时请求失败任务重试'},400);
  if(priority&&(!Number.isInteger(data.limit)||data.limit<1||data.limit>40))return respond({error:'每批首次补全限1–40家'},400);
  if(priority&&data.city!=null&&(typeof data.city!=='string'||data.city.length>120))return respond({error:'城市参数无效'},400);
  if(!priority&&(!Array.isArray(ids)||ids.length<1||ids.length>(retryFailed?100:500)||ids.some(x=>!uuid.test(x))))return respond({error:'企业编号无效或超过每批限制'},400);
  const rpc=priority?'lead_enqueue_next_unchecked':retryFailed?'lead_retry_failed_batch':'lead_enqueue_batch';
  const payload=priority?{p_limit:data.limit,p_city:data.city||null}:{p_ids:[...new Set(ids)]};
  const r=await fetch(BASE+'/rest/v1/rpc/'+rpc,{method:'POST',headers:{apikey:KEY,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(15000)});
  if(!r.ok)return respond({error:'创建补全任务失败，请检查账号权限或企业官网'},r.status>=500?503:403);
  const jobs=await r.json();
  if(!Array.isArray(jobs)||!jobs.length)return respond({queued:0,message:priority?'未发现新的未检查企业；已处理、已失败、正在执行或无安全官网的企业均不会重复入队。':retryFailed?'未找到可重试任务：须是本人失败任务、距上次失败超过60分钟且重试次数未达上限。':'没有新的首次补全任务：已完成、已失败及已入库企业会自动跳过，不会重复采集。'});
  let published=0;
  try{
   for(let i=0;i<jobs.length;i+=100){await send('freight-lead-enrich',{ids:jobs.slice(i,i+100)},{retentionSeconds:7*86400,idempotencyKey:'lead-batch-'+createHash('sha256').update(jobs.slice(i,i+100).join(',')).digest('hex')+'-'+Math.floor(Date.now()/60000)});published+=Math.min(100,jobs.length-i);}
  }catch(e){console.error('lead_enqueue_publish_failed');return respond({queued:jobs.length,published,error:'任务已写入数据库，但部分后台派发失败；请刷新任务状态并使用重新派发。'},207);}
  return respond({queued:jobs.length,published,message:priority?'已按缺失联系方式优先级领取未检查企业，交由后台执行。':retryFailed?'已按明确重试请求加入后台任务队列。':'已优先创建首次补全任务，历史已完成及失败企业不会重复占用名额。'});
 }catch(e){return respond({error:'创建后台任务失败'},500);}
}
