import {installContactProgress} from './contact-progress.js';
import {transferToCrm} from './crm-acquisition.js';
import {createListFilters} from './list-filters.js';
import {cloudRequest,currentUser,appRequest} from './cloud.js';
import {assessLead} from './lead-quality.js';
import {parseOvertureText} from './overture-import.js';
let liveRows=[],liveTaskId=null,liveSource='',candidateId=null,leadPage=1,leadRows=[],leadFilter='',failedOsmTask=null;
const selectedLeadIds=new Set();
const LEADS_PAGE_SIZE=15;
function syncSelection(){
 const count=selectedLeadIds.size;
 $('lead-selection').textContent='已选 '+count+' 家';$('batch-enrich').disabled=count===0;
}
function selectCurrentPage(){for(const checkbox of document.querySelectorAll('.lead-choose:not(:disabled)')){selectedLeadIds.add(checkbox.dataset.id);checkbox.checked=true;}syncSelection();}

function externalLink(url,label){const valid=cleanWebsite(url);if(!valid)return el('span','');const a=document.createElement('a');a.href=valid;a.target='_blank';a.rel='noopener noreferrer';a.textContent=label;return a;}
async function searchTask(taskId,source,button){
 button.disabled=true;failedOsmTask=null;$('switch-overture').hidden=true;$('live-notice').textContent='正在检索企业地点…';liveRows=[];liveTaskId=null;liveSource='';$('stage-selected').disabled=true;
 $('live-results').replaceChildren();
 try{
  if(source==='overture')throw Error('Overture 批量数据导入尚未配置，请先使用免费 OpenStreetMap。');
  const data=await appRequest(source==='openstreetmap'?'/api/discovery-osm':'/api/discovery-search',{method:'POST',body:JSON.stringify({task_id:taskId})});
  liveRows=data.results||[];liveTaskId=taskId;liveSource=source;
  for(const p of liveRows){
   const tr=document.createElement('tr');const select=document.createElement('input');select.type='checkbox';select.checked=source==='openstreetmap';select.disabled=source!=='openstreetmap';select.className='stage-check';select.dataset.id=p.place_id;const holder=document.createElement('span');holder.append(select);cell(tr,holder);cell(tr,p.name);cell(tr,p.address);
   const website=cleanWebsite(p.website);cell(tr,website?externalLink(website,website):'—');cell(tr,p.email||'—');cell(tr,p.phone||'—');
   cell(tr,externalLink(p.maps_url,source==='openstreetmap'?'在 OpenStreetMap 查看':'在 Google Maps 查看'));$('live-results').append(tr);
  }
  $('stage-selected').disabled=source!=='openstreetmap'||!liveRows.length;updateStageCount();
  $('live-notice').textContent='找到 '+(data.results||[]).length+' 家候选企业；仅实时展示，尚未保存到 CRM。'+(data.notice||'')+(data.errors?.length?' 部分关键词失败：'+data.errors.join('；'):'');
 }catch(e){$('live-notice').textContent='搜索失败：'+e.message+'。若多次出现 HTTP 500，请停止重试公共接口。';if(source==='openstreetmap'){failedOsmTask=taskId;$('switch-overture').hidden=false;}}
 finally{button.disabled=false;}
}

