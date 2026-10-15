import {cloudRequest,currentUser,appRequest} from './cloud.js';
let liveRows=[],liveTaskId=null,liveSource='',candidateId=null,leadPage=1,leadRows=[],leadFilter='';
const selectedLeadIds=new Set();
const LEADS_PAGE_SIZE=40;
function syncSelection(){
 const count=selectedLeadIds.size;
 $('lead-selection').textContent='已选 '+count+' 家';$('batch-enrich').disabled=count===0;
}
function selectCurrentPage(){for(const checkbox of document.querySelectorAll('.lead-choose:not(:disabled)')){selectedLeadIds.add(checkbox.dataset.id);checkbox.checked=true;}syncSelection();}

function externalLink(url,label){const valid=cleanWebsite(url);if(!valid)return el('span','');const a=document.createElement('a');a.href=valid;a.target='_blank';a.rel='noopener noreferrer';a.textContent=label;return a;}
async function searchTask(taskId,source,button){
 button.disabled=true;$('live-notice').textContent='正在检索企业地点…';liveRows=[];liveTaskId=null;liveSource='';$('stage-selected').disabled=true;
 $('live-results').replaceChildren();
 try{
  if(source==='overture')throw Error('Overture 批量数据导入尚未配置，请先使用免费 OpenStreetMap。');
  const data=await appRequest(source==='openstreetmap'?'/api/discovery-osm':'/api/discovery-search',{method:'POST',body:JSON.stringify({task_id:taskId})});
  liveRows=data.results||[];liveTaskId=taskId;liveSource=source;
  for(const p of liveRows){
   const tr=document.createElement('tr');const select=document.createElement('input');select.type='checkbox';select.checked=source==='openstreetmap';select.disabled=source!=='openstreetmap';select.className='stage-check';select.dataset.id=p.place_id;const holder=document.createElement('span');holder.append(select);cell(tr,holder);cell(tr,p.name);cell(tr,p.address);
   const box=document.createElement('div');if(p.email)box.append(el('div','公开邮箱：'+p.email));if(p.website)box.append(externalLink(p.website,'企业官网'),document.createElement('br'));box.append(el('span',p.phone));cell(tr,box);
   cell(tr,externalLink(p.maps_url,source==='openstreetmap'?'在 OpenStreetMap 查看':'在 Google Maps 查看'));$('live-results').append(tr);
  }
  $('stage-selected').disabled=source!=='openstreetmap'||!liveRows.length;updateStageCount();
  $('live-notice').textContent='找到 '+(data.results||[]).length+' 家候选企业；仅实时展示，尚未保存到 CRM。'+(data.notice||'')+(data.errors?.length?' 部分关键词失败：'+data.errors.join('；'):'');
 }catch(e){$('live-notice').textContent='搜索失败：'+e.message;}
 finally{button.disabled=false;}
}

