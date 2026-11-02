import {cloudRequest,currentUser} from './cloud.js';
import {DAY,days,ms,stats,recent,stage} from './tracking-model.js';
const $=id=>document.getElementById(id),el=(tag,text,cls)=>{const e=document.createElement(tag);if(text!=null)e.textContent=String(text);if(cls)e.className=cls;return e;};
const num=v=>v==null?'—':v.toFixed(1)+'天',date=v=>v?v.replace('T',' ').slice(0,16):'—';
let reports=[],incidents=[],imports=[],page=1,tab='analysis',candidate=null,busy=false,asOf='',exportRows=[];
function row(root,values){const r=el('tr');for(const v of values){const td=el('td');if(v instanceof Node)td.append(v);else td.textContent=String(v??'—');r.append(td);}root.append(r);return r;}
function withSmall(a,b){const d=el('div');d.append(el('strong',a),el('small',b));return d;}
async function all(path){const rows=[];for(let offset=0;;offset+=500){const part=await cloudRequest(path+(path.includes('?')?'&':'?')+'limit=500&offset='+offset);rows.push(...part);if(part.length<500)return rows;}}
function selectedOp(){return $('operator').value;}
function period(){return [$('from').value,$('to').value];}
function baseRows(useRange=true){const [start,end]=period(),op=selectedOp(),dest=$('dest').value,q=$('query').value.trim().toUpperCase();return reports.filter(r=>!op||r.operator===op).filter(r=>!useRange||recent(r.summary,start,end)).filter(r=>!dest||r.summary.dests.some(d=>d.dest===dest)).filter(r=>!q||r.summary.name.toUpperCase().includes(q)||r.summary.containerNos?.some(n=>n.includes(q))).map(r=>{if(!dest)return r;const d=r.summary.dests.find(d=>d.dest===dest);return {...r,summary:{...r.summary,dests:[d],total:d.total,arrived:d.arrived,stages:d.stages}};});}
function historical(t){return t.arrived<t.total&&(ms(t.asOf+'T23:59:59')-ms(t.departure||t.planned))/DAY>90;}
function activeIncidents(){const [start,end]=period(),q=$('query').value.trim().toUpperCase(),op=selectedOp(),dest=$('dest').value,state=$('incident-state').value;return incidents.map(i=>i.detail).filter(i=>(!op||i.operator===op)&&(!dest||i.dest===dest)&&(!q||(i.train+' '+i.container).toUpperCase().includes(q))&&(!state||(state==='open'?i.open:!i.open))&&i.events.some(e=>e.at&&e.at.slice(0,10)>=start&&e.at.slice(0,10)<=end));}
function setRange(){const end=asOf||new Date().toISOString().slice(0,10);$('to').value=end;$('from').value=new Date(Date.parse(end+'T00:00:00Z')-29*DAY).toISOString().slice(0,10);}
async function refresh(){if(busy||!currentUser())return;busy=true;$('refresh').disabled=true;$('sync').textContent='正在读取运踪摘要…';try{
 imports=await cloudRequest('freight_tracking_imports?select=id,filename,operator,as_of,train_count,incident_count,status,created_at&order=as_of.desc,created_at.desc&limit=50');
 asOf=imports.filter(i=>i.status==='complete').map(i=>i.as_of).sort().at(-1)||'';
 if(!$('from').value)setRange();
 const [start,end]=period(),span=Math.max(1,(Date.parse(end)-Date.parse(start))/DAY+1),cutoff=new Date(Date.parse(start+'T00:00:00Z')-span*DAY).toISOString().slice(0,10);
 [reports,incidents]=await Promise.all([all('freight_tracking_latest?select=*&service_date=gte.'+cutoff+'&service_date=lte.'+end+'&order=operator,train_key'),all('freight_tracking_latest_incidents?select=*&last_update=gte.'+cutoff+'&order=id')]);
 const savedOp=$('operator').value,savedDest=$('dest').value;
 $('operator').replaceChildren(new Option('全部运营商',''),...[...new Set(reports.map(r=>r.operator))].sort().map(v=>new Option(v,v)));
 $('dest').replaceChildren(new Option('全部目的站',''),...[...new Set(reports.flatMap(r=>r.summary.dests.map(d=>d.dest)))].sort().map(v=>new Option(v,v)));
 $('operator').value=savedOp;$('dest').value=savedDest;
 if(!$('from').value)setRange();
 $('sync').textContent=`附件报表截至 ${asOf||'未导入'} · 仅加载所选日期及前一期摘要，共 ${reports.length} 班 · 最近 ${imports.length} 份导入记录。报表不是实时运踪。`;
 render();
 }catch(e){$('sync').textContent='读取失败：'+e.message;$('sync').className='tracking-error';}finally{busy=false;$('refresh').disabled=false;}}
