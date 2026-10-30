export const DAY=86400000;
export function chinaDay(date){
 const epoch=(date instanceof Date?date:new Date(date)).getTime();
 if(!Number.isFinite(epoch))return '';
 return new Date(epoch+8*3600000).toISOString().slice(0,10);
}
export function chinaMidnight(now=new Date()){
 const day=chinaDay(now);
 return new Date(day+'T00:00:00+08:00');
}
export function rangeStart(range,now=new Date()){
 const offset=range==='today'?0:range==='7d'?6:29;
 return new Date(chinaMidnight(now).getTime()-offset*DAY);
}
export function normalizeRun(kind,item){
 const status=String(item.status||'').toLowerCase();
 const phase=status==='running'||status==='processing'||status==='in_progress'?'running':
  status==='queued'||status==='pending'||status==='scheduled'||status==='draft'?'queued':
  status==='failed'||status==='error'||status==='partial'?'attention':
  status==='completed'||status==='success'||status==='sent'?'completed':'unknown';
 const date=kind==='exhibition'?item.started_at:kind==='mail'?item.scheduled_at||item.created_at:item.created_at;
 const started=kind==='exhibition'?item.started_at:item.started_at||item.created_at;
 const finish=kind==='exhibition'?item.finished_at:kind==='mail'?item.sent_at:item.completed_at||item.finished_at||item.updated_at;
 const numbers=kind==='map'?{count:item.processed||0,result:item.inserted||0,metric:'新增企业'}:
  kind==='enrich'?{count:item.checked_pages||0,result:item.added_count||0,metric:'新增联系方式'}:
  kind==='exhibition'?{count:item.scanned||0,result:item.added||0,metric:'新增展商'}:
  {count:1,result:status==='sent'?1:0,metric:'已发送'};
 const target=kind==='map'?[item.city,item.keyword,item.radius_km+'km'].filter(Boolean).join(' · '):
  kind==='enrich'?'官网联系方式核实 · '+String(item.lead_id||'').slice(0,8):
  kind==='exhibition'?'每日展会 / 展商同步':'邮件任务 · '+String(item.id||'').slice(0,8);
 return {id:item.id,kind,status,phase,date,started,finish,target,...numbers,
  detail:kind==='map'?item.error_message:kind==='enrich'?item.error:kind==='exhibition'?item.summary:'',
  errors:kind==='exhibition'?item.errors:null,
  pending:kind==='exhibition'?item.pending||0:0,
  failed:kind==='exhibition'?item.failed||0:0,
  attempts:kind==='enrich'?item.attempts||0:0,
  source:item};
}
export function dailyStats(rows){
 return {total:rows.length,running:rows.filter(x=>x.phase==='running').length,
  completed:rows.filter(x=>x.phase==='completed'||x.status==='partial').length,
  attention:rows.filter(x=>x.phase==='attention').length,
  leads:rows.filter(x=>x.kind==='map').reduce((sum,x)=>sum+x.result,0),
  contacts:rows.filter(x=>x.kind==='enrich').reduce((sum,x)=>sum+x.result,0)};
}
export function isStale(row,now=new Date()){
 if(row.phase!=='running')return false;
 const t=new Date(row.started||row.date).getTime();
 return Number.isFinite(t)&&now.getTime()-t>3*3600000;
}