const $=id=>document.getElementById(id);const directProgress=installContactProgress('discovery:'+(currentUser()?.id||'guest'));
const el=(tag,text)=>{const node=document.createElement(tag);node.textContent=String(text??'');return node;};
function cell(tr,content){const td=document.createElement('td');if(content instanceof Node)td.append(content);else td.textContent=String(content??'');tr.append(td);return td;}
function cleanWebsite(value){try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)?u.href:null;}catch{return null;}}
async function loadTasks(cached=false){const body=$('tasks');body.replaceChildren();try{const tasks=cached?cachedTasks:await cloudRequest('lead_discovery_tasks?select=*&order=created_at.desc&limit=100');if(!cached)cachedTasks=tasks;$('tasks-empty').textContent=tasks.length?'':'暂无搜索任务。';const overtureSelect=$('overture-task'),oldValue=overtureSelect.value;overtureSelect.replaceChildren(new Option('请选择 Overture 城市任务',''));for(const task of tasks.filter(x=>x.source==='overture'))overtureSelect.append(new Option(task.country+' / '+task.city+' · '+task.id.slice(0,8),task.id));overtureSelect.value=oldValue;if(overtureSelect.selectedIndex<0)overtureSelect.value='';for(const t of taskFilters.apply(tasks)){const tr=document.createElement('tr');cell(tr,t.country);cell(tr,t.city);cell(tr,t.source);cell(tr,(t.keywords||[]).join('、'));cell(tr,t.target_count);cell(tr,t.status);cell(tr,new Date(t.created_at).toLocaleString());const b=document.createElement('button');b.textContent='实时搜索';b.className='secondary';let copy=null;if(t.source==='overture'){b.textContent='选择导入任务';copy=document.createElement('button');copy.type='button';copy.className='secondary';copy.textContent='复制任务ID';copy.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(t.id);copy.textContent='已复制';}catch{prompt('请复制 Overture 任务 ID',t.id);}});b.addEventListener('click',()=>{$('overture-task').value=t.id;$('overture-task').scrollIntoView({behavior:'smooth',block:'center'});});}else b.addEventListener('click',()=>searchTask(t.id,t.source,b));const buttons=document.createElement('div');buttons.append(b);if(t.source==='overture')buttons.append(copy);cell(tr,buttons);body.append(tr);}}catch(e){$('tasks-empty').textContent='无法读取任务：'+e.message+'（可能尚未执行数据库迁移）';}}
let cachedLeads=[],cachedTasks=[];
const candidateFilters=createListFilters('leads',[
 {id:'search',label:'公司 / 网站 / 联系方式',get:r=>[r.company_name,r.website,...(r.contacts||[]).map(c=>c.value)].join(' ')},
 {id:'country',label:'国家',get:r=>r.country},{id:'city',label:'城市',get:r=>r.city},
 {id:'provider',label:'来源',type:'select',options:[['overture','Overture'],['openstreetmap','OpenStreetMap'],['google_places','Google Places']],get:r=>r.provider},
 {id:'stage',label:'跟进阶段',get:r=>r.crm?.development_stage||'待开发'},
 {id:'channel',label:'联系方式',type:'select',options:[['email','有邮箱'],['phone','有电话'],['none','暂无联系方式']],get:r=>{const types=(r.contacts||[]).map(c=>c.type);return types.length?types.map(t=>t==='邮箱'?'email':t==='电话'?'phone':t):['none'];}},
 {id:'verification',label:'核实状态',get:r=>r.verification_status||'未验证'}
],()=>{leadPage=1;loadLeads(true);});
const taskFilters=createListFilters('tasks',[
 {id:'country',label:'国家',get:r=>r.country},{id:'city',label:'城市',get:r=>r.city},
 {id:'source',label:'来源',type:'select',options:[['overture','Overture'],['openstreetmap','OpenStreetMap'],['google_places','Google Places']],get:r=>r.source},
 {id:'status',label:'任务状态',get:r=>r.status}
],()=>loadTasks(true));
function leadContactCell(lead,types) {
 const box=document.createElement('div');for(const c of lead.contacts||[])if(types.includes(c.type)){
 box.append(el('div',c.value));const source=cleanWebsite(c.source_url);if(source){const a=document.createElement('a');a.href=source;a.target='_blank';a.rel='noopener noreferrer';a.className='source';a.textContent='来源链接';box.append(a);}}
 if(!box.childNodes.length)box.textContent='—';return box;
}
async function loadLeads(cached=false){const body=$('leads');body.replaceChildren();const status=$('lead-status').value;try{const query='lead_discovery_leads?select=*,crm:freight_companies(development_stage,is_key_customer)&order=created_at.desc&limit=500';const fetched=cached?cachedLeads:await cloudRequest(query);if(!cached)cachedLeads=fetched;
 const summary=$('discovery-overview');
 if(summary&&!cached){
  const all=await cloudRequest('lead_discovery_leads?select=id,review_status,website,crm_company_id&limit=500');
  const pending=all.filter(l=>l.review_status==='pending').length;
  const eligible=all.filter(l=>l.website?.startsWith('https://')).length;
  const reviewed=all.filter(l=>l.review_status==='reviewed').length;
  summary.textContent='当前加载 '+all.length+' 家线索 · 有 HTTPS 官网 '+eligible+' 家。所有已保存线索可直接跟进；完整客户目录支持统一查询与批量修改阶段。';
 }
 const qualityFilter=$('lead-quality-filter').value;const leads=candidateFilters.apply(fetched.filter(r=>!status||(r.crm?.development_stage||'待开发')===status).map(lead=>({...lead,_quality:assessLead(lead)})).filter(lead=>!qualityFilter||lead._quality.level===qualityFilter));leads.sort((a,b)=>a._quality.email_count+a._quality.phone_count-b._quality.email_count-b._quality.phone_count||a._quality.score-b._quality.score);leadRows=leads;const totalPages=Math.max(1,Math.ceil(leads.length/LEADS_PAGE_SIZE));leadPage=Math.min(leadPage,totalPages);$('leads-page').textContent='第 '+leadPage+' / '+totalPages+' 页 · '+leads.length+' 条（单次加载最多500条）';$('leads-prev').disabled=leadPage===1;$('leads-next').disabled=leadPage>=totalPages;$('leads-empty').textContent=leads.length?'':'暂无企业候选。';for(const lead of leads.slice((leadPage-1)*LEADS_PAGE_SIZE,leadPage*LEADS_PAGE_SIZE)){const tr=document.createElement('tr');const choose=document.createElement('input');choose.type='checkbox';choose.className='lead-choose';choose.dataset.id=lead.id;choose.disabled=!lead.website||!lead.website.startsWith('https://')||lead.provider==='google_places';choose.checked=selectedLeadIds.has(lead.id);choose.addEventListener('change',()=>{choose.checked?selectedLeadIds.add(lead.id):selectedLeadIds.delete(lead.id);syncSelection();});cell(tr,choose);cell(tr,lead.company_name);const u=cleanWebsite(lead.website);cell(tr,u?externalLink(u,u):'—');cell(tr,lead.country||'—');cell(tr,lead.city||'—');cell(tr,leadContactCell(lead,['email','邮箱']));cell(tr,leadContactCell(lead,['phone','电话']));

 const quality=lead._quality;const qBox=document.createElement('div');
 qBox.append(el('strong',quality.score+'分'));
 qBox.append(el('div',quality.level==='high'?'高优先级':quality.level==='medium'?'中优先级':'低优先级'));
 const evidenceBtn=document.createElement('button');evidenceBtn.type='button';evidenceBtn.className='secondary';evidenceBtn.textContent='证据';
 evidenceBtn.onclick=()=>showEvidence(lead);
 qBox.append(evidenceBtn);cell(tr,qBox);
 cell(tr,lead.verification_status||'未验证');const action=document.createElement('div');const stage=el('span',lead.crm?.development_stage||'待开发');action.append(stage);const add=document.createElement('button');add.type='button';add.className='secondary';add.textContent='补充联系';add.onclick=()=>{candidateId=lead.id;$('candidate-contact-form').reset();$('candidate-contact-error').textContent='';$('candidate-contact').showModal();};action.append(add);const enrich=document.createElement('button');enrich.type='button';enrich.className='secondary';enrich.textContent='官网核实';enrich.disabled=!lead.website;enrich.onclick=async()=>{if(directProgress.active)return;directProgress.start(1,'企业联系方式补全');directProgress.begin(lead.company_name);let recorded=false;enrich.disabled=true;enrich.textContent='核实中…';try{const result=await appRequest('/api/lead-enrich',{method:'POST',body:JSON.stringify({lead_id:lead.id})});directProgress.finish({name:lead.company_name,added:result.added,pages:result.checked_pages});recorded=true;$('enrich-summary').textContent=('已检查 '+result.checked_pages+' 页，新增 '+result.added+' 条待核实联系方式。'+(result.errors?.length?' 部分页面失败：'+result.errors.join('；'):''));await loadLeads();}catch(e){if(!recorded)directProgress.finish({name:lead.company_name,error:e.message});else directProgress.interrupt('结果已保存，但页面刷新失败：'+e.message);$('enrich-summary').textContent='官网提取失败：'+e.message;}finally{if(directProgress.active)directProgress.complete();enrich.textContent='官网提取联系方式';enrich.disabled=false;}};action.append(enrich);const imported=document.createElement('button');imported.type='button';imported.className='secondary';imported.textContent='直接跟进';imported.onclick=()=>transferToCrm('lead',lead,imported);action.append(imported);cell(tr,action);body.append(tr);}syncSelection();}catch(e){$('leads-empty').textContent='无法读取候选企业：'+e.message;}}