function render(){
 const rows=baseRows(),ts=rows.map(r=>r.summary),total=ts.reduce((s,t)=>s+t.total,0),arrived=ts.reduce((s,t)=>s+t.arrived,0),unknown=ts.filter(historical).reduce((s,t)=>s+t.total-t.arrived,0);
 const kpis=[['班列数',rows.length,'按班次统计'],['已到达箱',arrived,`共 ${total} 箱`],['未有实到记录',total-arrived,'含待转、在途及待确认'],['异常未关闭',activeIncidents().filter(i=>i.open).length,'按异常更新时间筛选'],['历史待确认箱',unknown,'超过90天且无实到记录']];
 $('kpis').replaceChildren();for(const [label,n,note] of kpis){const a=el('article');a.append(el('small',label),el('strong',n.toLocaleString()),el('span',note));$('kpis').append(a);}
 renderAnalysis(ts);renderTrains(rows);renderIncidents();renderSources();
}
function grouped(ts){const groups=new Map();for(const t of ts)for(const d of t.dests){if($('dest').value&&d.dest!==$('dest').value)continue;const key=t.operator+' / '+d.dest;if(!groups.has(key))groups.set(key,[]);groups.get(key).push({t,d});}return groups;}
function renderAnalysis(ts){
 const root=$('analysis-rows');root.replaceChildren();exportRows=[];
 const groups=grouped(ts);
 for(const [key,items] of [...groups].sort()){
  const v=stats(items.map(x=>x.d.totalDays)),border=stats(items.map(x=>x.t.borderDays)),cis=stats(items.map(x=>x.d.malaDays)),eu=stats(items.map(x=>x.d.euDays));
  const vals=[key,v.n,num(v.mean),num(v.median),num(v.p90),num(border.mean)+' / '+border.n,num(cis.mean)+' / '+cis.n,num(eu.mean)+' / '+eu.n];row(root,vals);if(tab==='analysis')exportRows.push(vals);
 }
 if(!groups.size)row(root,['所选范围暂无班次，请调整日期或运营商。']);
 const cmp=$('comparison');cmp.replaceChildren();const [start,end]=period(),length=(Date.parse(end)-Date.parse(start))/DAY+1;
 const prevStart=new Date(Date.parse(start+'T00:00:00Z')-length*DAY).toISOString().slice(0,10),prevEnd=new Date(Date.parse(start+'T00:00:00Z')-DAY).toISOString().slice(0,10);
 const previous=baseRows(false).map(r=>r.summary).filter(t=>recent(t,prevStart,prevEnd)),prev=grouped(previous);
 $('border-comparison').replaceChildren();for(const op of [...new Set(ts.map(t=>t.operator))]){const a=stats(ts.filter(t=>t.operator===op).map(t=>t.borderDays)),b=stats(previous.filter(t=>t.operator===op).map(t=>t.borderDays));const change=a.n>=3&&b.n>=3?`，较前期${a.mean>b.mean?'延长':'缩短'} ${num(Math.abs(a.mean-b.mean))}`:'，样本不足，不判断趋势';$('border-comparison').append(el('div',`${op}：本期 ${num(a.mean)}（${a.n} 班），前期 ${num(b.mean)}（${b.n} 班）${change}。`,'tracking-comparison'));}
 for(const [key,items] of [...groups].sort()){
  const a=stats(items.map(x=>x.d.totalDays)),b=stats((prev.get(key)||[]).map(x=>x.d.totalDays));
  const text=a.n>=3&&b.n>=3?`本期 ${num(a.mean)}，前期 ${num(b.mean)}，${a.mean>b.mean?'延长':'缩短'} ${num(Math.abs(a.mean-b.mean))}（样本 ${a.n} / ${b.n}）`:`完整全程样本 ${a.n} / ${b.n}；任一期少于3个，不判断改善或恶化。`;
  cmp.append(el('div',key+'：'+text,'tracking-comparison'));
 }
 const stages={};for(const t of ts){if(historical(t)){stages['历史待确认']=(stages['历史待确认']||0)+t.total-t.arrived;continue;}for(const [key,n] of Object.entries(t.stages))if(key!=='已到达')stages[key]=(stages[key]||0)+n;}
 $('stages').replaceChildren();for(const [key,n] of Object.entries(stages)){const d=el('div',null,'tracking-stage');d.append(el('span',key),el('b',n+'箱'));$('stages').append(d);}
}
function renderTrains(rows){
 const state=$('state').value;rows=rows.filter(({summary:t})=>!state||state==='open'&&t.arrived<t.total&&!historical(t)||state==='partial'&&t.arrived>0&&t.arrived<t.total||state==='done'&&t.arrived===t.total||state==='unknown'&&historical(t));
 rows.sort((a,b)=>(b.summary.departure||b.summary.planned||'').localeCompare(a.summary.departure||a.summary.planned||''));
 const pages=Math.max(1,Math.ceil(rows.length/20));page=Math.min(Math.max(1,page),pages);const root=$('train-rows');root.replaceChildren();
 for(const r of rows.slice((page-1)*20,page*20)){
  const t=r.summary,button=el('button','详情','secondary');button.onclick=()=>openDetail(r);
  const phase=historical(t)?'历史待确认':Object.entries(t.stages).map(([k,n])=>k+' '+n+'箱').join(' / '),stale=days(t.lastUpdate,t.asOf+'T23:59:59');
  const vals=[withSmall(t.name,t.operator),withSmall(date(t.departure||t.planned),t.departure?'实际 ATD':'班次编码日期；非实际 ATD'),t.dests.map(d=>d.dest).join(' / '),t.arrived+' / '+t.total,withSmall(phase,t.remarks?t.remarks+'箱有原文备注':''),withSmall(t.locations.map(e=>e.location+(e.remark?' · '+e.remark:'')).join('；')||'无有效位置更新',date(t.lastUpdate)+(t.arrived<t.total&&stale>3?' · 距报表 '+Math.floor(stale)+'天':'')),num(t.borderDays),button];row(root,vals);
 }
 if(!rows.length)row(root,['没有匹配班列。']);$('page-info').textContent=`共 ${rows.length} 班 · 第 ${page} / ${pages} 页`;$('prev').disabled=page===1;$('next').disabled=page===pages;
 if(tab==='transit')exportRows=rows.map(({summary:t})=>[t.name,t.operator,t.departure||'',t.planned||'',t.arrived,t.total,t.lastUpdate||'',t.borderDays??'']);
}
function renderIncidents(){const list=activeIncidents().sort((a,b)=>(b.events.at(-1)?.at||'').localeCompare(a.events.at(-1)?.at||''));const root=$('incident-rows');root.replaceChildren();
 for(const i of list){const last=i.events.at(-1),timeline=el('details'),summary=el('summary',last?.text||'无更新');timeline.append(summary);for(const e of i.events)timeline.append(el('p',date(e.at)+' · '+e.text));row(root,[withSmall(i.train,i.operator),withSmall(i.container,i.dest),i.problem,timeline,date(last?.at),i.open?'未关闭（原表）':'已关闭（原表）']);}
 if(!list.length)row(root,['所选范围没有匹配异常记录。']);$('incident-count').textContent=`共 ${list.length} 条异常记录；多箱共用一条异常时保留原箱号组合。`;
 if(tab==='incidents')exportRows=list.map(i=>[i.train,i.operator,i.container,i.dest,i.problem,i.events.at(-1)?.text,i.events.at(-1)?.at,i.open?'未关闭':'已关闭']);
}
function renderSources(){const root=$('source-rows');root.replaceChildren();for(const s of imports){const d=el('div',null,'tracking-source');d.append(el('strong',s.filename),el('small',`${s.operator} · 截至 ${s.as_of} · ${s.train_count} 班 / ${s.incident_count} 条异常 · ${s.status==='complete'?'已入库':'未完成，可重试导入'} · 导入 ${s.created_at.slice(0,16).replace('T',' ')} UTC`));root.append(d);}if(tab==='sources')exportRows=imports.map(s=>[s.filename,s.operator,s.as_of,s.train_count,s.incident_count,s.status]);}
async function openDetail(r){$('detail-title').textContent=r.summary.name+' · '+r.operator;$('detail-body').textContent='正在读取逐箱运踪…';$('detail').showModal();try{
 const [result]=await cloudRequest('freight_tracking_reports?select=detail&id=eq.'+encodeURIComponent(r.id));if(!result)throw Error('未找到详情');const t=result.detail,root=$('detail-body');root.replaceChildren();
 root.append(el('p',`${t.filename} / ${t.name} · 报表截至 ${t.asOf}`),el('p',`实际 ATD：${date(t.departure)} · 依据：${t.departureBasis||'缺失'} · 国内班次：${t.domesticTrain||'未关联'}`),el('p','顶部 Latest 节点仅作正常箱参考，不替代下方逐箱到达。','tracking-warning'));
 const latest=el('p',Object.entries(t.latest).filter(([,v])=>v).map(([k,v])=>k+' '+date(v)).join('；'));root.append(latest);
 const wrap=el('div',null,'tracking-scroll'),table=el('table'),head=el('thead'),body=el('tbody');row(head,['箱号 / Part','目的站 / 场站','马拉实到','欧洲段实发','预计到达','实际到达','阶段 / 原文备注']);table.append(head,body);wrap.append(table);root.append(wrap);
 for(const c of t.containers)row(body,[withSmall(c.number,c.part+' · 来源行 '+c.row),withSmall(c.dest,c.terminal),date(c.mala),date(c.euDeparture),date(c.eta),date(c.arrival),withSmall(stage(c,t),c.remark)]);
 root.append(el('h3','独联体段位置与分批原文'));const list=el('ul',null,'tracking-events');for(const e of t.events)list.append(el('li',`${date(e.at)} · ${e.location} · ${e.km??'—'}km 至布列斯特 · ${e.remark}（行${e.row}）`));root.append(list);
 const issues=incidents.filter(i=>i.operator===t.operator&&i.train_key===t.key);if(issues.length){root.append(el('h3','关联异常'));for(const i of issues)root.append(el('p',i.detail.container+' · '+i.detail.problem+' · '+i.detail.events.at(-1)?.text));}
 }catch(e){$('detail-body').textContent='读取失败：'+e.message;}}
