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

export async function mailSummary(request){
 const columns='id,recipient,subject,status,scheduled_at,created_at,error,delivery_status';
 const sources=[
  {kind:'queue',name:'待发送队列',href:'/mail.html?view=drafts&state=queue',query:'freight_mail_messages?select='+columns+'&status=in.(scheduled,sending)&order=scheduled_at.asc.nullslast,id.asc'},
  {kind:'drafts',name:'未提交草稿',href:'/mail.html?view=drafts&state=draft',query:'freight_mail_messages?select='+columns+'&status=eq.draft&order=created_at.desc,id.desc'},
  {kind:'issues',name:'发送异常 / 退信',href:'/mail.html?view=drafts&state=issues',query:'freight_mail_messages?select='+columns+'&or=(status.in.(failed,unknown),delivery_status.like.bounce_*)&order=created_at.desc,id.desc'},
  {kind:'replies',name:'客户回复',href:'/inbox.html',query:'freight_mail_inbox?select=id,from_email,from_name,subject,received_at,unread,reply_message_id&mail_kind=eq.normal&reply_message_id=not.is.null&order=received_at.desc,id.desc'}
 ];
 const responses=await Promise.allSettled(sources.map(source=>request(source.query+'&limit=11')));
 return sources.map(({query,...source},i)=>{const response=responses[i];return response.status==='fulfilled'&&Array.isArray(response.value)?{...source,rows:response.value.slice(0,10),limited:response.value.length>10}:{...source,error:true};});
}