$('discovery-form').addEventListener('submit',async event=>{event.preventDefault();const f=event.currentTarget;const btn=f.querySelector('button[type=submit]');const fd=new FormData(f);const keywords=String(fd.get('keywords')||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean);if(!keywords.length){$('task-notice').textContent='请输入关键词';return;}btn.disabled=true;$('task-notice').textContent='保存中…';try{if(!currentUser())throw Error('请先在客户资源页面登录');await cloudRequest('lead_discovery_tasks',{method:'POST',body:JSON.stringify({country:fd.get('country'),city:fd.get('city'),source:fd.get('source'),keywords,target_count:Number(fd.get('target_count')),status:'pending'})});$('task-notice').textContent='任务已保存。点击任务列表中的“实时搜索”查询地图企业。';await loadTasks();}catch(e){$('task-notice').textContent='保存失败：'+e.message;}finally{btn.disabled=false;}});
$('refresh-tasks').addEventListener('click',()=>{loadTasks();loadLeads();});$('lead-status').addEventListener('change',()=>{leadPage=1;loadLeads();});loadTasks();loadLeads();loadEnrichJobs();
function showEvidence(lead){
 const q=assessLead(lead),d=$('lead-evidence-detail');d.replaceChildren();
 $('lead-evidence-title').textContent=lead.company_name+' · 证据评分 '+q.score+' / 100';
 const paragraph=document.createElement('p');paragraph.textContent=q.note;d.append(paragraph);
 const summary=document.createElement('p');summary.textContent='有效格式邮箱 '+q.email_count+' 条 · 电话 '+q.phone_count+' 条 · 不同网站来源 '+q.source_count+' 个';d.append(summary);
 const heading=(value)=>{const h=document.createElement('h3');h.textContent=value;d.append(h);};
 heading('加分依据');d.append(el('p',q.reasons.join('；')||'暂无充分公开证据'));
 heading('仍需人工核实');d.append(el('p',q.missing.join('；')||'仍需确认企业归属、邮箱有效性和联系许可'));
 heading('公开联系方式及原始来源');
 for(const c of lead.contacts||[]){
  const p=document.createElement('p');p.textContent=(c.type||'联系方式')+'：'+(c.value||'');d.append(p);
  if(c.source_url){const a=externalLink(c.source_url,'查看原始来源');d.append(a);}
 }
 heading('其他来源记录');
 for(const e of lead.source_evidence||[]){
  const p=document.createElement('p');p.textContent=(e.attribution||e.source||'来源')+' · '+(e.checked_at||e.observed_at||'');d.append(p);
  if(e.url)d.append(externalLink(e.url,'打开来源页面'));
 }
 $('lead-evidence-dialog').showModal();
}
$('lead-evidence-close').addEventListener('click',()=>$('lead-evidence-dialog').close());
$('lead-quality-filter').addEventListener('change',()=>{leadPage=1;selectedLeadIds.clear();loadLeads();});
function updateStageCount(){const n=document.querySelectorAll('.stage-check:checked').length;$('stage-count').textContent='已选 '+n+' 家（单次最多80家）';$('stage-selected').disabled=liveSource!=='openstreetmap'||n===0;}
$('live-results').addEventListener('change',e=>{if(e.target.classList.contains('stage-check'))updateStageCount();});
$('stage-selected').addEventListener('click',async()=>{
 if(liveSource!=='openstreetmap'||!liveTaskId)return;
 const chosen=new Set([...document.querySelectorAll('.stage-check:checked')].map(e=>e.dataset.id));
 const rows=liveRows.filter(p=>chosen.has(p.place_id)).slice(0,80);
 const btn=$('stage-selected');btn.disabled=true;
 try{const count=await cloudRequest('rpc/lead_stage_osm',{method:'POST',body:JSON.stringify({p_task_id:liveTaskId,p_rows:rows})});$('live-notice').textContent='本次新保存 '+count+' 家候选企业；重复的 OSM 地点已跳过。已同步客户目录，可直接跟进。';await loadLeads();}
 catch(e){$('live-notice').textContent='候选保存失败：'+e.message;}
 finally{updateStageCount();}
});
$('candidate-contact-close').addEventListener('click',()=>$('candidate-contact').close());
$('candidate-contact-form').addEventListener('submit',async e=>{
 e.preventDefault();const form=e.currentTarget;const fd=new FormData(form);
 const value=String(fd.get('value')||'').trim(),type=fd.get('type'),source_url=cleanWebsite(String(fd.get('source_url')||''));
 if(!source_url){$('candidate-contact-error').textContent='请填写合法的 HTTP(S) 公开来源 URL';return;}
 if(type==='email'&&!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)){$('candidate-contact-error').textContent='邮箱格式无效';return;}
 if(type==='phone'&&!/^[+()0-9\s.-]{5,40}$/.test(value)){$('candidate-contact-error').textContent='电话格式无效';return;}
 const btn=form.querySelector('[type=submit]');btn.disabled=true;
 try{
  const found=await cloudRequest('lead_discovery_leads?id=eq.'+encodeURIComponent(candidateId)+'&select=id,contacts,crm_company_id');
  if(found.length!==1)throw Error('线索不存在或无权访问');
  const contacts=Array.isArray(found[0].contacts)?found[0].contacts:[];if(contacts.some(c=>c.type===type&&String(c.value).toLowerCase()===value.toLowerCase()))throw Error('该联系方式已经存在');
  await cloudRequest('lead_discovery_leads?id=eq.'+encodeURIComponent(candidateId),{method:'PATCH',body:JSON.stringify({contacts:[...contacts,{type,value,source_url}],verification_status:'unverified',review_status:'pending'})});
  $('candidate-contact').close();await loadLeads();
 }catch(err){$('candidate-contact-error').textContent=err.message;}finally{btn.disabled=false;}
});

