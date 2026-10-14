import {cloudRequest} from './cloud.js';
import {validEmail} from './mail-model.js';
export function verificationPlan(rows,allContacts,status){
 if(!['有效','待核实','失效'].includes(status))throw Error('核实状态无效。');
 const blocked=new Set(allContacts.filter(c=>c.channel==='邮箱'&&c.email_allowed===false).map(c=>c.value.trim().toLowerCase()));
 const emails=[...new Map(rows.filter(c=>c.channel==='邮箱').map(c=>[c.id,c])).values()];
 const skipped=emails.filter(c=>status==='有效'&&(!validEmail(c.value.trim())||blocked.has(c.value.trim().toLowerCase())));
 const skippedIds=new Set(skipped.map(c=>c.id)),updates=emails.filter(c=>!skippedIds.has(c.id)&&c.status!==status);
 return {emails,updates,skipped,unchanged:emails.length-updates.length-skipped.length};
}
export function installMailVerification(ctx){
 const $=id=>document.getElementById(id),dialog=document.createElement('dialog');dialog.id='mail-verification-dialog';dialog.setAttribute('aria-labelledby','verification-title');
 dialog.innerHTML='<form id="mail-verification-form"><div class="dialog-heading"><h2 id="verification-title">批量核实邮箱</h2><button id="verification-close" class="secondary" type="button">关闭</button></div><label>处理范围<select id="verification-scope"></select></label><label>核实结果<select id="verification-status"><option>有效</option><option>待核实</option><option>失效</option></select></label><p id="verification-summary"></p><p id="verification-preview"></p><label id="verification-confirm-label" class="verification-confirm"><input id="verification-confirm" type="checkbox">我已核实这些邮箱，确认可以用于业务联系</label><p class="footnote">用于批量记录核实结果；不会自动检测邮箱能否收信。标为有效时跳过格式错误或已停止联系的邮箱。</p><p id="verification-error" role="alert"></p><footer><button id="verification-save" type="submit">保存核实结果</button></footer></form>';
 document.body.append(dialog);let scopes=[],busy=false;
 const plan=()=>{const all=ctx.getContacts(),byId=new Map(all.map(c=>[c.id,c]));const rows=(scopes.find(s=>s.value===$('verification-scope').value)?.rows||[]).map(c=>byId.get(c.id)).filter(Boolean);return verificationPlan(rows,all,$('verification-status').value);};
 function preview(){
  const p=plan(),isValid=$('verification-status').value==='有效';
  $('verification-summary').textContent=`范围内 ${p.emails.length} 条 / ${new Set(p.emails.map(c=>c.value.trim().toLowerCase())).size} 个不同邮箱（跨页）；将更新 ${p.updates.length} 条，已是该状态 ${p.unchanged} 条，跳过 ${p.skipped.length} 条。`;
  $('verification-preview').textContent='邮箱示例：'+(p.updates.slice(0,5).map(c=>c.value).join('； ')||'无待更新邮箱');
  $('verification-confirm-label').hidden=!isValid;$('verification-confirm').required=isValid;
  $('verification-save').disabled=busy||!p.updates.length;
 }
 function open(){
  if(busy)return;scopes=ctx.getScopes().map(s=>({...s,rows:s.rows.filter(c=>c.channel==='邮箱')}));
  $('verification-scope').replaceChildren();for(const scope of scopes)$('verification-scope').append(new Option(scope.label+'（'+scope.rows.length+'条）',scope.value));
  const initial=scopes.find(s=>s.value==='selected'&&s.rows.length)||scopes.find(s=>s.value==='group')||scopes.find(s=>s.value==='filtered')||scopes[0];
  $('verification-scope').value=initial?.value||'';$('verification-status').value='有效';$('verification-confirm').checked=false;$('verification-error').textContent='';preview();dialog.showModal();
 }
 $(ctx.buttonId).addEventListener('click',open);
 for(const id of ['verification-scope','verification-status'])$(id).addEventListener('change',()=>{$('verification-confirm').checked=false;$('verification-error').textContent='';preview();});
 $('verification-close').addEventListener('click',()=>{if(!busy)dialog.close();});dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});
 $('mail-verification-form').addEventListener('submit',async e=>{
  e.preventDefault();if(busy)return;const status=$('verification-status').value,p=plan(),epoch=ctx.getEpoch();
  if(status==='有效'&&!$('verification-confirm').checked){$('verification-error').textContent='请先确认已核实这些邮箱。';return;}
  if(!p.updates.length)return;busy=true;for(const id of ['verification-close','verification-scope','verification-status','verification-confirm','verification-save'])$(id).disabled=true;
  let saved=0;
  try{
   for(let i=0;i<p.updates.length;i+=100){
    if(epoch!==ctx.getEpoch())throw Error('账号已切换，请重新登录后检查已保存结果。');
    const batch=p.updates.slice(i,i+100),ids='('+batch.map(c=>JSON.stringify(c.id)).join(',')+')';
    const rows=await cloudRequest('freight_contacts?id=in.'+encodeURIComponent(ids),{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({status,updated_at:new Date().toISOString()})});
    if(epoch!==ctx.getEpoch())throw Error('账号已切换，请重新登录后检查已保存结果。');
    saved+=rows.length;ctx.applyRows(rows);
    if(rows.length!==batch.length)throw Error('部分记录未保存，请刷新核对。');
    $('verification-summary').textContent=`正在保存 ${saved} / ${p.updates.length} 条…`;
   }
   dialog.close();ctx.render();$('notice').textContent=`已将 ${saved} 条邮箱标为“${status}”；跳过 ${p.skipped.length} 条。`;
  }catch(err){if(epoch===ctx.getEpoch()){ctx.render();$('verification-error').textContent=(saved?'已保存 '+saved+' 条；':'')+err.message;}}
  finally{busy=false;for(const id of ['verification-close','verification-scope','verification-status','verification-confirm'])$(id).disabled=false;preview();}
 });
 $('logout')?.addEventListener('click',()=>{dialog.close();$('verification-preview').textContent='';$('verification-summary').textContent='';scopes=[];});
 return {open};
}
