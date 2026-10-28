const DB='https://hcorkkudgicarsmexnqf.supabase.co/rest/v1/';
const KEY='sb_publishable_nB2eShVqNNkND-zOSHYSnQ_Pf2xtBgp';
const JOB=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const respond=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
export function createMapDispatcher({fetcher=fetch,getToken=()=>process.env.MAP_GITHUB_DISPATCH_TOKEN}={}){
 return async request=>{
  try{
   const authHeader=request.headers.get('authorization')||'';
   const jwt=authHeader.toLowerCase().startsWith('bearer ')?authHeader.slice(7).trim():'';
   if(!jwt)return respond({error:'请先登录'},401);
   const body=await request.json().catch(()=>({}));
   const id=String(body.job_id||'');
   if(!JOB.test(id))return respond({error:'采集任务 ID 无效'},400);
   const owner=await fetcher(DB+'lead_map_search_jobs?select=id,status&status=eq.queued&id=eq.'+id+'&limit=1',{
    headers:{apikey:KEY,Authorization:'Bearer '+jwt},signal:AbortSignal.timeout(12000)
   });
   if(!owner.ok)return respond({error:'无法验证采集任务权限'},403);
   const rows=await owner.json();
   if(rows.length!==1)return respond({error:'仅能即时启动本人待执行的采集任务'},403);
   const token=getToken();
   if(!token)return respond({triggered:false,scheduled:true,notice:'即时启动尚未授权 GitHub Actions；任务已保存，定时执行仍然有效。'});
   const dispatch=await fetcher('https://api.github.com/repos/Bion3/supplier-management/actions/workflows/map-lead-search-queue.yml/dispatches',{
    method:'POST',headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'},
    body:JSON.stringify({ref:'main'}),signal:AbortSignal.timeout(12000)
   });
   if(dispatch.status!==204)return respond({triggered:false,scheduled:true,notice:dispatch.status===401||dispatch.status===403?'即时启动授权不可用，任务仍会定时执行':'即时启动未成功，任务仍会定时执行'});
   return respond({triggered:true,scheduled:true,notice:'已请求 GitHub 立即运行采集任务，正在等待执行器领取；地图会在完成后更新。'});
  }catch{return respond({triggered:false,scheduled:true,notice:'即时触发服务暂不可用，任务已留在队列中等待定时执行。'});}
 };
}