function parseFile(input,onBatch){return new Promise((resolve,reject)=>{const worker=new Worker('/src/tracking-worker.js');const fail=e=>{worker.terminate();reject(e);};worker.onerror=e=>fail(Error(e.message||'解析进程失败'));worker.onmessage=async({data:d})=>{if(d.type==='error')fail(Error(d.message));else if(d.type==='done'){worker.terminate();resolve(d);}else if(d.type==='progress')$('import-info').textContent=(input.mode==='preview'?'解析预览':'逐表保存')+' '+d.done+' / '+d.total+' 张工作表…';else if(d.type==='batch'){try{await onBatch(d.batch);worker.postMessage({ack:true});}catch(e){fail(e);}}};worker.postMessage(input);});}
async function previewImport(){candidate=null;$('save-import').hidden=true;const file=$('import-file').files[0],operator=$('import-operator').value,asOf=$('import-date').value;if(!file||!asOf){$('import-info').textContent='请选择文件并填写报表截至日期。';return;}if(file.size>30*1024*1024){$('import-info').textContent='单份文件请控制在30MB以内。';return;}
 $('preview-import').disabled=true;$('import-info').textContent='正在逐表解析…';try{
 const parsed=await parseFile({file,operator,asOf,mode:'preview'}),{hash,counts,index}=parsed,id=hash+'-'+operator+'-'+asOf;
 const duplicate=await cloudRequest('freight_tracking_imports?select=as_of&id=like.'+encodeURIComponent(hash+'-'+operator+'-%')+'&status=eq.complete&limit=1');if(duplicate.length){$('import-info').textContent='该文件已导入（截至 '+duplicate[0].as_of+'），不重复保存。';return;}
 if(!counts.trains&&!counts.incidents&&!counts.domestic)throw Error('未识别到支持的运踪模板');
 candidate={id,file,operator,asOf,filename:file.name,counts,index};$('import-info').textContent='已识别 '+counts.trains+' 班、'+counts.containers+' 箱、'+counts.incidents+' 条异常、'+counts.domestic+' 个国内班次。预览只保留计数；保存时逐表读取，仅写入变化内容。';$('save-import').hidden=false;
 }catch(e){$('import-info').textContent='解析失败：'+e.message;}finally{$('preview-import').disabled=false;}}
