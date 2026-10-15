import {send} from '@vercel/queue';
const BASE='https://hcorkkudgicarsmexnqf.supabase.co';
const KEY='sb_publishable_nB2eShVqNNkND-zOSHYSnQ_Pf2xtBgp';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const respond=(x,status=200)=>Response.json(x,{status,headers:{'Cache-Control':'no-store'}});
export async function POST(request){
 try{
  if(Number(request.headers.get('content-length')||0)>24000)return respond({error:'请求过大'},413);
  const token=(request.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
  if(!token)return respond({error:'请先登录 CRM'},401);
  const data=await request.json(),ids=data.ids;
  if(!Array.isArray(ids)||ids.length<1||ids.length>500||ids.some(x=>!uuid.test(x)))return respond({error:'一次请选择1至500家候选企业'},400);
  const r=await fetch(BASE+'/rest/v1/rpc/lead_enqueue_batch',{method:'POST',headers:{apikey:KEY,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({p_ids:[...new Set(ids)]}),signal:AbortSignal.timeout(15000)});
  if(!r.ok)return respond({error:'创建补全任务失败，请检查账号权限或企业官网'},r.status>=500?503:403);
  const jobs=await r.json();
  if(!Array.isArray(jobs)||!jobs.length)return respond({queued:0,message:'未发现可入队企业：可能无 HTTPS 官网、已经执行中或已入库。'});
  let published=0;
  try{
   for(let i=0;i<jobs.length;i+=100){await send('freight-lead-enrich',{ids:jobs.slice(i,i+100)},{retentionSeconds:7*86400,idempotencyKey:'lead-batch-'+jobs.slice(i,i+100).join('-').slice(0,300)});published+=Math.min(100,jobs.length-i);}
  }catch(e){console.error('lead_enqueue_publish_failed');return respond({queued:jobs.length,published,error:'任务已写入数据库，但部分后台派发失败；请刷新任务状态并使用重新派发。'},207);}
  return respond({queued:jobs.length,published,message:'已加入后台补全队列，关闭页面不会丢失任务。'});
 }catch(e){return respond({error:'创建后台任务失败'},500);}
}