$('select-all-leads').addEventListener('click',selectCurrentPage);
$('clear-leads').addEventListener('click',()=>{selectedLeadIds.clear();for(const box of document.querySelectorAll('.lead-choose'))box.checked=false;syncSelection();});
$('leads-prev').addEventListener('click',()=>{leadPage=Math.max(1,leadPage-1);loadLeads(true);});
$('leads-next').addEventListener('click',()=>{leadPage++;loadLeads(true);});
$('batch-enrich').addEventListener('click',async()=>{
 const ids=[...selectedLeadIds];
 if(!ids.length)return;
 const button=$('batch-enrich');button.disabled=true;
 try{
  const data=await appRequest('/api/lead-batch',{method:'POST',body:JSON.stringify({ids})});
  $('enrich-summary').textContent=(data.message||data.error||'任务已提交')+'（已入队 '+(data.queued||0)+'，已派发 '+(data.published||0)+'）';
  selectedLeadIds.clear();syncSelection();await loadEnrichJobs();
 }catch(e){$('enrich-summary').textContent='批量任务创建失败：'+e.message;}
 finally{syncSelection();}
});
let enrichPoll=null;
function showEnrichProgress(jobs,names){let box=$('enrich-live-progress');if(!box){box=document.createElement('div');box.id='enrich-live-progress';box.className='enrich-live-progress';box.style.cssText='padding:14px 20px;background:#f0f8f5;border-radius:8px;margin:12px 0';const title=document.createElement('strong');title.textContent='后台补全进度 · 每10秒自动刷新';const bar=document.createElement('progress');bar.id='enrich-live-bar';bar.style.cssText='width:100%;height:14px;display:block;margin:10px 0';bar.setAttribute('aria-label','后台任务已处理进度');const text=document.createElement('p');text.id='enrich-live-text';text.setAttribute('role','status');box.append(title,bar,text);$('enrich-summary').after(box);}const done=jobs.filter(x=>['completed','failed'].includes(x.status)).length,active=jobs.filter(x=>x.status==='running'),queued=jobs.filter(x=>x.status==='queued').length;$('enrich-live-bar').max=Math.max(1,jobs.length);$('enrich-live-bar').value=done;$('enrich-live-text').textContent='当前加载 '+jobs.length+' 个任务 · 已处理 '+done+' / '+jobs.length+' · 排队 '+queued+' · 执行中 '+active.length+(active.length?' · 正在处理：'+active.slice(0,3).map(j=>names.get(j.lead_id)||j.lead_id.slice(0,8)).join('、'):'');return queued>0||active.length>0;}
async function loadEnrichJobs(){clearTimeout(enrichPoll);let needsPoll=false;
 const tbody=$('enrich-jobs');tbody.replaceChildren();
 try{
  const jobs=await cloudRequest('lead_enrich_jobs?select=id,lead_id,status,attempts,added_count,checked_pages,error,created_at,finished_at&order=created_at.desc&limit=500');
  const names=new Map(leadRows.map(l=>[l.id,l.company_name]));needsPoll=showEnrichProgress(jobs,names);
  const stats={queued:0,running:0,completed:0,failed:0};
  for(const j of jobs)stats[j.status]=(stats[j.status]||0)+1;
  $('enrich-summary').textContent='任务 '+jobs.length+' 条 · 排队 '+stats.queued+' · 执行中 '+stats.running+' · 成功 '+stats.completed+' · 失败 '+stats.failed+'（任务记录保存在数据库，离开页面不丢失）';
  const labels={queued:'排队中',running:'执行中',completed:'已完成',failed:'失败，可重试'};
  for(const job of jobs.slice(0,80)){
   const tr=document.createElement('tr');
   cell(tr,names.get(job.lead_id)||job.lead_id);
   cell(tr,labels[job.status]||job.status);cell(tr,job.attempts);
   cell(tr,job.added_count);cell(tr,job.checked_pages);
   cell(tr,job.finished_at?new Date(job.finished_at).toLocaleString():'—');const statusCell=cell(tr,job.error||'—');
   if(job.status==='failed'){
    const retry=document.createElement('button');retry.type='button';retry.className='secondary';retry.textContent='重试';
    retry.onclick=async()=>{retry.disabled=true;try{const x=await appRequest('/api/lead-batch',{method:'POST',body:JSON.stringify({ids:[job.lead_id]})});$('enrich-summary').textContent=x.message||x.error||'任务已重新提交';await loadEnrichJobs();}catch(e){alert('重新派发失败：'+e.message);}finally{retry.disabled=false;}};
    statusCell.append(document.createElement('br'),retry);
   }
   tbody.append(tr);
  }
 }catch(e){$('enrich-summary').textContent='任务状态读取失败：'+e.message;needsPoll=true;}finally{if(needsPoll&&!document.hidden)enrichPoll=setTimeout(()=>loadEnrichJobs(),10000);}
}
document.addEventListener('visibilitychange',()=>{if(document.hidden)clearTimeout(enrichPoll);else if(currentUser())loadEnrichJobs();});
$('dispatch-queued-enrich').addEventListener('click',async()=>{
 const button=$('dispatch-queued-enrich');button.disabled=true;
 try{
  const jobs=await cloudRequest('lead_enrich_jobs?select=lead_id&status=eq.queued&order=created_at.asc&limit=500');
  const ids=[...new Set(jobs.map(j=>j.lead_id))];
  if(!ids.length){$('enrich-summary').textContent='目前没有等待派发的官网核实任务。';return;}
  const result=await appRequest('/api/lead-batch',{method:'POST',body:JSON.stringify({ids})});
  $('enrich-summary').textContent=(result.message||result.error||'已请求派发')+' · 已排队 '+(result.queued||0)+' · 已派发 '+(result.published||0)+'。';
  await loadEnrichJobs();
 }catch(e){$('enrich-summary').textContent='派发失败：'+e.message;}
 finally{button.disabled=false;}
});
$('refresh-enrich').addEventListener('click',()=>{loadEnrichJobs();loadLeads();});

