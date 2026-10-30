import {templatePool,assignTemplates} from './mail-templates.js';
import {outreachPlan,handoffContacts} from './mail-acquisition-model.js';
import {companyGroupOptions} from './crm-model.js';
import {installDraftBulk} from './mail-drafts.js';
import {installMailVerification} from './mail-verification.js';
import {createPager} from './pagination.js';
import {mailContent,personaliseBody} from './mail-content.js';
import {createMailEditor} from './mail-editor.js';
import {defaultRules,chinaInput,scheduleISO,validateRules} from './mail-rules.js';
import {login,logout,currentUser,cloudRequest,appRequest,syncAuthShell} from './cloud.js';
import {personalise,validateMail,validEmail,filterRecipients,regionInfo,groupNames,selectRows,selectionState,emailContactScope} from './mail-model.js';
const $=id=>document.getElementById(id);
const selectedTemplates=new Set();
let draftBulk=null,mailView="recipients";
try{const saved=sessionStorage.getItem("mail-active-panel");if(["recipients","compose","drafts"].includes(saved))mailView=saved;}catch{}
let companies=[],contacts=[],templates=[],messages=[],selected=new Set(),page=1,previewRows=[],savedDrafts=[],configured=false,epoch=0,previewBusy=false;
const pager=createPager('prev','next',(value,newSize)=>{page=value-0;render();},30);
const editor=createMailEditor($('body'),$('editor-toolbar'),message=>{$('editor-error').textContent=message;});
let rules={...defaultRules};
const names=()=>new Map(companies.map(c=>[c.id,c]));
async function all(table,order='id.asc'){const rows=[];for(let offset=0;;offset+=500){const batch=await cloudRequest(`${table}?select=*&order=${order}&limit=500&offset=${offset}`);rows.push(...batch);if(batch.length<500)return rows;}}
function authUI(){syncAuthShell();}
async function load(){const e=++epoch;try{const data=await Promise.all([all('freight_companies'),all('freight_contacts'),all('freight_mail_templates'),all('freight_mail_messages','created_at.desc,id.desc'),appRequest('/api/mail')]);if(e!==epoch)return;[companies,contacts,templates,messages]=data;configured=data[4].configured;rules=data[4].rules||{...defaultRules};fillRuleSettings();selected=new Set([...selected].filter(id=>contacts.some(c=>c.id===id)));applyHandoff();$('connection').textContent=configured?'专用密码已配置，可发送测试邮件验证连接。':'尚未配置 SMTP_PASSWORD；模板、预览和草稿可使用，发送暂不可用。';$('test-mail').disabled=!configured;renderTemplates();renderFilterOptions();render();$('notice').textContent='邮件数据已同步。';}catch(err){if(e===epoch){$('notice').textContent=err.message;authUI();}}}
function cell(text){const td=document.createElement('td');td.textContent=text;return td;}
function button(text,fn){const b=document.createElement('button');b.type='button';b.className='secondary';b.textContent=text;b.addEventListener('click',async()=>{b.disabled=true;try{await fn();}catch(e){$('notice').textContent=e.message;}finally{b.disabled=false;}});return b;}
function renderTemplates(){const purpose=$('purpose').value;$('template').replaceChildren();for(const t of templatePool(templates,purpose)){const o=document.createElement('option');o.value=t.id;o.textContent=t.name;$('template').append(o);}useTemplate();renderTemplatePool();}
function useTemplate(){const t=templatePool(templates,$('purpose').value).find(t=>t.id===$('template').value);$('subject').value=t?.subject||'';editor.set(t?.body||'');$('template-name').value=t?.name?.replace(/^参考 · /,'')||'';}
function filters(){return {stage:$('stage').value,focus:$('focus').value,source:$('source').value,query:$('search').value,status:$('status').value,role:$('role').value,region:$('region').value,verification:$('verification').value,allowed:$('allowed').value,group:$('group').value,sendable:$('view-mode').value==='sendable',selectedOnly:$('view-mode').value==='selected',selected};}
function filtered(){return filterRecipients(contacts,companies,filters());}
function renderFilterOptions(){
 for(const [id,values,label] of [['region',companies.map(c=>regionInfo(c).value),'全部地区'],['role',[...companies.map(c=>c.role||'待核实'),'直客','指定货发货人','同行','海外代理','客户兼供应商','其他'],'全部类型'],['group',companyGroupOptions(companies,contacts).map(g=>g.name),'全部分组']]){
  const select=$(id),previous=select.value;select.replaceChildren();const all=document.createElement('option');all.value='';all.textContent=label;select.append(all);
  if(id==='group'){const empty=document.createElement('option');empty.value='__ungrouped';empty.textContent='未分组';select.append(empty);}
  for(const name of [...new Set(values)].sort((a,b)=>a.localeCompare(b,'zh-CN'))){const o=document.createElement('option');o.value=name;o.textContent=name;select.append(o);}select.value=previous;if(select.selectedIndex<0)select.value='';
 }
}
function applyMailView(){
 $('recipient-panel').hidden=mailView!=='recipients';$('compose-panel').hidden=mailView!=='compose';$('draft-panel').hidden=mailView!=='drafts';$('recipient-actions').hidden=mailView==='drafts';
 $('preview').hidden=mailView!=='compose';$('prepare-send').hidden=mailView!=='recipients';
 for(const button of document.querySelectorAll('[data-mail-view]')){button.setAttribute('aria-pressed',String(button.dataset.mailView===mailView));button.disabled=button.dataset.mailView==='compose'&&!selected.size&&mailView!=='compose';}
}
function setMailView(view){
 if(!['recipients','compose','drafts'].includes(view))return;
 if(view==='compose'&&!selected.size&&mailView!=='compose'){$('notice').textContent='请先选择客户邮箱。';return;}
 mailView=view;try{sessionStorage.setItem('mail-active-panel',view);}catch{}applyMailView();
}
for(const button of document.querySelectorAll('[data-mail-view]'))button.addEventListener('click',()=>setMailView(button.dataset.mailView));
function render(){
 const company=names(),rows=filtered();
 const pages=Math.max(1,Math.ceil(rows.length/pager.size));page=Math.min(Math.max(1,page),pages);$('recipient-count').textContent=`筛选 ${rows.length} 条 / 已选 ${selected.size}`;$('page').textContent=`${page} / ${pages}`;$('prev').disabled=page===1;$('next').disabled=page===pages;
 const plan=currentPlan(),ready=plan.rows.length;
 $('composer-summary').textContent=`已选 ${selected.size} 条 · 可发送 ${ready} 个不同邮箱`;
 $('selection-summary').textContent=`已选 ${selected.size} 条 · 可发送 ${ready} 个不同邮箱 · 跳过 ${plan.skipped.length} 条`;
 $('prepare-send').disabled=ready===0;
 $('clear-selection').disabled=selected.size===0;
 pager.update(rows.length,page);
 const pageRows=rows.slice((page-1)*pager.size,page*pager.size),checkState=selectionState(selected,pageRows);Object.assign($('select-all-page'),checkState);
 $('recipients').replaceChildren();for(const c of pageRows){
  const co=company.get(c.company_id),tr=document.createElement('tr'),choose=cell(''),checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=selected.has(c.id);checkbox.disabled=false;checkbox.setAttribute('aria-label','选择 '+c.value);checkbox.addEventListener('change',()=>{if(checkbox.checked)selected.add(c.id);else selected.delete(c.id);render();});choose.append(checkbox);if(selected.has(c.id))tr.className='recipient-selected';
  const verify=cell(c.status);if(c.status!=='有效'&&validEmail(c.value)&&c.email_allowed!==false)verify.append(button('标记有效',async()=>{await updateContactRows([c.id],{status:'有效'});render();}));
  const opt=cell(c.email_allowed!==false?'允许':'停止联系');opt.append(button(c.email_allowed!==false?'停止联系':'恢复联系',()=>setAllowed(c,c.email_allowed===false)));
  const region=regionInfo(co),location=cell(region.value);if(region.inferred){const note=document.createElement('small');note.className='region-inferred';note.textContent='地区按地址推断';location.append(note);}
  const email=cell(c.value),groups=cell('');for(const group of c.mail_groups||[]){const badge=document.createElement('span');badge.className='mail-group-badge';badge.textContent=group;groups.append(badge);}
  tr.append(choose,cell(co?.company_name||'—'),cell(c.name||'姓名待补充'),location,cell(co?.role||'待核实'),email,groups,verify,opt);$('recipients').append(tr);
 }
 draftBulk?.render();applyMailView();
}
async function setAllowed(contact,value){const email=contact.value.trim().toLowerCase();for(const c of contacts.filter(c=>c.channel==='邮箱'&&c.value.trim().toLowerCase()===email)){await cloudRequest('freight_contacts?id=eq.'+encodeURIComponent(c.id),{method:'PATCH',body:JSON.stringify({email_allowed:value})});c.email_allowed=value;selected.delete(c.id);}render();}
function showPreview(rows,drafts=[]){$('preview-skips').hidden=true;if(previewBusy)throw Error("正在保存或发送，请稍候。");previewRows=rows;savedDrafts=drafts;$('preview-send-mode').value=rules.send_mode;$('preview-send-date').value=rules.default_scheduled_at?chinaInput(rules.default_scheduled_at):'';updatePreviewMode();$('previews').replaceChildren();for(const r of rows){const details=document.createElement('details'),summary=document.createElement('summary'),pre=document.createElement('pre');details.open=true;summary.textContent=r.recipient+' · '+r.subject;const content=mailContent(r.body);if(content.html){pre.style.whiteSpace='normal';pre.innerHTML=content.html;}else pre.textContent=content.text;details.append(summary,pre);$('previews').append(details);}$('preview-error').textContent='';$('preview-count').textContent=`本次 ${rows.length} 封 · ${selected.size>rows.length?'剩余选择保留至下一批':'逐封预览后发送'}`;$('send-batch').disabled=!configured||rows.some(r=>r.status&&r.status!=='draft');$('save-drafts').disabled=drafts.length>0;if(!$('preview-dialog').open)$('preview-dialog').showModal();}
function openSaved(m){showPreview([m],[m]);}
async function ensureDrafts(){if(savedDrafts.length===previewRows.length)return savedDrafts;for(const row of previewRows.slice(savedDrafts.length)){const result=await cloudRequest('freight_mail_messages',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({...row,owner_id:currentUser().id})});if(result.length!==1)throw Error('草稿保存失败');savedDrafts.push(result[0]);messages.unshift(result[0]);}render();$('save-drafts').disabled=true;return savedDrafts;}
async function sendBatch(){
 const mode=$('preview-send-mode').value,date=mode==='scheduled'?scheduleISO($('preview-send-date').value):null;
 await ensureDrafts();let submitted=0;const e=epoch;
 try{
  // Connection tests still use their dedicated server path.
  if(savedDrafts.length===1&&savedDrafts[0].purpose==='测试'){
   const m=savedDrafts[0],result=await appRequest('/api/mail',{method:'POST',body:JSON.stringify({id:m.id})});Object.assign(m,result);submitted=1;return;
  }
  const pending=savedDrafts.filter(m=>m.status==='draft');
  for(let i=0;i<pending.length;i+=1000){
   if(e!==epoch)throw Error('页面或账号已变化，请刷新任务核对。');
   const batch=pending.slice(i,i+1000),result=await appRequest('/api/mail-batch',{method:'POST',body:JSON.stringify({ids:batch.map(m=>m.id),mode,...(date?{scheduled_at:date}:{})})});
   if(e!==epoch)throw Error('页面或账号已变化，请刷新任务核对。');
   if(!Array.isArray(result.results)||result.results.length!==batch.length||new Set(result.results.map(r=>r.id)).size!==batch.length||result.results.some(r=>!batch.some(m=>m.id===r.id)))throw Error('提交结果不完整，请刷新任务核对。');
   const errors=[];
   for(const item of result.results){const m=batch.find(m=>m.id===item.id);if(item.status==='scheduled'){Object.assign(m,item);submitted++;for(const c of contacts)if(c.value.trim().toLowerCase()===m.recipient.toLowerCase())selected.delete(c.id);}else errors.push(item.error||'未提交');}
   if(errors.length)throw Error(errors.length+' 封未提交，保留草稿：'+errors[0]);
  }
 }catch(error){if(e===epoch){try{messages=await all('freight_mail_messages','created_at.desc,id.desc');}catch{}}throw error;}
 finally{if(e===epoch){render();$('notice').textContent=`已确认提交 ${submitted} 封；后台任务可在“发送任务”查看。其余请核对草稿。`;$('preview-count').textContent=`已确认提交 ${submitted} 封`;}}
}
async function updateContactRows(ids,data){
 for(let i=0;i<ids.length;i+=100){const batch=ids.slice(i,i+100),rows=await cloudRequest('freight_contacts?id=in.'+encodeURIComponent('('+batch.join(',')+')'),{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify(data)});const map=new Map(rows.map(c=>[c.id,c]));contacts=contacts.map(c=>map.get(c.id)||c);if(rows.length!==batch.length){render();throw Error('部分记录未保存，请刷新后检查账号权限。');}}
}
function requireSelected(){const rows=contacts.filter(c=>selected.has(c.id));if(!rows.length)throw Error('请先选择邮箱。');return rows;}
async function editGroups(remove=false){const groups=groupNames($('group-names').value),buckets=new Map();for(const c of requireSelected()){const result=remove?(c.mail_groups||[]).filter(x=>!groups.includes(x)):[...new Set([...(c.mail_groups||[]),...groups])];if(result.length>20)throw Error('每条联系方式最多20个分组。');const key=JSON.stringify(result);buckets.set(key,[...(buckets.get(key)||[]),c.id]);}for(const [key,ids] of buckets)await updateContactRows(ids,{mail_groups:JSON.parse(key)});renderFilterOptions();render();$('notice').textContent=remove?'已从所选分组移除。':'已加入分组，刷新后仍可使用。';}
function preparePreview(){const map=names(),batch=currentPlan();if(!selected.size)throw Error('请先选择收件邮箱。');const random=$('template-mode').value==='random',pool=templatePool(templates,$('purpose').value).filter(t=>selectedTemplates.has(t.id)),assignments=random?assignTemplates(batch.rows,pool):batch.rows.map(contact=>({contact,template:{name:'当前编辑内容',subject:$('subject').value,body:editor.get()}}));const rows=assignments.map(({contact:c,template:t})=>({company_id:c.company_id,contact_id:c.id,recipient:c.value.trim().toLowerCase(),purpose:$('purpose').value,...validateMail(personalise(t.subject,map.get(c.company_id),c),personaliseBody(t.body,map.get(c.company_id),c))}));showPreview(rows);for(const [i,summary] of [...$('previews').querySelectorAll('summary')].entries())summary.textContent=assignments[i].template.name+' · '+summary.textContent;$('preview-count').textContent=`已选 ${selected.size} 条 · 可提交 ${rows.length} 封 · 跳过 ${batch.skipped.length} 条`; $('skip-summary').textContent=`跳过 ${batch.skipped.length} 条（展开查看原因）`;$('skip-rows').replaceChildren();for(const item of batch.skipped){const p=document.createElement('p');p.textContent=item.contact.value+'：'+item.reason;$('skip-rows').append(p);}$('preview-skips').hidden=!batch.skipped.length;$('send-batch').disabled=!configured||!rows.length;$('save-drafts').disabled=!rows.length;}
async function guarded(id,fn,error='notice'){const b=$(id),previewOperation=['send-batch','save-drafts'].includes(id);if(previewOperation&&previewBusy)return;if(previewOperation){previewBusy=true;$('send-batch').disabled=true;$('save-drafts').disabled=true;$('close-preview').disabled=true;$('preview-send-mode').disabled=true;$('preview-send-date').disabled=true;}b.disabled=true;try{await fn();}catch(e){$(error).textContent=e.message;}finally{if(previewOperation){previewBusy=false;$('close-preview').disabled=false;$('preview-send-mode').disabled=false;$('preview-send-date').disabled=false;$('save-drafts').disabled=savedDrafts.length===previewRows.length;$('send-batch').disabled=id==='send-batch'||!configured||savedDrafts.some(m=>m.status!=='draft');}else b.disabled=false;}}
$('login-form').addEventListener('submit',async e=>{e.preventDefault();await guarded('login-button',async()=>{await login($('login-email').value,$('login-password').value);$('login-password').value='';authUI();await load();},'login-error');});
$('login-form').querySelector('button').id='login-button';
$('logout').addEventListener('click',async()=>{++epoch;try{await logout();}catch{}companies=[];contacts=[];messages=[];templates=[];selectedTemplates.clear();$('template-pool').replaceChildren();$('template').replaceChildren();selected.clear();previewRows=[];savedDrafts=[];$('preview-dialog').close();$('mail-settings').close();editor.clear();$('subject').value='';setMailView('recipients');authUI();render();});
$('refresh').addEventListener('click',load);$('purpose').addEventListener('change',renderTemplates);$('template').addEventListener('change',useTemplate);
for(const id of ['search','stage','focus','source','status','region','role','verification','allowed','group','view-mode','one-per-company','recent-days'])$(id).addEventListener(id==='search'?'input':'change',()=>{page=1;render();});$('prev').addEventListener('click',()=>{page--;render();});$('next').addEventListener('click',()=>{page++;render();});
$('reset-filters').addEventListener('click',()=>{for(const id of ['search','stage','focus','source','status','region','role','verification','allowed','group'])$(id).value='';$('view-mode').value='sendable';page=1;render();});
for(const id of ['preview','compose-preview'])$(id).addEventListener('click',()=>{try{preparePreview();}catch(e){$('notice').textContent=e.message;}});
$('clear-selection').addEventListener('click',()=>{selected.clear();render();});
for(const [id,whole] of [['select-page',false],['select-filtered',true]])$(id).addEventListener('click',()=>{const rows=filtered(),take=whole?rows:rows.slice((page-1)*pager.size,page*pager.size);selected=selectRows(selected,take);render();});
$('select-all-page').addEventListener('change',()=>{selected=selectRows(selected,filtered().slice((page-1)*pager.size,page*pager.size),$('select-all-page').checked);render();});