const $=id=>document.getElementById(id);
const el=(tag,text)=>{const node=document.createElement(tag);node.textContent=String(text??'');return node;};
function cell(tr,content){const td=document.createElement('td');if(content instanceof Node)td.append(content);else td.textContent=String(content??'');tr.append(td);return td;}
function cleanWebsite(value){try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)?u.href:null;}catch{return null;}}
async function loadTasks(){const body=$('tasks');body.replaceChildren();try{const tasks=await cloudRequest('lead_discovery_tasks?select=*&order=created_at.desc&limit=100');$('tasks-empty').textContent=tasks.length?'':'暂无搜索任务。';for(const t of tasks){const tr=document.createElement('tr');cell(tr,[t.country,t.city].filter(Boolean).join(' / '));cell(tr,(t.keywords||[]).join('、'));cell(tr,t.target_count);cell(tr,t.status);cell(tr,new Date(t.created_at).toLocaleString());const b=document.createElement('button');b.textContent='实时搜索';b.className='secondary';b.addEventListener('click',()=>searchTask(t.id,t.source,b));cell(tr,b);body.append(tr);}}catch(e){$('tasks-empty').textContent='无法读取任务：'+e.message+'（可能尚未执行数据库迁移）';}}
async function loadLeads(){const body=$('leads');body.replaceChildren();const status=$('lead-status').value;try{const query='lead_discovery_leads?select=*&order=created_at.desc&limit=500'+(status?'&review_status=eq.'+encodeURIComponent(status):'');const leads=await cloudRequest(query);leadRows=leads;const totalPages=Math.max(1,Math.ceil(leads.length/LEADS_PAGE_SIZE));leadPage=Math.min(leadPage,totalPages);$('leads-page').textContent=leadPage+' / '+totalPages+'（当前最多显示500条候选）';$('leads-prev').disabled=leadPage===1;$('leads-next').disabled=leadPage>=totalPages;$('leads-empty').textContent=leads.length?'':'暂无企业候选。';for(const lead of leads.slice((leadPage-1)*LEADS_PAGE_SIZE,leadPage*LEADS_PAGE_SIZE)){const tr=document.createElement('tr');const choose=document.createElement('input');choose.type='checkbox';choose.className='lead-choose';choose.dataset.id=lead.id;choose.disabled=!lead.website||!lead.website.startsWith('https://')||!!lead.crm_company_id||lead.provider==='google_places';choose.checked=selectedLeadIds.has(lead.id);choose.addEventListener('change',()=>{choose.checked?selectedLeadIds.add(lead.id):selectedLeadIds.delete(lead.id);syncSelection();});cell(tr,choose);const company=document.createElement('div');company.append(el('strong',lead.company_name));const u=cleanWebsite(lead.website);if(u){const a=document.createElement('a');a.href=u;a.target='_blank';a.rel='noopener noreferrer';a.textContent=u;company.append(document.createElement('br'),a);}cell(tr,company);cell(tr,[lead.country,lead.city].filter(Boolean).join(' / '));const contact=document.createElement('div');for(const c of (lead.contacts||[])){contact.append(el('div',[c.type,c.value].filter(Boolean).join('：')));if(c.source_url){const source=cleanWebsite(c.source_url);if(source){const a=document.createElement('a');a.href=source;a.target='_blank';a.rel='noopener noreferrer';a.className='source';a.textContent='来源链接';contact.append(a);}}}cell(tr,contact);cell(tr,lead.verification_status||'未验证');const action=document.createElement('div');const controls=document.createElement('select');for(const [value,label] of [['pending','待核实'],['reviewed','已审核'],['rejected','不相关']]){const option=new Option(label,value);option.selected=value===lead.review_status;controls.add(option);}controls.addEventListener('change',async()=>{controls.disabled=true;try{await cloudRequest('lead_discovery_leads?id=eq.'+encodeURIComponent(lead.id),{method:'PATCH',body:JSON.stringify({review_status:controls.value})});}catch(e){alert('审核失败：'+e.message);controls.value=lead.review_status;}finally{controls.disabled=false;}});action.append(controls);const add=document.createElement('button');add.type='button';add.className='secondary';add.textContent='补充联系方式';add.onclick=()=>{candidateId=lead.id;$('candidate-contact-form').reset();$('candidate-contact-error').textContent='';$('candidate-contact').showModal();};action.append(add);const enrich=document.createElement('button');enrich.type='button';enrich.className='secondary';enrich.textContent='官网提取联系方式';enrich.disabled=!lead.website||!!lead.crm_company_id;enrich.onclick=async()=>{enrich.disabled=true;enrich.textContent='官网检查中…';try{const result=await appRequest('/api/lead-enrich',{method:'POST',body:JSON.stringify({lead_id:lead.id})});alert('已检查 '+result.checked_pages+' 页，新增 '+result.added+' 条待核实联系方式。'+(result.errors?.length?' 部分页面失败：'+result.errors.join('；'):''));await loadLeads();}catch(e){alert('官网提取失败：'+e.message);}finally{enrich.textContent='官网提取联系方式';enrich.disabled=false;}};action.append(enrich);const imported=document.createElement('button');imported.type='button';imported.className='secondary';imported.textContent=lead.crm_company_id?'已入库':'导入 CRM';imported.disabled=!!lead.crm_company_id||lead.review_status!=='reviewed';imported.onclick=async()=>{imported.disabled=true;try{const result=await cloudRequest('rpc/lead_import_reviewed',{method:'POST',body:JSON.stringify({p_lead_id:lead.id})});if(result.status==='possible_duplicate'){alert('发现可能重复的 CRM 企业，请先到客户资源页面核实：'+result.company_id);}else{alert(result.status==='imported'?'已成功导入 CRM，联系方式默认禁止邮件发送。':'已导入，无需重复操作。');await loadLeads();}}catch(e){alert('导入失败：'+e.message);}finally{imported.disabled=false;}};action.append(imported);controls.addEventListener('change',()=>{imported.disabled=controls.value!=='reviewed';});cell(tr,action);body.append(tr);}syncSelection();}catch(e){$('leads-empty').textContent='无法读取候选企业：'+e.message;}}
$('discovery-form').addEventListener('submit',async event=>{event.preventDefault();const f=event.currentTarget;const btn=f.querySelector('button[type=submit]');const fd=new FormData(f);const keywords=String(fd.get('keywords')||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean);if(!keywords.length){$('task-notice').textContent='请输入关键词';return;}btn.disabled=true;$('task-notice').textContent='保存中…';try{if(!currentUser())throw Error('请先在客户资源页面登录');await cloudRequest('lead_discovery_tasks',{method:'POST',body:JSON.stringify({country:fd.get('country'),city:fd.get('city'),source:fd.get('source'),keywords,target_count:Number(fd.get('target_count')),status:'pending'})});$('task-notice').textContent='任务已保存。点击任务列表中的“实时搜索”查询地图企业。';await loadTasks();}catch(e){$('task-notice').textContent='保存失败：'+e.message;}finally{btn.disabled=false;}});
$('refresh-tasks').addEventListener('click',()=>{loadTasks();loadLeads();});$('lead-status').addEventListener('change',()=>{leadPage=1;loadLeads();});loadTasks();loadLeads();loadEnrichJobs();
function updateStageCount(){const n=document.querySelectorAll('.stage-check:checked').length;$('stage-count').textContent='已选 '+n+' 家（单次最多80家）';$('stage-selected').disabled=liveSource!=='openstreetmap'||n===0;}
$('live-results').addEventListener('change',e=>{if(e.target.classList.contains('stage-check'))updateStageCount();});
$('stage-selected').addEventListener('click',async()=>{
 if(liveSource!=='openstreetmap'||!liveTaskId)return;
 const chosen=new Set([...document.querySelectorAll('.stage-check:checked')].map(e=>e.dataset.id));
 const rows=liveRows.filter(p=>chosen.has(p.place_id)).slice(0,80);
 const btn=$('stage-selected');btn.disabled=true;
 try{const count=await cloudRequest('rpc/lead_stage_osm',{method:'POST',body:JSON.stringify({p_task_id:liveTaskId,p_rows:rows})});$('live-notice').textContent='本次新保存 '+count+' 家候选企业；重复的 OSM 地点已跳过。请在下方人工审核。';await loadLeads();}
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
  if(found.length!==1||found[0].crm_company_id)throw Error('线索已入库或不存在，不能在此修改');
  const contacts=Array.isArray(found[0].contacts)?found[0].contacts:[];if(contacts.some(c=>c.type===type&&String(c.value).toLowerCase()===value.toLowerCase()))throw Error('该联系方式已经存在');
  await cloudRequest('lead_discovery_leads?id=eq.'+encodeURIComponent(candidateId),{method:'PATCH',body:JSON.stringify({contacts:[...contacts,{type,value,source_url}],verification_status:'unverified',review_status:'pending'})});
  $('candidate-contact').close();await loadLeads();
 }catch(err){$('candidate-contact-error').textContent=err.message;}finally{btn.disabled=false;}
});