let overturePreview=null;
function resetOverturePreview(){overturePreview=null;$('overture-import').disabled=true;}
for(const id of ['overture-file','overture-release','overture-task','overture-confirm-region'])$(id).addEventListener('change',resetOverturePreview);
$('overture-preview').addEventListener('click',async()=>{
 resetOverturePreview();const file=$('overture-file').files?.[0];
 if(!file){$('overture-summary').textContent='请选择提取文件';return;}
 if(file.size>12*1024*1024){$('overture-summary').textContent='超过12MB，请先按城市拆分';return;}
 if(!$('overture-task').value){$('overture-summary').textContent='先选择来源为 Overture 的搜索任务';return;}if(!$('overture-confirm-region').checked){$('overture-summary').textContent='请先确认文件的国家/城市范围与来源许可';return;}
 const release=$('overture-release').value.trim();if(!/^20\d{2}-\d{2}-\d{2}(\.\d+)?$/.test(release)){$('overture-summary').textContent='版本格式应为 YYYY-MM-DD.1';return;}
 try{const parsed=parseOvertureText(await file.text(),file.name);
  if(!parsed.rows.length)throw Error('文件中没有有效 Overture 企业地点');
  overturePreview={...parsed,taskId:$('overture-task').value,release,filename:file.name};
  $('overture-summary').textContent='原始 '+parsed.original+' 条 · 有效去重后 '+parsed.rows.length+' 条 · 文件内重复 '+parsed.duplicate+' 条 · 无效 '+parsed.invalid+' 条。确认城市与来源许可后可以导入。';
  $('overture-import').disabled=false;
 }catch(e){$('overture-summary').textContent='校验失败：'+e.message;}
});
$('overture-import-form').addEventListener('submit',async e=>{
 e.preventDefault();const data=overturePreview;if(!data)return;
 if(!$('overture-confirm-region').checked||data.taskId!==$('overture-task').value||data.release!==$('overture-release').value.trim()){resetOverturePreview();$('overture-summary').textContent='任务或版本已改变，请重新预览';return;}
 const button=$('overture-import');button.disabled=true;let inserted=0,skipped=0,completed=0;
 try{
  for(let i=0;i<data.rows.length;i+=50){
   const result=await cloudRequest('rpc/lead_stage_overture',{method:'POST',body:JSON.stringify({p_task_id:data.taskId,p_release:data.release,p_rows:data.rows.slice(i,i+50)})});
   inserted+=Number(result.inserted||0);skipped+=Number(result.skipped||0);completed+=Math.min(50,data.rows.length-i);
   $('overture-summary').textContent='正在导入 '+completed+' / '+data.rows.length+' · 新增 '+inserted+' · 跳过 '+skipped;
  }
  $('overture-summary').textContent='导入完成：新增 '+inserted+' 条，跳过重复/无效 '+skipped+' 条。已同步客户目录，可直接跟进。';await loadLeads();
 }catch(err){$('overture-summary').textContent='部分导入完成 '+completed+'/'+data.rows.length+'：新增 '+inserted+'、跳过 '+skipped+'。错误：'+err.message+'。重新执行不会重复导入相同 ID。';}
 finally{button.disabled=false;}
});

