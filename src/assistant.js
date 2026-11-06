import {cloudRequest,currentUser} from './cloud.js';
import {assistantFilters,assistantIntent,mailDraft} from './assistant-model.js';
import {findCustomers,taskSummary} from './assistant-data.js';
const $=id=>document.getElementById(id),result=$('assistant-result');let busy=false;
const el=(tag,text)=>{const node=document.createElement(tag);if(text!=null)node.textContent=text;return node;};
const addLink=(parent,label,href)=>{const a=el('a',label);a.href=href;parent.append(a);};
function panel(title,text){result.replaceChildren(el('h2',title));if(text)result.append(el('p',text));}
async function send(text){
 if(busy||!text.trim()||!currentUser())return;busy=true;$('assistant-send').disabled=true;$('assistant-notice').textContent='正在处理…';$('assistant-input').value=text;
 try{
  const intent=assistantIntent(text);$('assistant-draft').hidden=intent!=='draft';
  if(intent==='customers'){
   const filters=assistantFilters(text),data=await findCustomers(cloudRequest,filters);
   panel('客户查询结果',data.counts.map(c=>c.region+'：'+c.total+' 家').join('；')+'。'+(data.counts.length>1?'中英文地区分别统计，可能重叠；下方结果已去重。':'')+'最多展示 10 家。');
   result.append(el('p','已识别条件：'+[filters.stage,filters.directory,filters.role,filters.contact==='verified-email'?'有效且允许邮件联系':filters.contact==='missing-email'?'缺少有效邮箱':''].filter(Boolean).join(' · ')+ '。仅按已识别条件筛选；进口商等身份需在客户资料中核对。'));
   const list=el('ul');for(const row of data.companies){const item=el('li');addLink(item,row.company_name,'/crm.html?company='+encodeURIComponent(row.id));item.append(el('small',[row.region,row.development_stage||row.status].filter(Boolean).join(' · ')));list.append(item);}result.append(list);
   if(!data.companies.length)result.append(el('p','没有匹配记录，可尝试减少筛选条件。'));
   addLink(result,'打开完整客户列表','/crm.html');
  }else if(intent==='tasks'){
   const week=/7天|七天|本周|一周/.test(text),data=await taskSummary(cloudRequest,week?'7d':'today');
   panel(week?'最近 7 天任务':'今日任务','按北京时间的任务创建/开始日期统计。每类最多读取最新 100 条，不包含区间外启动的任务。');
   const list=el('ul');for(const item of data){list.append(el('li',item.error?item.name+'：读取失败，本项未纳入统计。':item.name+'：读取 '+item.total+' 条，执行中 '+item.running+'，完成 '+item.completed+'，异常 '+item.attention+(item.kind==='map'?'，新增企业 '+item.leads:item.kind==='enrich'?'，新增联系方式 '+item.contacts:'')+(item.limited?'（有更多记录，请查看驾驶舱）':'')));}result.append(list);addLink(result,'查看任务详情及失败原因','/daily-dashboard.html');
  }else if(intent==='cost'){
   panel('报价核算与费用检查','进入成本测算，填写线路、箱型或拼箱重量体积，即可查看价格组合、缺失费用及采购来源。');
   result.append(el('p','拼箱计费提示：国内干线按 1:300 判断轻重货，轻货取体积单价，重货取吨单价；铁路按录入的单价及 1:500 折算计费方。最终金额以测算页读取的价格及服务范围为准。'));
   addLink(result,'打开成本测算','/cost.html');addLink(result,'打开采购价格中心','/pricing.html');
  }else if(intent==='draft'){
   panel('用模板整理邮件','下方提供初次开发、需求跟进和供应商询价三类模板，可选择中文或英文。');
   $('draft-type').value=/跟进/.test(text)?'followup':/询价|供应商/.test(text)?'inquiry':'intro';
   if(!$('draft-body').value)generateDraft();$('assistant-draft').scrollIntoView({block:'start',behavior:'smooth'});
  }else{
   panel('可以这样提问','“查德国有邮箱的待开发客户”“今天任务进度”“最近7天采集任务”“检查报价费用”“写开发邮件”。也可以使用上方快捷按钮。');
   addLink(result,'货代知识库','/knowledge.html');addLink(result,'运踪与时效','/tracking.html');
  }
  $('assistant-notice').textContent='已完成 · '+new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',hour:'2-digit',minute:'2-digit'}).format(new Date());
 }catch(error){panel('暂时无法查询',error.message||'请检查网络和登录状态后重试。');$('assistant-notice').textContent='读取失败，未将缺失数据记为零。';}
 finally{busy=false;$('assistant-send').disabled=false;}
}
const fields=['draft-type','draft-language','draft-company','draft-route','draft-cargo','draft-subject','draft-body'];
const draftKey=()=>currentUser()?'eurasiago:assistant-draft:'+currentUser().id:null;
function saveDraft(){const key=draftKey();if(!key)return;try{sessionStorage.setItem(key,JSON.stringify(Object.fromEntries(fields.map(id=>[id,$(id).value]))));}catch{}}
function generateDraft(){const draft=mailDraft({type:$('draft-type').value,language:$('draft-language').value,company:$('draft-company').value,route:$('draft-route').value,cargo:$('draft-cargo').value});$('draft-subject').value=draft.subject;$('draft-body').value=draft.body;saveDraft();$('draft-status').textContent='模板已生成，请核对后使用。';}
try{const stored=JSON.parse(sessionStorage.getItem(draftKey())||'null');if(stored&&typeof stored==='object')for(const id of fields)if(typeof stored[id]==='string')$(id).value=stored[id].slice(0,Number($(id).maxLength)>0?Number($(id).maxLength):10000);}catch{}
for(const id of fields)$(id).addEventListener('input',saveDraft);
$('assistant-form').addEventListener('submit',e=>{e.preventDefault();send($('assistant-input').value);});
for(const button of document.querySelectorAll('[data-prompt]'))button.addEventListener('click',()=>send(button.dataset.prompt));
$('draft-generate').addEventListener('click',generateDraft);
$('draft-copy').addEventListener('click',async()=>{try{await navigator.clipboard.writeText('Subject: '+$('draft-subject').value+'\n\n'+$('draft-body').value);$('draft-status').textContent='已复制，可粘贴到邮件板块编辑。';}catch{$('draft-body').focus();$('draft-body').select();$('draft-status').textContent='自动复制不可用，请手动复制主题和正文。';}});
$('draft-clear').addEventListener('click',()=>{for(const id of ['draft-company','draft-cargo','draft-subject','draft-body'])$(id).value='';$('draft-route').value='China–Europe';try{sessionStorage.removeItem(draftKey());}catch{}$('draft-status').textContent='草稿已清空。';});
