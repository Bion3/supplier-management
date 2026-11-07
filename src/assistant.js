import {cloudRequest,currentUser} from './cloud.js';
import {assistantFilters,assistantIntent} from './assistant-model.js';
import {findCustomers,taskSummary,mailSummary} from './assistant-data.js';
const $=id=>document.getElementById(id),result=$('assistant-result');
let busy=false,mode='customers';const cache=new Map();
const el=(tag,text,cls)=>{const node=document.createElement(tag);if(text!=null)node.textContent=String(text);if(cls)node.className=cls;return node;};
const link=(label,href,cls)=>{const a=el('a',label,cls);a.href=href;return a;};
const addLink=(parent,label,href,cls)=>parent.append(link(label,href,cls));
const modes={customers:{prompt:'查德国有邮箱的待开发客户',examples:['查德国有邮箱的待开发客户','查波兰待开发客户','查荷兰 ENF 客户'],tips:[['条件尽量具体','例如“德国 + 有邮箱 + 待开发”。'],['邮箱筛选口径','有邮箱筛选为有效且允许邮件联系。']]},tasks:{prompt:'今天任务进度',examples:['今天任务进度','最近7天采集任务'],tips:[['按北京时间统计','读取所选区间内创建或开始的任务。'],['异常单独提示','读取失败不记为零，可到驾驶舱查看原因。']]},cost:{prompt:'检查报价费用',examples:['检查报价费用','拼箱重泡比和计费规则'],tips:[['先选运输类型','在核算页先选整柜或拼箱，再填写货物信息。'],['留意费用缺项','已知费用小计与完整报价分开显示。']]},mail:{prompt:'查看邮件任务和回复',examples:['查看邮件任务和回复','待发送邮件任务','查看客户回复'],tips:[['队列与草稿分开','已安排的邮件由后台发送，草稿需要进入邮件板块提交。'],['回复统计口径','仅列出已匹配原邮件的普通收件；退信单独列为异常。']]}};
function status(text,error=false){$('assistant-notice').textContent=text;$('assistant-notice').dataset.state=error?'error':'normal';}
function panel(title,text,meta){result.replaceChildren();const heading=el('div',null,'assistant-panel-title');heading.append(el('h2',title));if(meta)heading.append(el('span',meta,'assistant-result-meta'));result.append(heading);if(text)result.append(el('p',text,'assistant-context'));}
function table(headers,cls=''){const wrap=el('div',null,'assistant-table-wrap'),t=el('table',null,'assistant-table '+cls),head=el('thead'),row=el('tr'),body=el('tbody');for(const h of headers){const th=el('th',h.label,h.cls);th.scope='col';row.append(th);}head.append(row);t.append(head,body);wrap.append(t);result.append(wrap);return body;}
function cell(row,content,cls){const td=el('td',null,cls);if(content instanceof Node)td.append(content);else td.textContent=String(content??'');row.append(td);return td;}
function footer(text,label,href){const box=el('div',null,'assistant-result-footer');box.append(el('span',text),link(label,href));result.append(box);}
function setMode(next){
 mode=modes[next]?next:'customers';
 for(const button of document.querySelectorAll('[data-mode]'))button.setAttribute('aria-pressed',String(button.dataset.mode===mode));
 $('assistant-query').hidden=false;result.hidden=false;
 $('assistant-examples').replaceChildren();for(const text of modes[mode].examples){const button=el('button',text);button.type='button';button.addEventListener('click',()=>send(text));button.disabled=busy;$('assistant-examples').append(button);}
 $('assistant-tips').replaceChildren();for(const [title,text] of modes[mode].tips)$('assistant-tips').append(el('dt',title),el('dd',text));
}
function renderCustomers(data,filters){
 panel('客户查询结果',data.counts.map(c=>c.region+'：'+c.total+' 家').join('；')+(data.counts.length>1?'。中英文地区分别统计，可能重叠；下方结果已按公司去重。':''),'显示 '+data.companies.length+' 家');
 const tags=el('div',null,'assistant-tags');for(const text of [filters.region,filters.stage,filters.directory,filters.role,filters.contact==='verified-email'?'有效且允许邮件联系':filters.contact==='missing-email'?'缺少有效邮箱':''].filter(Boolean))tags.append(el('span',text,'assistant-tag'));if(tags.childElementCount)result.append(tags);
 if(data.companies.length){
  const body=table([{label:'客户名称'},{label:'国家 / 地区',cls:'assistant-region-col'},{label:'开发状态'},{label:'操作'}]);
  for(const company of data.companies){const row=el('tr'),name=el('div');name.append(link(company.company_name,'/crm.html?company='+encodeURIComponent(company.id),'assistant-row-title'));const secondary=[company.role,company.industry].filter(Boolean).join(' · ');if(secondary)name.append(el('small',secondary));cell(row,name);cell(row,company.region||'未填写','assistant-region-col');cell(row,el('span',company.development_stage||company.status||'未填写','assistant-state'));cell(row,link('查看 ›','/crm.html?company='+encodeURIComponent(company.id)));body.append(row);}
 }else result.append(el('p','没有匹配记录，可尝试减少筛选条件。'));
 result.append(el('p','只按已识别条件筛选；进口商、批发商等身份请在客户资料中核对。','assistant-context'));
 footer('每次最多显示 10 家','完整客户列表 →','/crm.html');
}
function renderTasks(data,week){
 panel(week?'最近 7 天任务':'今日任务','按北京时间的任务创建 / 开始日期统计，每类最多显示最新 100 条。','真实任务记录');
 const body=table([{label:'任务类别'},{label:'记录数'},{label:'运行情况'},{label:'新增结果'},{label:'操作'}],'assistant-tasks');
 const urls={map:'/lead-map.html',enrich:'/discovery.html',exhibition:'/exhibitions.html',mail:'/mail.html'};
 for(const item of data){
  const row=el('tr'),title=el('div',item.name,'assistant-row-title');if(item.limited)title.append(el('small','还有更多记录'));cell(row,title);
  if(item.error){cell(row,'未读取');cell(row,el('span','读取失败','assistant-state warning'));cell(row,'未纳入统计');}
  else{cell(row,item.total);const activity=el('div');activity.append(el('span',item.attention?'需处理 '+item.attention:item.running?'执行中 '+item.running:item.total?'已完成 '+item.completed:'暂无记录','assistant-state'+(item.attention?' warning':'')));activity.append(el('small','完成 '+item.completed+' · 执行中 '+item.running+' · 异常 '+item.attention));cell(row,activity);cell(row,item.kind==='map'?item.leads+' 家企业':item.kind==='enrich'?item.contacts+' 条联系方式':'—');}
  cell(row,link('查看 ›',urls[item.kind]||'/daily-dashboard.html'));body.append(row);
 }
 footer('失败来源单独提示，不记为零','任务驾驶舱 →','/daily-dashboard.html');
}
function renderCost(){
 panel('报价核算与费用检查','在测算页填写线路和货物信息，查看价格组合、缺失费用与采购来源。');
 const options=el('div',null,'assistant-cost-options');
 for(const [title,text,label,href] of [['成本测算','整柜 / 拼箱 · 价格组合 · 缺失费用','进入核算 →','/cost.html'],['采购价格中心','国内运输 · 国际运输 · 箱务价格','维护价格 →','/pricing.html']]){const option=link('',href,'assistant-cost-option');option.append(el('strong',title),el('span',text),el('b',label));options.append(option);}result.append(options);
 const rules=el('div',null,'assistant-rules');rules.append(el('h3','拼箱计费提示'),el('p','国内干线：按 1:300 判断轻重货，轻货取体积单价，重货取吨单价。'),el('p','铁路：按录入单价与 1:500 折算计费方。'),el('p','最终金额以测算页读取的价格、运输范围和货物限制为准。'));result.append(rules);
}
function renderMail(data){
 panel('邮件跟进','待发送任务与客户回复集中查看，进入邮件板块继续处理。','每类最多显示 10 条');
 const labels={draft:'未提交',scheduled:'已安排',sending:'发送中',failed:'发送失败',unknown:'结果待核查'};
 const time=value=>value?new Date(value).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}):'—';
 for(const item of data){
  const heading=el('div',null,'assistant-mail-heading');heading.append(el('h3',item.name),link(item.kind==='replies'?'打开收件箱 →':'查看与处理 →',item.href));result.append(heading);
  if(item.error){result.append(el('p','暂时无法读取，请进入对应模块查看。','assistant-mail-error'));continue;}
  result.append(el('p',(item.limited?'显示最近 10 条，还有更多记录':'当前 '+item.rows.length+' 条')+(item.kind==='replies'?' · 已匹配原邮件，不含退信':''),'assistant-context'));
  if(!item.rows.length){result.append(el('p',item.kind==='replies'?'暂无已匹配的客户回复，其他来信可到收件箱查看。':'暂无'+item.name+'。','assistant-mail-empty'));continue;}
  const replies=item.kind==='replies';
  const body=table([{label:replies?'发件人':'收件人'},{label:'邮件主题'},{label:replies?'收信时间':'发送状态 / 时间'},{label:'提示'}],'assistant-mail-table');
  for(const mail of item.rows){
   const row=el('tr'),person=el('div',replies?(mail.from_name||mail.from_email):mail.recipient,'assistant-row-title');if(replies&&mail.from_name)person.append(el('small',mail.from_email));cell(row,person);
   cell(row,link(mail.subject||'无主题',item.href));
   const state=el('div',replies?time(mail.received_at):(labels[mail.status]||mail.status));if(!replies)state.append(el('small',mail.scheduled_at?'计划 '+time(mail.scheduled_at):'创建 '+time(mail.created_at)));cell(row,state);
   cell(row,replies?el('span',mail.unread?'未读':'已读','assistant-state'):mail.delivery_status?.startsWith('bounce_')?'已退信，请核查地址':mail.error||'—');body.append(row);
  }
 }
 footer('读取已同步记录；收信同步状态可在收件箱查看','收件箱与同步 →','/inbox.html');
}
function memo(text){cache.set(mode,{children:Array.from(result.childNodes,node=>node.cloneNode(true)),text,notice:$('assistant-notice').textContent});}
function setBusy(value){busy=value;$('assistant-send').disabled=value;$('assistant-input').disabled=value;for(const button of document.querySelectorAll('[data-mode],#assistant-examples button'))button.disabled=value;$('assistant-content').setAttribute('aria-busy',String(value));}
async function send(text){
 if(busy||!text.trim()||!currentUser())return;
 let intent=assistantIntent(text);const filters=assistantFilters(text);if(intent==='help'&&Object.keys(filters).length)intent='customers';
 setMode(intent);setBusy(true);status('正在读取业务记录…');$('assistant-input').value=text;
 try{
  if(intent==='customers')renderCustomers(await findCustomers(cloudRequest,filters),filters);
  else if(intent==='tasks')renderTasks(await taskSummary(cloudRequest,/7天|七天|本周|一周/.test(text)?'7d':'today'),/7天|七天|本周|一周/.test(text));
  else if(intent==='cost')renderCost();
  else if(intent==='mail')renderMail(await mailSummary(cloudRequest));
  else panel('可以这样提问','查德国有邮箱的待开发客户、今天任务进度、检查报价费用、查看邮件任务和客户回复。');
  status('已完成 · '+new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',hour:'2-digit',minute:'2-digit'}).format(new Date()));if(['customers','tasks','cost','mail'].includes(intent))memo(text);
 }catch(error){panel('暂时无法查询',error.message||'请检查网络和登录状态后重试。');status('读取失败，未将缺失数据记为零。',true);}
 finally{setBusy(false);}
}
function openMode(next){
 if(busy)return;setMode(next);
 const saved=cache.get(next);if(saved){result.replaceChildren(...saved.children.map(node=>node.cloneNode(true)));$('assistant-input').value=saved.text;status(saved.notice+' · 已保留结果，点击查询可刷新');return;}
 send(modes[next].prompt);
}
$('assistant-form').addEventListener('submit',event=>{event.preventDefault();send($('assistant-input').value);});
for(const button of document.querySelectorAll('[data-mode]'))button.addEventListener('click',()=>openMode(button.dataset.mode));
setMode('customers');