$('switch-overture').addEventListener('click',async()=>{
 if(!failedOsmTask)return;
 const button=$('switch-overture');button.disabled=true;
 try{
  const [old]=await cloudRequest('lead_discovery_tasks?id=eq.'+encodeURIComponent(failedOsmTask)+'&select=country,city,keywords,target_count&limit=1');
  if(!old)throw Error('原搜索任务不存在');
  const existing=await cloudRequest('lead_discovery_tasks?source=eq.overture&country=eq.'+encodeURIComponent(old.country)+'&city=eq.'+encodeURIComponent(old.city)+'&select=id&limit=1');
  let id=existing[0]?.id;
  if(!id){
   const created=await cloudRequest('lead_discovery_tasks',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({...old,source:'overture',status:'pending'})});
   id=created?.[0]?.id;if(!id)throw Error('无法创建 Overture 任务');
  }
  await loadTasks();$('overture-task').value=id;
  document.getElementById('overture-import-form').scrollIntoView({behavior:'smooth',block:'start'});
  $('overture-summary').textContent='已选择 '+old.country+' / '+old.city+'。下一步请上传该城市范围的 Overture GeoJSON/NDJSON 文件并预览。';
 }catch(e){$('live-notice').textContent='切换 Overture 任务失败：'+e.message;}
 finally{button.disabled=false;}
});