async function saveImport(){if(!candidate)return;const c=candidate;$('save-import').disabled=true;$('preview-import').disabled=true;try{
 const domestic=c.counts.trains?(await all('freight_tracking_domestic_latest?select=ref&order=ref->>name')).map(r=>({...r.ref,events:[]})):[];
 const metadata={id:c.id,filename:c.filename,operator:c.operator,as_of:c.asOf,train_count:c.counts.trains,incident_count:c.counts.incidents,domestic:[],status:'pending'};
 await cloudRequest('freight_tracking_imports?on_conflict=id',{method:'POST',headers:{Prefer:'resolution=ignore-duplicates'},body:JSON.stringify(metadata)});
 let changed=0,unchanged=0;await parseFile({file:c.file,operator:c.operator,asOf:c.asOf,mode:'save',domestic,universe:c.index},async b=>{const r=await cloudRequest('rpc/freight_tracking_ingest',{method:'POST',body:JSON.stringify({p_import:c.id,p_trains:b.trains,p_cases:b.cases,p_domestic:b.domestic})});changed+=r.changed;unchanged+=r.unchanged;});
 const saved=await cloudRequest('freight_tracking_imports?id=eq.'+encodeURIComponent(c.id),{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({status:'complete'})});if(saved.length!==1)throw Error('导入确认失败');candidate=null;$('save-import').hidden=true;$('import-info').textContent='已保存：新增或变化 '+changed+' 项，未变化复用 '+unchanged+' 项。历史版本保留，旧报表不覆盖新报表。';$('import-file').value='';await refresh();
 }catch(e){$('import-info').textContent='保存中断：'+e.message+'。未完成快照不计入看板，可重试保存。';}finally{$('save-import').disabled=false;$('preview-import').disabled=false;}}