$('apply-contact').addEventListener('click',()=>guarded('apply-contact',async()=>{const chosen=requireSelected(),value=$('bulk-contact').value==='yes',ids=emailContactScope(chosen,contacts);await updateContactRows(ids,{email_allowed:value});render();$('bulk-result').textContent=`已为 ${chosen.length} 条选择${value?'允许':'停止'}邮件联系，覆盖同一邮箱的 ${ids.length} 条联系方式。`;}));
$('add-groups').addEventListener('click',()=>guarded('add-groups',()=>editGroups(false)));$('remove-groups').addEventListener('click',()=>guarded('remove-groups',()=>editGroups(true)));
$('classify-selected').addEventListener('click',()=>guarded('classify-selected',async()=>{const rows=requireSelected(),ids=[...new Set(rows.map(c=>c.company_id))],data={},region=$('region-value').value.trim(),role=$('role-value').value;if(region)data.region=region;if(role)data.role=role;if(!Object.keys(data).length)throw Error('请填写地区或选择客户类型。');for(let i=0;i<ids.length;i+=100){const batch=ids.slice(i,i+100),saved=await cloudRequest('freight_companies?id=in.'+encodeURIComponent('('+batch.join(',')+')'),{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify(data)});const map=new Map(saved.map(c=>[c.id,c]));companies=companies.map(c=>map.get(c.id)||c);if(saved.length!==batch.length)throw Error('部分公司未保存，请刷新核对。');}renderFilterOptions();render();$('notice').textContent=`已更新 ${ids.length} 家公司的地区/类型。`;}));
$('preview-dialog').addEventListener('cancel',e=>{if(previewBusy)e.preventDefault();});$('close-preview').addEventListener('click',()=>$('preview-dialog').close());$('save-drafts').addEventListener('click',()=>guarded('save-drafts',ensureDrafts,'preview-error'));
$('send-batch').addEventListener('click',()=>guarded('send-batch',sendBatch,'preview-error'));
$('open-settings').addEventListener('click',()=>{fillRuleSettings();$('mail-settings').showModal();});$('close-settings').addEventListener('click',()=>$('mail-settings').close());
$('test-mail').addEventListener('click',()=>{$('mail-settings').close();showPreview([{recipient:'benjamin@eurasiago.com',purpose:'测试',subject:'CRM飞书邮箱连接测试',body:'这是一封由Eurasiago CRM发送的连接测试邮件。'}]);});
$('save-template').addEventListener('click',()=>guarded('save-template',async()=>{const name=$('template-name').value.trim();if(!name)throw Error('请填写模板名称。');const subject=$('subject').value.trim(),body=editor.get();if(!subject||subject.length>200||/[\r\n]/.test(subject)||!mailContent(body).text)throw Error('请填写有效主题和正文。');const result=await cloudRequest('freight_mail_templates',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({name,purpose:$('purpose').value,subject,body})});if(!result[0]?.id)throw Error('模板保存结果异常，请刷新模板库核对。');templates.push(result[0]);selectedTemplates.add(result[0].id);renderTemplates();$('template').value=result[0].id;useTemplate();$('notice').textContent='模板已保存。';}));
function fillRuleSettings(){$('batch-limit').value=rules.batch_limit;$('daily-limit').value=rules.daily_limit;$('rule-send-mode').value=rules.send_mode;$('rule-send-date').value=rules.default_scheduled_at?chinaInput(rules.default_scheduled_at):'';$('rule-date-label').hidden=rules.send_mode!=='scheduled';}
function updatePreviewMode(){const scheduled=$('preview-send-mode').value==='scheduled';$('preview-date-label').hidden=!scheduled;$('send-batch').textContent=scheduled?'确认定时发送':'确认后台发送';}
$('rule-send-mode').addEventListener('change',()=>{$('rule-date-label').hidden=$('rule-send-mode').value!=='scheduled';});$('preview-send-mode').addEventListener('change',updatePreviewMode);
$('send-rules-form').addEventListener('submit',async e=>{e.preventDefault();await guarded('save-rules',async()=>{const data=validateRules(Object.fromEntries(new FormData(e.currentTarget)));const saved=await cloudRequest('freight_mail_rules?id=eq.1',{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify(data)});if(saved.length!==1)throw Error('规则保存失败。');rules=saved[0];$('rules-error').textContent='规则已保存。';},'rules-error');});
function openComposer(){if(!selected.size){$('notice').textContent='请先批量选择客户邮箱。';return;}if(!currentPlan().rows.length){$('notice').textContent='所选邮箱均被跳过，请检查联系许可、状态或近期发送记录。';return;}setMailView('compose');$('composer-summary').textContent=$('selection-summary').textContent;($('template-mode').value==='random'?$('template-library'): $('subject')).focus();}
$('prepare-send').addEventListener('click',openComposer);
$('back-recipients').addEventListener('click',()=>setMailView('recipients'));
draftBulk=installDraftBulk({getMessages:()=>messages,getContacts:()=>contacts,getRules:()=>rules,getEpoch:()=>epoch,isConfigured:()=>configured,openSaved,
 async setReply(m,value){if(value==='拒绝联系'){const contact=contacts.find(c=>c.id===m.contact_id);if(contact)await setAllowed(contact,false);}await cloudRequest('freight_mail_messages?id=eq.'+encodeURIComponent(m.id),{method:'PATCH',body:JSON.stringify({reply_status:value})});m.reply_status=value;},
 async cancel(m){await appRequest('/api/mail',{method:'POST',body:JSON.stringify({id:m.id,action:'cancel'})});m.status='draft';m.scheduled_at=null;render();},
 async reloadMessages(){const e=epoch,rows=await all('freight_mail_messages','created_at.desc,id.desc');if(e===epoch){messages=rows;render();}}
});
installMailVerification({buttonId:'verify-selected',getContacts:()=>contacts,getEpoch:()=>epoch,getScopes:()=>{
 const draftView=mailView==='drafts',ids=draftView?new Set(draftBulk.getSelectedContactIds()):selected,group=draftView?$('draft-group').value:$('group').value;
 const scopes=[{value:'selected',label:draftView?'已选草稿的邮箱':'已选邮箱',rows:contacts.filter(c=>ids.has(c.id))}];
 if(group)scopes.push({value:'group',label:'当前分组：'+(group==='__ungrouped'?'未分组':group),rows:filterRecipients(contacts,companies,{group})});
 const visibleIds=draftView?new Set(draftBulk.getVisibleContactIds()):null;scopes.push({value:'filtered',label:'全部筛选结果',rows:draftView?contacts.filter(c=>visibleIds.has(c.id)):filtered()});return scopes;
},applyRows:rows=>{const map=new Map(rows.map(c=>[c.id,c]));contacts=contacts.map(c=>map.get(c.id)||c);},render});
if(mailView==='compose')mailView='recipients';applyMailView();authUI();if(currentUser())load();