async function loadOvertureBatches(){
 const body=$('overture-batches');body.replaceChildren();
 try{
  const batches=await cloudRequest('lead_overture_batches?select=batch_key,task_id,release,source_bbox,expected_count,processed,inserted,skipped,status,updated_at&order=updated_at.desc&limit=100');
  const tasks=await cloudRequest('lead_discovery_tasks?select=id,country,city&source=eq.overture&limit=100');
  const names=new Map(tasks.map(t=>[t.id,t]));
  const statuses={running:'处理中',completed:'已完成',failed:'失败'};
  $('overture-batches-summary').textContent='共 '+batches.length+' 个后台导入批次。记录保存在 Supabase，刷新或退出页面不会丢失。';
  for(const b of batches){
   const tr=document.createElement('tr');
   cell(tr,names.get(b.task_id)?.country||'—');cell(tr,names.get(b.task_id)?.city||b.task_id);cell(tr,b.release);
   cell(tr,statuses[b.status]||b.status);
   cell(tr,b.processed);cell(tr,b.expected_count);
   cell(tr,b.inserted);cell(tr,b.skipped);
   cell(tr,new Date(b.updated_at).toLocaleString());
   body.append(tr);
  }
 }catch(e){$('overture-batches-summary').textContent='读取批次失败：'+e.message;}
}
$('refresh-overture-batches').addEventListener('click',loadOvertureBatches);
$('issue-overture-token').addEventListener('click',async()=>{
 const button=$('issue-overture-token');
 if(!confirm('生成新专用密钥会使之前的 GitHub OVERTURE_INGEST_SECRET 失效。确定继续吗？'))return;
 button.disabled=true;
 try{
  const secret=await cloudRequest('rpc/lead_overture_issue_ingest_token',{method:'POST',body:'{}'});
  if(typeof secret!=='string'||secret.length!==64)throw Error('密钥生成返回异常');
  $('overture-token-text').textContent=secret;
  $('overture-token-display').hidden=false;
  $('overture-token-notice').textContent='请立即复制到 GitHub 仓库 Settings → Secrets and variables → Actions。仅显示一次。';
 }catch(e){$('overture-token-notice').textContent='生成失败：'+e.message;}
 finally{button.disabled=false;}
});
$('copy-overture-token').addEventListener('click',async()=>{
 const value=$('overture-token-text').textContent;
 try{await navigator.clipboard.writeText(value);$('overture-token-notice').textContent='已复制，请粘贴到 GitHub Actions Secret。';}
 catch{$('overture-token-notice').textContent='浏览器禁止自动复制，请手动选择显示的密钥。';}
});
$('close-overture-token').addEventListener('click',()=>{
 $('overture-token-text').textContent='';$('overture-token-display').hidden=true;
 $('overture-token-notice').textContent='密钥已从当前页面清除。';
});
loadOvertureBatches();
