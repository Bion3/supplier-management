import {regionVariants,customerSummary} from './assistant-model.js';
import {rangeStart,normalizeRun,dailyStats} from './daily-dashboard-model.js';
export async function findCustomers(request,filters){
 const variants=regionVariants(filters);
 const results=await Promise.all(variants.map(p_filters=>request('rpc/freight_crm_page',{method:'POST',body:JSON.stringify({p_filters,p_offset:0,p_limit:10,p_mode:'page'})})));
 return customerSummary(results,variants);
}
export async function taskSummary(request,range='today',now=new Date()){
 const since=encodeURIComponent(rangeStart(range,now).toISOString());
 const sources=[['map','地图采集','lead_map_search_jobs','id,status,inserted,processed,created_at,started_at,completed_at','created_at'],['enrich','联系方式补全','lead_enrich_jobs','id,status,added_count,checked_pages,created_at,started_at,finished_at','created_at'],['exhibition','展会同步','freight_exhibition_sync_runs','id,status,scanned,added,filled,pending,failed,started_at,finished_at','started_at'],['mail','邮件任务','email_tasks','id,status,scheduled_at,created_at,sent_at','created_at']];
 const responses=await Promise.allSettled(sources.map(s=>request(s[2]+'?select='+s[3]+'&'+s[4]+'=gte.'+since+'&order='+s[4]+'.desc,id.asc&limit=101')));
 return sources.map((source,i)=>{
  const response=responses[i];
  if(response.status!=='fulfilled'||!Array.isArray(response.value))return {name:source[1],error:true};
  const data=response.value.slice(0,100);
  return {name:source[1],kind:source[0],limited:response.value.length>100,...dailyStats(data.map(row=>normalizeRun(source[0],row)))};
 });
}