$('select-all-leads').addEventListener('click',selectCurrentPage);
$('clear-leads').addEventListener('click',()=>{selectedLeadIds.clear();for(const box of document.querySelectorAll('.lead-choose'))box.checked=false;syncSelection();});
$('leads-prev').addEventListener('click',()=>{leadPage=Math.max(1,leadPage-1);loadLeads();});
$('leads-next').addEventListener('click',()=>{leadPage++;loadLeads();});
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
async function loadEnrichJobs(){
 const tbody=$('enrich-jobs');tbody.replaceChildren();
 try{
  const jobs=await cloudRequest('lead_enrich_jobs?select=id,lead_id,status,attempts,added_count,checked_pages,error,created_at,finished_at&order=created_at.desc&limit=500');
  const names=new Map(leadRows.map(l=>[l.id,l.company_name]));
  const stats={queued:0,running:0,completed:0,failed:0};
  for(const j of jobs)stats[j.status]=(stats[j.status]||0)+1;
  $('enrich-summary').textContent='任务 '+jobs.length+' 条 · 排队 '+stats.queued+' · 执行中 '+stats.running+' · 成功 '+stats.completed+' · 失败 '+stats.failed+'（任务记录保存在数据库，离开页面不丢失）';
  const labels={queued:'排队中',running:'执行中',completed:'已完成',failed:'失败，可重试'};
  for(const job of jobs.slice(0,80)){
   const tr=document.createElement('tr');
   cell(tr,names.get(job.lead_id)||job.lead_id);
   cell(tr,(labels[job.status]||job.status)+' · 第'+job.attempts+'次');
   cell(tr,job.added_count);cell(tr,job.checked_pages);
   cell(tr,job.error||job.finished_at?job.error||new Date(job.finished_at).toLocaleString():'—');
   tbody.append(tr);
  }
 }catch(e){$('enrich-summary').textContent='任务状态读取失败：'+e.message;}
}
$('refresh-enrich').addEventListener('click',()=>{loadEnrichJobs();loadLeads();});