function exportCsv(){const headers={analysis:['运营商/目的站','完整样本','平均全程','中位数','P90','口岸停留/样本','独联体/样本','欧洲/样本'],transit:['班次','运营商','实际发运','班次日期','实到箱','总箱数','位置更新','口岸天数'],incidents:['班次','运营商','箱号','目的站','问题','最新进展','更新时间','关闭状态'],sources:['文件','运营商','截至日期','班列','异常','状态']};const quote=v=>'"'+String(v??'').replace(/^[=+@-]/,"'$&").replaceAll('"','""')+'"';const blob=new Blob(['\ufeff'+[headers[tab],...exportRows].map(r=>r.map(quote).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=el('a');a.href=url;a.download=`运踪-${tab}-${asOf}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
for(const b of document.querySelectorAll('[data-tab]'))b.onclick=()=>{tab=b.dataset.tab;for(const x of document.querySelectorAll('[data-tab]'))x.setAttribute('aria-pressed',String(x===b));for(const name of ['analysis','transit','incidents','sources'])$(name).hidden=name!==tab;render();};
for(const id of ['operator','dest','query','state','incident-state'])$(id).addEventListener(id==='query'?'input':'change',()=>{if($('from').value&&$('to').value&&$('from').value<=$('to').value){page=1;render();}});
let rangeTimer;for(const id of ['from','to'])$(id).addEventListener('change',()=>{if($('from').value&&$('to').value&&$('from').value<=$('to').value){clearTimeout(rangeTimer);rangeTimer=setTimeout(()=>{page=1;refresh();},350);}});
for(const id of ['import-operator','import-date','import-file'])$(id).addEventListener('change',()=>{candidate=null;$('save-import').hidden=true;});
$('refresh').onclick=refresh;$('reset').onclick=()=>{setRange();page=1;refresh();};$('prev').onclick=()=>{page--;render();};$('next').onclick=()=>{page++;render();};$('show-import').onclick=()=>{$('import-panel').hidden=!$('import-panel').hidden;};$('preview-import').onclick=previewImport;$('save-import').onclick=saveImport;$('close-detail').onclick=()=>$('detail').close();$('export').onclick=exportCsv;$('import-date').value=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Shanghai'});if(currentUser())refresh();

$('detail').addEventListener('close',()=>{$('detail-body').replaceChildren();});
