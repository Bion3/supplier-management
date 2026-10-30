import {cloudRequest,currentUser} from './cloud.js';
import {DAY,chinaDay,rangeStart,normalizeRun,dailyStats,isStale} from './daily-dashboard-model.js';
const $=id=>document.getElementById(id);
const names={map:'地图区域采集',enrich:'官网联系方式补全',exhibition:'展会展商更新',mail:'邮件任务'};
const urls={map:'/lead-map.html',enrich:'/discovery.html',exhibition:'/exhibitions.html',mail:'/mail.html'};
const statuses={queued:'排队中',running:'执行中',completed:'已完成',attention:'异常 / 失败',unknown:'其他'};
let rows=[],page=1,errors=[],loading=false,lastRefresh=0;
const pageSize=12;
const fmt=value=>{
 if(!value)return '—';
 const t=new Date(value);return Number.isNaN(+t)?'—':new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(t);
};
const n=value=>Number(value||0).toLocaleString('zh-CN');
const newEl=(tag,text,cls)=>{const el=document.createElement(tag);if(text!=null)el.textContent=String(text);if(cls)el.className=cls;return el;};
const cell=(row,value)=>{const td=newEl('td');if(typeof value==='string'||typeof value==='number')td.textContent=String(value);else if(value)td.append(value);row.append(td);return td;};
const info=(target,text)=>target.append(newEl('p',text));
function scopedData(table,fields,timefield,cutoff){
 const date=encodeURIComponent(cutoff.toISOString());
 return cloudRequest(table+'?select='+fields+'&'+timefield+'=gte.'+date+'&order='+timefield+'.desc&limit=800');
}
async function refresh(){
 if(loading||!currentUser())return;
 loading=true;$('daily-refresh').disabled=true;
 $('daily-updated').textContent='正在读取真实任务记录…';
 const cutoff=rangeStart('30d');
 const queries=[
  ['map',scopedData('lead_map_search_jobs','id,city,keyword,radius_km,status,processed,inserted,located_existing,skipped,error_message,created_at,started_at,completed_at','created_at',cutoff)],
  ['enrich',scopedData('lead_enrich_jobs','id,lead_id,status,attempts,added_count,checked_pages,error,created_at,started_at,finished_at,updated_at','created_at',cutoff)],
  ['exhibition',scopedData('freight_exhibition_sync_runs','id,status,scanned,added,filled,pending,failed,summary,errors,started_at,finished_at','started_at',cutoff)],
  ['mail',scopedData('email_tasks','id,status,scheduled_at,created_at,sent_at','created_at',cutoff)]
 ];
 const results=await Promise.allSettled(queries.map(x=>x[1]));
 rows=[];errors=[];
 for(let i=0;i<results.length;i++){
  const entry=results[i],kind=queries[i][0];
  if(entry.status==='fulfilled'&&Array.isArray(entry.value)){
   rows.push(...entry.value.map(x=>normalizeRun(kind,x)));
   if(entry.value.length===800)errors.push(names[kind]+'仅显示最近 800 条，可能有更多记录');
  }else errors.push(names[kind]+'读取失败，当前统计不包含这部分任务');
 }
 rows.sort((a,b)=>new Date(b.started||b.date).getTime()-new Date(a.started||a.date).getTime());
 lastRefresh=Date.now();
 $('daily-updated').textContent='最后同步 '+fmt(new Date())+(errors.length?' · '+errors.length+' 项数据源提示':'');
 loading=false;$('daily-refresh').disabled=false;page=1;render();
}
function currentRows(){
 const cutoff=rangeStart($('daily-range').value);
 return rows.filter(x=>new Date(x.date||x.started).getTime()>=cutoff.getTime());
}
function filteredRows(base){
 const kind=$('daily-kind').value,state=$('daily-state').value;
 return base.filter(x=>(kind==='all'||x.kind===kind)&&(state==='all'||x.phase===state));
}
function render(){
 const base=currentRows(),stats=dailyStats(base);
 for(const [key,value] of Object.entries({total:stats.total,running:stats.running,complete:stats.completed,alert:stats.attention,leads:stats.leads,contacts:stats.contacts}))
  $('kpi-'+key).textContent=n(value);
 renderModules(base);renderChart();renderRecords(filteredRows(base));renderWarnings(base);
}
function renderModules(data){
 const root=$('daily-modules');root.replaceChildren();
 for(const kind of ['map','enrich','exhibition','mail']){
  const subset=data.filter(x=>x.kind===kind);
  const line=newEl('a',null,'daily-module-row');line.href=urls[kind];
  const main=newEl('div');main.append(newEl('strong',names[kind]));
  main.append(newEl('small','任务 '+subset.length+' · 进行中 '+subset.filter(x=>x.phase==='running').length+' · 异常 '+subset.filter(x=>x.phase==='attention').length));
  line.append(main,newEl('span',subset.length?'查看记录 ›':'前往模块 ›'));root.append(line);
 }
}
function renderChart(){
 const root=$('daily-chart');root.replaceChildren();
 const now=Date.now();
 const seven=Array.from({length:7},(_,i)=>{
  const day=chinaDay(new Date(now-(6-i)*DAY));
  const r=rows.filter(x=>chinaDay(x.date||x.started)===day);
  return {day,ok:r.filter(x=>x.phase==='completed').length,failed:r.filter(x=>x.phase==='attention').length,running:r.filter(x=>x.phase==='running'||x.phase==='queued').length};
 });
 const max=Math.max(1,...seven.map(x=>x.ok+x.failed+x.running));
 for(const record of seven){
  const row=newEl('div',null,'daily-chart-row');
  row.append(newEl('span',record.day.slice(5),'daily-chart-day'));
  const track=newEl('div',null,'daily-bar-track');
  for(const [key,label] of [['ok','已完成'],['failed','异常'],['running','排队/执行']]){
   const value=record[key];if(!value)continue;
   const part=newEl('span',null,'daily-bar-'+key);
   part.style.width=(value/max*100)+'%';
   part.title=label+' '+value;
   track.append(part);
  }
  row.append(track,newEl('small',n(record.ok+record.failed+record.running)));
  root.append(row);
 }
 const legend=newEl('div',null,'daily-legend');
 for(const [key,label] of [['ok','已完成'],['failed','异常/部分完成'],['running','排队/执行']]){
  const item=newEl('span',label);item.className='daily-legend-'+key;legend.append(item);
 }
 root.append(legend);
}
function renderRecords(data){
 const root=$('daily-records');root.replaceChildren();
 const maxPages=Math.max(1,Math.ceil(data.length/pageSize));
 page=Math.max(1,Math.min(page,maxPages));
 const slice=data.slice((page-1)*pageSize,page*pageSize);
 $('daily-empty').hidden=Boolean(slice.length);
 for(const task of slice){
  const tr=newEl('tr');
  const target=newEl('div',null,'daily-task-title');target.append(newEl('strong',names[task.kind]),newEl('small',task.target));
  cell(tr,target);
  const status=newEl('span',statuses[task.phase]||task.status,'daily-status daily-status-'+task.phase);
  if(task.status==='partial')status.textContent='部分完成';
  if(isStale(task))status.textContent='运行中（超时未结束）';
  cell(tr,status);cell(tr,fmt(task.started||task.date));cell(tr,fmt(task.finish));
  cell(tr,n(task.count));cell(tr,task.metric+' '+n(task.result));
  const btn=newEl('button','详情','secondary daily-detail-btn');btn.type='button';btn.setAttribute('aria-expanded','false');
  cell(tr,btn);root.append(tr);
  const details=newEl('tr',null,'daily-details');details.hidden=true;
  const detailCell=newEl('td');detailCell.colSpan=7;
  const detailsBox=newEl('div',null,'daily-detail-box');
  detailsBox.append(newEl('strong','执行详情'));
  detailsBox.append(newEl('p','状态：'+task.status+' · 执行ID：'+task.id));
  if(task.kind==='map')detailsBox.append(newEl('p','处理 '+n(task.source.processed)+' · 新增 '+n(task.source.inserted)+' · 既有企业匹配 '+n(task.source.located_existing)+' · 跳过 '+n(task.source.skipped)));
  if(task.kind==='exhibition')detailsBox.append(newEl('p','扫描 '+n(task.count)+' · 新增 '+n(task.result)+' · 更新 '+n(task.source.filled)+' · 失败 '+n(task.failed)+' · 待办 '+n(task.pending)));
  if(task.kind==='enrich')detailsBox.append(newEl('p','尝试次数 '+n(task.attempts)+' · 检查页面 '+n(task.count)+' · 补充联系方式 '+n(task.result)));
  if(task.detail)detailsBox.append(newEl('p',task.detail));
  if(task.errors&&JSON.stringify(task.errors)!=='[]')detailsBox.append(newEl('p','异常摘要：'+JSON.stringify(task.errors).slice(0,900)));
  const a=newEl('a','打开对应管理板块 ›');a.href=urls[task.kind];detailsBox.append(a);
  detailCell.append(detailsBox);details.append(detailCell);root.append(details);
  btn.onclick=()=>{details.hidden=!details.hidden;btn.setAttribute('aria-expanded',String(!details.hidden));btn.textContent=details.hidden?'详情':'收起';};
 }
 $('daily-page-info').textContent='共 '+n(data.length)+' 条 · 第 '+page+' / '+maxPages+' 页';
 $('daily-prev').disabled=page<=1;$('daily-next').disabled=page>=maxPages;
}
function renderWarnings(data){
 const root=$('daily-warnings');root.replaceChildren();
 if(errors.length)for(const e of errors)root.append(newEl('p','数据源提醒：'+e,'daily-warning'));
 const issues=data.filter(x=>x.phase==='attention'||isStale(x)).slice(0,7);
 if(!issues.length&&!errors.length){root.append(newEl('p','当前筛选时间范围没有记录到失败或超时任务。','daily-ok'));return;}
 for(const task of issues){
  const div=newEl('div',null,'daily-warning-row');
  const header=newEl('div',null,'daily-warning-header');
  const a=newEl('a',names[task.kind]+' · '+task.target);a.href=urls[task.kind];header.append(a,newEl('small',fmt(task.started||task.date)));
  div.append(header,newEl('p',isStale(task)?'任务运行超过 3 小时，请检查后台执行器':task.detail||'任务有失败或部分完成项，请查看详情'));
  root.append(div);
 }
}
$('daily-refresh').addEventListener('click',refresh);
for(const id of ['daily-range','daily-kind','daily-state'])$(id).addEventListener('change',()=>{page=1;render();});
$('daily-prev').onclick=()=>{page--;render();};
$('daily-next').onclick=()=>{page++;render();};
if(currentUser())refresh();
setInterval(()=>{if(!document.hidden&&currentUser())void refresh();},60000);
