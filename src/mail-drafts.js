import {appRequest} from './cloud.js';
import {addPagerAfter} from './pagination.js';
import {validEmail,validateMail} from './mail-model.js';
import {mailContent} from './mail-content.js';
import {scheduleISO,chinaInput} from './mail-rules.js';
export function draftSendPlan(rows,contacts){
 const byId=new Map(contacts.map(c=>[c.id,c])),blocked=new Set(contacts.filter(c=>c.channel==='邮箱'&&c.email_allowed===false).map(c=>c.value.trim().toLowerCase()));
 const seen=new Set(),eligible=[],skipped=[];
 for(const m of rows){
  const email=String(m.recipient||'').trim().toLowerCase(),contact=byId.get(m.contact_id);let reason='';
  if(m.status!=='draft')reason='不是待发送草稿';
  else if(!validEmail(email))reason='邮箱格式无效';
  else if(!contact||contact.company_id!==m.company_id||contact.channel!=='邮箱'||contact.value.trim().toLowerCase()!==email)reason='联系人不匹配';
  else if(blocked.has(email)||contact.email_allowed!==true)reason='已停止联系';
  else if(contact.status!=='有效')reason='邮箱尚未核实';
  else if(seen.has(email))reason='重复邮箱';
  else{try{validateMail(m.subject,m.body);}catch(e){reason=e.message;}}
  if(reason)skipped.push({row:m,reason});else{seen.add(email);eligible.push(m);}
 }
 return {eligible,skipped};
}
export function installDraftBulk(ctx){
 const $=id=>document.getElementById(id),chosen=new Set();let page=1,pageRows=[],visible=[],busy=false,previewIds=[];
 const pager=addPagerAfter($('history').closest('.table-wrap'),'mail-history',value=>{page=value;render();});
 const statusLabels={draft:'草稿',scheduled:'已安排后台发送',sending:'发送处理中',sent:'服务器已接受',failed:'失败',unknown:'结果不确定，请核查'};
 const td=text=>{const cell=document.createElement('td');cell.textContent=text??'';return cell;};
 const button=(text,fn)=>{const b=document.createElement('button');b.type='button';b.className='secondary';b.textContent=text;b.addEventListener('click',async()=>{b.disabled=true;try{await fn();}catch(e){$('notice').textContent=e.message;}finally{b.disabled=false;}});return b;};
 function render(){
  const messages=ctx.getMessages(),contacts=ctx.getContacts(),byId=new Map(contacts.map(c=>[c.id,c])),group=$('draft-group').value;
  $('draft-group').replaceChildren(new Option('全部分组',''));
  for(const value of [...new Set(contacts.flatMap(c=>c.mail_groups||[]))].sort())$('draft-group').append(new Option(value,value));
  $('draft-group').value=group;if($('draft-group').selectedIndex<0)$('draft-group').value='';
  const q=$('draft-search').value.trim().toLowerCase(),state=$('draft-status').value;
  visible=messages.filter(m=>(!state||m.status===state)&&(!$('draft-group').value||(byId.get(m.contact_id)?.mail_groups||[]).includes($('draft-group').value))&&[m.recipient,m.subject].join(' ').toLowerCase().includes(q));
  const messageMap=new Map(messages.map(m=>[m.id,m]));for(const id of chosen)if(messageMap.get(id)?.status!=='draft')chosen.delete(id);
  const paging=pager.update(visible.length,page);page=paging.page;pageRows=visible.slice(paging.start,paging.end);$('history').replaceChildren();
  for(const m of pageRows){
   const tr=document.createElement('tr'),selectCell=td(''),check=document.createElement('input');check.type='checkbox';check.checked=chosen.has(m.id);check.disabled=busy||m.status!=='draft';check.setAttribute('aria-label','选择草稿 '+m.recipient);check.addEventListener('change',()=>{check.checked?chosen.add(m.id):chosen.delete(m.id);render();});selectCell.append(check);
   const reply=td(''),select=document.createElement('select');for(const text of ['待回复','已回复','无需求','拒绝联系'])select.append(new Option(text,text));select.value=m.reply_status||'待回复';select.disabled=busy;select.addEventListener('change',async()=>{const old=m.reply_status;select.disabled=true;try{await ctx.setReply(m,select.value);}catch(e){select.value=old;$('notice').textContent=e.message;}finally{select.disabled=false;}});reply.append(select);
   const action=td('');action.append(button('查看',()=>ctx.openSaved(m)));if(m.status==='scheduled')action.append(button('取消安排',()=>ctx.cancel(m)));if(m.status==='draft'&&ctx.isConfigured())action.append(button('发送此草稿',()=>ctx.openSaved(m)));
   tr.append(selectCell,td(new Date(m.created_at).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})),td(m.recipient+' / '+m.subject),td((statusLabels[m.status]||m.status)+(m.scheduled_at?' · '+chinaInput(m.scheduled_at).replace('T',' '):'')+(m.error?'：'+m.error:'')),reply,action);$('history').append(tr);
  }
  const selectable=pageRows.filter(m=>m.status==='draft'),count=selectable.filter(m=>chosen.has(m.id)).length;
  $('draft-select-page').checked=selectable.length>0&&count===selectable.length;$('draft-select-page').indeterminate=count>0&&count<selectable.length;$('draft-select-page').disabled=busy||!selectable.length;
  $('draft-count').textContent=`筛选 ${visible.length} 封 · 已选 ${chosen.size} 封（跨页保留）`;
  $('draft-bulk-send').disabled=busy||!chosen.size||!ctx.isConfigured();
  for(const id of ['draft-select-filtered','draft-clear','draft-group','draft-status','draft-search'])$(id).disabled=busy;
 }
 const dialog=document.createElement('dialog');dialog.id='draft-send-dialog';dialog.innerHTML='<div class="dialog-heading"><h2>批量发送草稿</h2><button id="draft-send-close" class="secondary" type="button">关闭</button></div><p id="draft-send-summary"></p><p id="draft-send-skipped"></p><div class="fields"><label>开始发送<select id="draft-send-mode"><option value="now">尽快开始（后台发送）</option><option value="scheduled">指定日期时间</option></select></label><label id="draft-send-date-label" hidden>发送时间（北京时间）<input id="draft-send-date" type="datetime-local"></label></div><p id="draft-send-rules"></p><div id="draft-send-previews"></div><p id="draft-send-error" role="alert"></p><footer><button id="draft-send-confirm">确认批量提交</button></footer><p class="footnote">提交完成后可关闭页面；已安排的邮件由后台发送，超过每日上限自动顺延。</p>';document.body.append(dialog);
 function open(){
  if(busy)return;for(const id of ['draft-send-close','draft-send-mode','draft-send-date'])$(id).disabled=false;const rows=ctx.getMessages().filter(m=>chosen.has(m.id)),plan=draftSendPlan(rows,ctx.getContacts());previewIds=plan.eligible.map(m=>m.id);
  $('draft-send-summary').textContent=`已选 ${rows.length} 封；可提交 ${plan.eligible.length} 封；跳过 ${plan.skipped.length} 封。`;
  const counts=new Map();for(const {reason} of plan.skipped)counts.set(reason,(counts.get(reason)||0)+1);$('draft-send-skipped').textContent=[...counts].map(([reason,n])=>reason+'：'+n+'封').join('； ');
  const rules=ctx.getRules();$('draft-send-mode').value=rules.send_mode;$('draft-send-date').value=rules.default_scheduled_at?chinaInput(rules.default_scheduled_at):'';toggleMode();
  $('draft-send-rules').textContent=`按每日上限 ${rules.daily_limit} 封执行，剩余邮件自动延至后续日期。`;
  $('draft-send-previews').replaceChildren();const samples=new Map();for(const m of plan.eligible){const key=m.subject+'\n'+m.body;if(!samples.has(key))samples.set(key,{row:m,count:0});samples.get(key).count++;}
  for(const {row,count} of [...samples.values()].slice(0,10)){const details=document.createElement('details'),summary=document.createElement('summary'),body=document.createElement('div');summary.textContent=row.subject+' · '+count+'封 · 示例收件人 '+row.recipient;const content=mailContent(row.body);if(content.html)body.innerHTML=content.html;else{body.className='draft-plain-body';body.textContent=content.text;}details.append(summary,body);$('draft-send-previews').append(details);}
  if(samples.size>10){const p=document.createElement('p');p.textContent='其余文案可在发送记录中逐封查看。';$('draft-send-previews').append(p);}
  $('draft-send-error').textContent='';$('draft-send-confirm').disabled=!plan.eligible.length;dialog.showModal();
 }
 function toggleMode(){$('draft-send-date-label').hidden=$('draft-send-mode').value!=='scheduled';}
 $('draft-bulk-send').addEventListener('click',open);$('draft-send-mode').addEventListener('change',toggleMode);$('draft-send-close').onclick=()=>{if(!busy)dialog.close();};dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});
 $('draft-send-confirm').addEventListener('click',async()=>{
  if(busy||!previewIds.length)return;const epoch=ctx.getEpoch(),mode=$('draft-send-mode').value;let date;
  try{date=mode==='scheduled'?scheduleISO($('draft-send-date').value):null;}catch(e){$('draft-send-error').textContent=e.message;return;}
  const current=ctx.getMessages().filter(m=>previewIds.includes(m.id)),plan=draftSendPlan(current,ctx.getContacts());if(!plan.eligible.length){$('draft-send-error').textContent='草稿或邮箱状态已变化，请重新选择。';return;}
  busy=true;for(const id of ['draft-send-confirm','draft-send-close','draft-send-mode','draft-send-date'])$(id).disabled=true;render();let submitted=0;const errors=[];
  try{
   const size=Math.min(20,ctx.getRules().batch_limit||10);
   for(let i=0;i<plan.eligible.length;i+=size){
    if(epoch!==ctx.getEpoch())throw Error('账号或页面数据已变化，请刷新发送记录。');
    const batch=plan.eligible.slice(i,i+size),result=await appRequest('/api/mail-batch',{method:'POST',body:JSON.stringify({ids:batch.map(m=>m.id),mode,...(date?{scheduled_at:date}:{})})});
    if(epoch!==ctx.getEpoch())throw Error('账号或页面数据已变化，请刷新发送记录。');
    const byId=new Map(batch.map(m=>[m.id,m]));
    if(!Array.isArray(result.results)||result.results.length!==batch.length)throw Error('提交结果不完整，请刷新发送记录核对。');
    for(const item of result.results){const m=byId.get(item.id);if(!m)throw Error('提交结果异常。');if(item.status==='scheduled'){m.status=item.status;m.scheduled_at=item.scheduled_at;chosen.delete(m.id);submitted++;}else errors.push(m.recipient+'：'+(item.error||'未提交'));}
    render();$('draft-send-summary').textContent=`已提交 ${submitted} 封 · 已处理 ${Math.min(i+size,plan.eligible.length)} / ${plan.eligible.length} 封`;
   }
   $('draft-send-error').textContent=errors.length?'未提交 '+errors.length+' 封，仍保留为草稿。'+errors.slice(0,3).join('； '):'';
   $('notice').textContent=`已安排后台发送 ${submitted} 封；未提交 ${errors.length} 封。`;
  }catch(e){if(epoch===ctx.getEpoch()){$('draft-send-error').textContent=e.message+' 已确认提交 '+submitted+' 封；请刷新后核对其余草稿再提交。';try{await ctx.reloadMessages();}catch{} }}
  finally{busy=false;if(epoch===ctx.getEpoch()){render();for(const id of ['draft-send-close','draft-send-mode','draft-send-date'])$(id).disabled=false;$('draft-send-confirm').disabled=true;}}
 });
 for(const id of ['draft-group','draft-status','draft-search'])$(id).addEventListener(id==='draft-search'?'input':'change',()=>{page=1;render();});
 $('draft-select-page').onchange=e=>{for(const m of pageRows.filter(m=>m.status==='draft'))e.target.checked?chosen.add(m.id):chosen.delete(m.id);render();};
 $('draft-select-filtered').onclick=()=>{for(const m of visible.filter(m=>m.status==='draft'))chosen.add(m.id);render();};$('draft-clear').onclick=()=>{chosen.clear();render();};
 $('logout').addEventListener('click',()=>{chosen.clear();previewIds=[];dialog.close();$('draft-send-previews').replaceChildren();for(const id of ['draft-send-summary','draft-send-skipped','draft-send-error'])$(id).textContent='';$('draft-send-date').value='';});
 return {render,getSelectedContactIds(){return ctx.getMessages().filter(m=>chosen.has(m.id)).map(m=>m.contact_id);},getVisibleContactIds(){return visible.map(m=>m.contact_id);},clear(){chosen.clear();render();}};
}