function currentPlan(){return outreachPlan(contacts.filter(c=>selected.has(c.id)),contacts,messages,{onePerCompany:$('one-per-company').checked,recentDays:Number($('recent-days').value)});}
function applyHandoff(){
 if(new URLSearchParams(location.search).get('from')!=='acquisition')return;
 let handoff;try{handoff=JSON.parse(sessionStorage.getItem('mail-acquisition-selection')||'null');}catch{}
 const rows=handoffContacts(handoff,currentUser()?.id,contacts);
 if(!rows){$('handoff-summary').textContent='选择已过期或账号不一致，请回到获客列表重新选择。';return;}
 selected=new Set(rows.map(c=>c.id));mailView='recipients';$('view-mode').value='selected';$('purpose').value='开发客户';
 const withEmail=new Set(rows.map(c=>c.company_id));$('handoff-summary').textContent=`已带入 ${handoff.companyIds.length} 家客户、${rows.length} 条邮箱；${handoff.companyIds.filter(id=>!withEmail.has(id)).length} 家无邮箱，可返回客户目录补全。同一家公司可选择多个邮箱，相同邮箱自动去重。`;
 sessionStorage.removeItem('mail-acquisition-selection');history.replaceState(null,'','/mail.html');
}

function renderTemplatePool(){
 const pool=templatePool(templates,$('purpose').value),random=$('template-mode').value==='random';$('template-pool').replaceChildren();$('template-library').open=random;for(const element of document.querySelectorAll('.single-content'))element.hidden=random;
 for(const t of pool){const card=document.createElement('details'),summary=document.createElement('summary'),label=document.createElement('label'),check=document.createElement('input');check.type='checkbox';check.checked=selectedTemplates.has(t.id);check.disabled=!random;check.setAttribute('aria-label','随机发送使用 '+t.name);check.onchange=()=>{check.checked?selectedTemplates.add(t.id):selectedTemplates.delete(t.id);updateTemplateCount();};label.append(check,document.createTextNode(t.name));summary.append(label);const title=document.createElement('p'),body=document.createElement('div'),load=document.createElement('button');title.textContent=t.subject;const content=mailContent(t.body);if(content.html)body.innerHTML=content.html;else{body.textContent=content.text;body.style.whiteSpace='pre-wrap';}load.type='button';load.className='secondary';load.textContent='载入单封编辑';load.onclick=()=>{$('template-mode').value='single';renderTemplatePool();$('template').value=t.id;useTemplate();$('subject').focus();};card.append(summary,title,body,load);$('template-pool').append(card);}
 updateTemplateCount();
}
function updateTemplateCount(){const count=templatePool(templates,$('purpose').value).filter(t=>selectedTemplates.has(t.id)).length;$('template-pool-summary').textContent=$('template-mode').value==='random'?`已勾选 ${count} 个模板 · 点击预览生成本次分配，再次生成预览会重新分配。`:'当前使用下方编辑内容；切换随机模式后可勾选多个模板。';}
$('template-mode').onchange=renderTemplatePool;
