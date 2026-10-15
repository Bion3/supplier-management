import {cloudRequest,currentUser,appRequest} from './cloud.js';
let liveRows=[],liveTaskId=null,liveSource='',candidateId=null;
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
async function loadLeads(){const body=$('leads');body.replaceChildren();const status=$('lead-status').value;try{const query='lead_discovery_leads?select=*&order=created_at.desc&limit=100'+(status?'&review_status=eq.'+encodeURIComponent(status):'');const leads=await cloudRequest(query);$('leads-empty').textContent=leads.length?'':'暂无企业候选。';for(const lead of leads){const tr=document.createElement('tr');const company=document.createElement('div');company.append(el('strong',lead.company_name));const u=cleanWebsite(lead.website);if(u){const a=document.createElement('a');a.href=u;a.target='_blank';a.rel='noopener noreferrer';a.textContent=u;company.append(document.createElement('br'),a);}cell(tr,company);cell(tr,[lead.country,lead.city].filter(Boolean).join(' / '));const contact=document.createElement('div');for(const c of (lead.contacts||[])){contact.append(el('div',[c.type,c.value].filter(Boolean).join('：')));if(c.source_url){const source=cleanWebsite(c.source_url);if(source){const a=document.createElement('a');a.href=source;a.target='_blank';a.rel='noopener noreferrer';a.className='source';a.textContent='来源链接';contact.append(a);}}}cell(tr,contact);cell(tr,lead.verification_status||'未验证');const action=document.createElement('div');const controls=document.createElement('select');for(const [value,label] of [['pending','待核实'],['reviewed','已审核'],['rejected','不相关']]){const option=new Option(label,value);option.selected=value===lead.review_status;controls.add(option);}controls.addEventListener('change',async()=>{controls.disabled=true;try{await cloudRequest('lead_discovery_leads?id=eq.'+encodeURIComponent(lead.id),{method:'PATCH',body:JSON.stringify({review_status:controls.value})});}catch(e){alert('审核失败：'+e.message);controls.value=lead.review_status;}finally{controls.disabled=false;}});action.append(controls);const add=document.createElement('button');add.type='button';add.className='secondary';add.textContent='补充联系方式';add.onclick=()=>{candidateId=lead.id;$('candidate-contact-form').reset();$('candidate-contact-error').textContent='';$('candidate-contact').showModal();};action.append(add);const imported=document.createElement('button');imported.type='button';imported.className='secondary';imported.textContent=lead.crm_company_id?'已入库':'导入 CRM';imported.disabled=!!lead.crm_company_id||lead.review_status!=='reviewed';imported.onclick=async()=>{imported.disabled=true;try{const result=await cloudRequest('rpc/lead_import_reviewed',{method:'POST',body:JSON.stringify({p_lead_id:lead.id})});if(result.status==='possible_duplicate'){alert('发现可能重复的 CRM 企业，请先到客户资源页面核实：'+result.company_id);}else{alert(result.status==='imported'?'已成功导入 CRM，联系方式默认禁止邮件发送。':'已导入，无需重复操作。');await loadLeads();}}catch(e){alert('导入失败：'+e.message);}finally{imported.disabled=false;}};action.append(imported);controls.addEventListener('change',()=>{imported.disabled=controls.value!=='reviewed';});cell(tr,action);body.append(tr);}}catch(e){$('leads-empty').textContent='无法读取候选企业：'+e.message;}}
$('discovery-form').addEventListener('submit',async event=>{event.preventDefault();const f=event.currentTarget;const btn=f.querySelector('button[type=submit]');const fd=new FormData(f);const keywords=String(fd.get('keywords')||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean);if(!keywords.length){$('task-notice').textContent='请输入关键词';return;}btn.disabled=true;$('task-notice').textContent='保存中…';try{if(!currentUser())throw Error('请先在客户资源页面登录');await cloudRequest('lead_discovery_tasks',{method:'POST',body:JSON.stringify({country:fd.get('country'),city:fd.get('city'),source:fd.get('source'),keywords,target_count:Number(fd.get('target_count')),status:'pending'})});$('task-notice').textContent='任务已保存，等待后端采集服务接入；目前不会自动搜索。';await loadTasks();}catch(e){$('task-notice').textContent='保存失败：'+e.message;}finally{btn.disabled=false;}});
$('refresh-tasks').addEventListener('click',()=>{loadTasks();loadLeads();});$('lead-status').addEventListener('change',loadLeads);loadTasks();loadLeads();
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
