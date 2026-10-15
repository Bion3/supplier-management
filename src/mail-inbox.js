import {addPagerAfter} from './pagination.js';
import {login,logout,appRequest,cloudRequest,currentUser} from './cloud.js';
const $=id=>document.getElementById(id);
let rows=[],page=1,generation=0,sessionEpoch=0;
const pager=addPagerAfter($('inbox-rows').closest('.table-wrap'),'inbox',value=>{page=value;render();});
function authUI(){const user=currentUser();$('login-panel').hidden=!!user;$('workspace').hidden=!user;$('account').textContent=user?.email||'';$('logout').hidden=!user;}
function clear(){rows=[];page=1;$('inbox-search').value='';$('inbox-filter').value='normal';$('inbox-status').textContent='';$('notice').textContent='';$('inbox-detail').close();for(const id of ['inbox-detail-title','inbox-detail-from','inbox-detail-body','inbox-detail-attachments','inbox-detail-risk'])$(id).textContent='';render();}
async function load(){
 if(!currentUser())return;
 const g=++generation,epoch=sessionEpoch;$('notice').textContent='正在加载收件箱…';
 try{
  const [data,state]=await Promise.allSettled([cloudRequest('freight_mail_inbox?select=*&order=received_at.desc&limit=200'+($('inbox-filter').value==='normal'?'&mail_kind=eq.normal':$('inbox-filter').value==='bounce'?'&mail_kind=like.bounce_*':'')),appRequest('/api/inbox-sync')]);
  if(g!==generation||epoch!==sessionEpoch)return;
  if(data.status==='rejected')throw data.reason;
  rows=data.value;
  $('inbox-status').textContent=state.status==='fulfilled'?(state.value.last_sync?'上次同步：'+new Date(state.value.last_sync).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'}):'等待首次同步')+(state.value.error?' · '+state.value.error:'')+(state.value.error?' · 同步异常，请点击立即同步重试':Date.now()-new Date(state.value.last_sync).getTime()>30*60000?' · 同步已超过30分钟，请立即同步':' · 后台每15分钟同步'):'同步状态暂不可用：'+state.reason.message;
  render();$('notice').textContent='收件箱已刷新。';
 }catch(e){if(g!==generation||epoch!==sessionEpoch)return;if(!currentUser()){clear();authUI();}$('notice').textContent=e.message;}
}
function openMessage(m){
 $('inbox-detail-title').textContent=m.subject||'无主题';$('inbox-detail-from').textContent=(m.from_name||'')+' <'+(m.from_email||'')+'>';
 $('inbox-detail-body').textContent=m.body_text||'';$('inbox-detail-attachments').textContent=(m.attachments||[]).length?'附件：'+m.attachments.map(a=>a.filename).join('、'):'';
 $('inbox-detail-risk').textContent=m.bounce_recipient?'退信地址：'+m.bounce_recipient+' · '+m.bounce_reason:m.risk?.is_risk?'飞书提示此邮件存在风险，请核实发件人。':'';$('inbox-detail').showModal();
}
function render(){
 const kind=$('inbox-filter').value,q=$('inbox-search').value.trim().toLowerCase(),visible=rows.filter(m=>(kind==='all'||(kind==='normal'?!m.mail_kind||m.mail_kind==='normal':m.mail_kind?.startsWith('bounce_')))&&[m.from_email,m.from_name,m.subject,m.body_text].join(' ').toLowerCase().includes(q));
 const paging=pager.update(visible.length,page);page=paging.page;$('inbox-rows').replaceChildren();
 for(const m of visible.slice(paging.start,paging.end)){
  const tr=document.createElement('tr');
  for(const value of [new Date(m.received_at).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'}),[m.from_name,m.from_email].filter(Boolean).join(' '),m.subject||'无主题',m.mail_kind?.startsWith('bounce_')?({bounce_invalid:'无效地址 · 已停发',bounce_policy:'策略拦截 · 已停发',bounce_dns:'域名异常 · 已停发',bounce_temporary:'临时退信 · 已暂停',bounce_review:'退信待核实 · 已暂停'}[m.mail_kind]):m.reply_message_id?'已匹配原邮件':m.company_id?'已关联公司':'待归档']){const td=document.createElement('td');td.textContent=value;tr.append(td);}
  const td=document.createElement('td'),b=document.createElement('button');b.type='button';b.className='secondary';b.textContent='查看';b.addEventListener('click',()=>openMessage(m));td.append(b);tr.append(td);$('inbox-rows').append(tr);
 }
 $('inbox-count').textContent=`已加载最近 ${rows.length} 封 · 筛选 ${visible.length} 封`;$('inbox-empty').hidden=visible.length>0;$('inbox-empty').textContent=rows.length?'没有符合搜索条件的来信。':'暂无来信，可点击“立即同步”。';
}
const loginButton=$('login-form').querySelector('[type=submit]');
$('login-form').addEventListener('submit',async e=>{e.preventDefault();if(loginButton.disabled)return;loginButton.disabled=true;$('login-error').textContent='';try{await login($('login-email').value,$('login-password').value);++sessionEpoch;$('login-password').value='';authUI();await load();}catch(err){$('login-error').textContent=err.message;}finally{loginButton.disabled=false;}});
$('logout').addEventListener('click',async()=>{++sessionEpoch;++generation;clear();$('workspace').hidden=true;$('logout').disabled=true;try{await logout();}catch{}finally{$('logout').disabled=false;authUI();}});
$('refresh').addEventListener('click',load);
$('sync-inbox').addEventListener('click',async()=>{
 const b=$('sync-inbox'),epoch=sessionEpoch;if(b.disabled||!currentUser())return;b.disabled=true;$('inbox-status').textContent='正在同步…';
 try{const result=await appRequest('/api/inbox-sync',{method:'POST'});if(epoch!==sessionEpoch)return;await load();if(epoch===sessionEpoch&&result.busy)$('inbox-status').textContent+=' · 同步正在执行';}
 catch(e){if(epoch===sessionEpoch){if(!currentUser()){clear();authUI();}$('inbox-status').textContent=e.message;}}
 finally{b.disabled=false;}
});
$('inbox-filter').addEventListener('change',()=>{page=1;load();});
$('inbox-search').addEventListener('input',()=>{page=1;render();});$('inbox-detail-close').addEventListener('click',()=>$('inbox-detail').close());
render();authUI();if(currentUser())load();

