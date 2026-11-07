import {compareFclSuppliers,compareLclPlans} from './cost-supplier-compare.js';
import {quoteAuditRows,segmentLink} from './cost-quote-audit.js';
import {login,listSuppliers,cloudRequest,syncAuthShell} from './cloud.js';
import {estimateFcl,estimateFclVariants,estimateLcl,diagnoseFclMatches} from './cost-unified-model.js';
import {websiteQuoteDraft} from './public-quote-model.js';
import {addPagerAfter} from './pagination.js';
import {classifyQuoteDestination,destinationChoices} from './cost-destination-options.js';
const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let data={},suppliers=[],history=[],matches=[],selected=null,choices={},activeInput=null,busy=false,historyPage=1,pricedDestinations={lcl:[],fcl:[]};
const pager=addPagerAfter($('history'),'cost-history',n=>{historyPage=n;renderHistory();});
const supplier=id=>suppliers.find(s=>s.id===id)?.name||'供应商待确认';
$('date').value=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
async function all(table){const rows=[];for(let offset=0;;offset+=500){const batch=await cloudRequest(`${table}?select=*&order=created_at.desc,id.asc&limit=500&offset=${offset}`);rows.push(...batch);if(batch.length<500)return rows;}}
function read(){const out={};for(const id of ['transport','scope','origin','station','destination','date','box','equipment','pickupPlace','profitMode','webValidUntil'])out[id]=$(id).value.trim();for(const id of ['pieces','weight','volume','quantity','fx','profit','eurFx','webRange','webMinimum'])out[id]=$(id).value===''?null:Number($(id).value);for(const id of ['truck','rent','preview'])out[id]=$(id).checked;if($('pickupMode').value==='manual')out.pickupOverride={amount:$('pickupAmount').value===''?null:Number($('pickupAmount').value),currency:$('pickupCurrency').value,reason:$('pickupReason').value.trim()};if(out.equipment==='COC')out.rent=false;return out;}
function mode(){const fcl=$('transport').value==='fcl';document.querySelectorAll('[data-lcl]').forEach(el=>{el.hidden=fcl;el.querySelectorAll('input,select').forEach(control=>control.disabled=fcl);});document.querySelectorAll('[data-fcl]').forEach(el=>{el.hidden=!fcl;el.querySelectorAll('input,select').forEach(control=>control.disabled=!fcl);});$('rent').disabled=!fcl||$('equipment').value==='COC';$('pickup-place-wrap').hidden=!fcl||!$('truck').checked;const origin=$('origin-field');origin.hidden=false;origin.querySelector('input').disabled=false;paintCostMode();}
function invalidate(){$('supplier-comparison').hidden=true;$('comparison-rows').innerHTML='';$('match-diagnostics').hidden=true;$('match-diagnostics').textContent='';selected=null;activeInput=null;choices={};$('result').textContent='输入已改变，请重新匹配价格并核算。';$('save').disabled=true;$('publish').disabled=true;$('segments').innerHTML='';$('alternatives').hidden=true;}
function paintCostMode(){
 document.querySelectorAll('[data-cost-mode]').forEach(button=>{
  const active=button.dataset.costMode===$('transport').value;
  button.setAttribute('aria-pressed',String(active));
  button.classList.toggle('active',active);
 });
}
function renderDestinationGroups(){
 const kind=$('transport').value;
 const query=$('destination').value.trim().toLocaleLowerCase();
 const names=destinationChoices(pricedDestinations[kind]||[],kind);
 const filtered=names.filter(name=>{
  const {region,country}=classifyQuoteDestination(name);
  return !query||[name,region,country].some(v=>v.toLocaleLowerCase().includes(query));
 });
 const grouped=new Map();
 for(const name of filtered){
  const {region,country}=classifyQuoteDestination(name);
  if(!grouped.has(region))grouped.set(region,new Map());
  if(!grouped.get(region).has(country))grouped.get(region).set(country,[]);
  grouped.get(region).get(country).push(name);
 }
 const html=[...grouped.entries()].map(([region,countries])=>
  `<section class="cost-destination-region"><h4>${esc(region)}</h4>${[...countries.entries()].map(([country,stations])=>
   `<div class="cost-destination-country"><div class="cost-destination-country-name">${esc(country)}</div><div class="cost-destination-stations">${stations.map(name=>
    `<button type="button" class="cost-destination-option" data-choose-destination="${esc(name)}">${esc(name)}</button>`).join('')}</div></div>`
  ).join('')}</section>`
 ).join('');
 $('cost-destination-groups').innerHTML=html||'<p class="cost-destination-empty">没有匹配的已确认站点，可直接输入其他目的地进行核算。</p>';
 $('cost-destination-help').textContent=`当前${kind==='fcl'?'整柜':'拼箱'}有 ${names.length} 个已录价目的站 · ${query?'筛选匹配 '+filtered.length+' 个 · ':''}支持输入区域/国家/站点搜索，或直接填写其他目的地。`;
}
function toggleDestinationPanel(open){
 const panel=$('cost-destination-panel');
 panel.hidden=!open;
 $('destination').setAttribute('aria-expanded',String(open));
 $('cost-destination-toggle').setAttribute('aria-expanded',String(open));
 $('cost-destination-toggle').setAttribute('aria-label',open?'收起目的站选择':'展开目的站选择');
 if(open)renderDestinationGroups();
}
function setCostMode(kind){
 if(kind===$('transport').value)return;
 $('transport').value=kind;$('destination').value='';
 mode();paintCostMode();toggleDestinationPanel(false);renderDestinationGroups();invalidate();
}
document.querySelectorAll('[data-cost-mode]').forEach(b=>b.addEventListener('click',()=>setCostMode(b.dataset.costMode)));
$('cost-destination-toggle').addEventListener('click',()=>{
 const open=$('cost-destination-panel').hidden;
 toggleDestinationPanel(open);
 if(open)$('destination').focus();
});
$('destination').addEventListener('focus',()=>toggleDestinationPanel(true));
$('destination').addEventListener('input',()=>toggleDestinationPanel(true));
$('destination').addEventListener('keydown',e=>{
 if(e.key==='Escape')toggleDestinationPanel(false);
 if(e.key==='ArrowDown'&&!$('cost-destination-panel').hidden){
  const first=$('cost-destination-groups').querySelector('button');
  if(first){e.preventDefault();first.focus();}
 }
});
$('cost-destination-groups').addEventListener('click',e=>{
 const option=e.target.closest('[data-choose-destination]');
 if(!option)return;
 $('destination').value=option.dataset.chooseDestination;
 toggleDestinationPanel(false);invalidate();
 $('destination').dispatchEvent(new Event('change',{bubbles:true}));
});
$('cost-destination-groups').addEventListener('keydown',e=>{
 if(e.key==='Escape'){toggleDestinationPanel(false);$('destination').focus();}
 if(e.key==='ArrowDown'||e.key==='ArrowUp'){
  const list=[...$('cost-destination-groups').querySelectorAll('button')],index=list.indexOf(document.activeElement);
  if(index>=0){e.preventDefault();list[(index+(e.key==='ArrowDown'?1:-1)+list.length)%list.length].focus();}
 }
});
document.addEventListener('pointerdown',e=>{
 if(!e.target.closest('.cost-destination-field'))toggleDestinationPanel(false);
});
async function loadDestinationChoices(){
 async function fetchStations(table){
  const result=[];
  for(let offset=0;;offset+=500){
   const batch=await cloudRequest(`${table}?select=id,destination,status,supersedes_id&order=created_at.desc,id.asc&limit=500&offset=${offset}`);
   result.push(...batch);
   if(batch.length<500)return result;
  }
 }
 const [fcl,lcl]=await Promise.all([fetchStations('freight_fcl_rail_rates'),fetchStations('freight_rail_plans')]);
 pricedDestinations={fcl,lcl};
 renderDestinationGroups();
}

$('goods').addEventListener('input',()=>{mode();invalidate();});$('goods').addEventListener('change',()=>{mode();invalidate();});mode();
const tables={domestic:'freight_domestic_rates',plans:'freight_rail_plans',fcl:'freight_fcl_rail_rates',trucks:'freight_trucking_rates',rentals:'freight_container_rental_rates'};
async function loadData(input){const keys=input.transport==='fcl'?['fcl','trucks','rentals']:['domestic','plans'];const results=await Promise.all(keys.map(async k=>[k,await all(tables[k])]));data=Object.fromEntries(results);}
function segments(){if(selected?.inputs.transport==='lcl'&&selected.inputs.scope!=='station'){const rows=[...new Map((selected.inputs.pickupChoices||[]).map(c=>[c.id,c])).values()];$('segments').innerHTML=`<label>提货价 / 共享模板<select data-pickup><option value="">自动匹配</option>${rows.map(c=>`<option value="${c.id}" ${selected.inputs.pickupQuote?.quoteId===c.id?'selected':''}>${esc(c.quote.templateName||supplier(c.quote.supplier_id))} · ${c.complete?'适用':'待核对'}</option>`).join('')}</select></label>`;return;}if(!selected?.available){$('segments').innerHTML='';return;}
 const labels={truck:'国内拖车报价',rail:'整箱铁路报价',rent:'SOC租箱报价'};
 $('segments').innerHTML=Object.entries(selected.available).filter(([key])=>key==='rail'||key==='truck'&&activeInput.truck||key==='rent'&&activeInput.rent&&activeInput.equipment==='SOC').map(([key,rows])=>`<label>${labels[key]}<select data-segment="${key}"><option value="" ${!rows.length?'selected':''}>${rows.length?'自动选择首条适用报价':'未匹配适用报价'}</option>${rows.map(r=>`<option value="${r.id}" ${selected.inputs.sources[key]?.id===r.id?'selected':''}>${esc(supplier(r.supplier_id))} · ${esc(r.quote.currency||'币种待定')} ${esc(r.quote.price??'待定')} / ${esc(r.quote.unit||'单位待定')} · ${esc(r.quote.container)}${r.status!=='confirmed'?' · 待确认':''}</option>`).join('')}</select></label>`).join('');
}
function renderSupplierComparison(){
 const panel=$('supplier-comparison'),target=$('comparison-rows');
 if(!selected||!activeInput){panel.hidden=true;$('segments').hidden=false;target.innerHTML='';return;}
 const money=n=>n===null||!Number.isFinite(n)?'待核价':'USD '+n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
 if(activeInput.transport==='fcl'&&matches.length){
  panel.hidden=false;$('segments').hidden=true;
  target.innerHTML='<div class="cost-compare-group"><h4>自动组合方案 · '+matches.length+'个（已核算优先，按参考成本排序）</h4><div class="table-wrap"><table><thead><tr><th>运输方案</th><th>已知采购成本 USD</th><th>参考卖价 USD</th><th>状态</th><th>选择</th></tr></thead><tbody>'+matches.slice(0,8).map(m=>'<tr'+(selected===m?' class="compare-selected"':'')+'><td>'+esc(m.label)+'<small>'+esc(m.matchScope||'')+'</small></td><td>'+esc(m.result.cost.toFixed(2))+'</td><td>'+esc(m.result.price.toFixed(2))+'</td><td>'+esc(m.result.complete?'所选费用完整':'参考：'+m.result.pending.join('；'))+'</td><td><button class="secondary" type="button" data-compare-plan="'+esc(m.id)+'" '+(selected===m?'disabled':'')+'>'+(selected===m?'当前选用':'选用')+'</button></td></tr>').join('')+'</tbody></table></div></div>';
 }else if(activeInput.transport==='fcl'){
  const groups=compareFclSuppliers(activeInput,data,choices);
  panel.hidden=!groups.length;
  $('segments').hidden=groups.length>0;
  target.innerHTML=groups.map(group=>'<div class="cost-compare-group"><h4>'+esc(group.label)+' · '+group.quotes.length+'条匹配采购报价</h4><div class="table-wrap"><table><thead><tr><th>供应商</th><th>采购单价</th><th>本票成本 USD</th><th>有效期 / 状态</th><th>需核实问题</th><th>操作</th></tr></thead><tbody>'+
   group.quotes.map(q=>{
    const raw=q.source.quote,valid=q.validity,notes=q.pending.join('；');
    const amount=Number.isFinite(raw.price)?raw.currency+' '+Number(raw.price).toLocaleString('en-US')+' / '+(raw.unit||'待核对'):'待报价';
    return '<tr'+(q.selected?' class="compare-selected"':'')+'><td>'+esc(supplier(q.supplierId))+'</td><td>'+esc(amount)+'</td><td>'+esc(money(q.amount))+'</td><td>'+esc([valid?.from||'未填写',valid?.until||'未填写'].join(' — '))+'<br><small>'+esc(valid?.status||'未填写')+'</small></td><td>'+(q.complete?'成本段已核算':esc(notes||'待核实金额或单位'))+'</td><td><button type="button" class="secondary" data-compare-kind="'+esc(group.key)+'" data-compare-id="'+esc(q.id)+'" '+(q.selected?'disabled':'')+'>'+(q.selected?'当前选用':'选用')+'</button></td></tr>';
   }).join('')+'</tbody></table></div></div>').join('');
 }else{
  const plans=compareLclPlans(matches);
  panel.hidden=plans.length===0;
  $('segments').hidden=plans.length>0;
  target.innerHTML=plans.length?'<div class="cost-compare-group"><h4>拼箱铁路方案 · '+plans.length+'个</h4><div class="table-wrap"><table><thead><tr><th>方案 / 供应商</th><th>本票已知成本</th><th>状态</th><th>选择</th></tr></thead><tbody>'+plans.map(p=>'<tr'+(selected.id===p.id?' class="compare-selected"':'')+'><td>'+esc(p.label)+'</td><td>'+esc(money(p.cost))+'</td><td>'+esc(p.complete?'已核算':'费用待核实：'+p.pending.join('；'))+'</td><td><button class="secondary" type="button" data-compare-plan="'+esc(p.id)+'" '+(selected.id===p.id?'disabled':'')+'>'+(selected.id===p.id?'当前选用':'选用')+'</button></td></tr>').join('')+'</tbody></table></div></div>':'';
 }
}
$('comparison-rows').addEventListener('click',event=>{
 const button=event.target.closest('button[data-compare-kind],button[data-compare-plan]');
 if(!button||!activeInput)return;
 if(button.dataset.comparePlan){
  const plan=matches.find(x=>x.id===button.dataset.comparePlan);
  if(!plan)return;
  selected=plan;$('options').value=String(matches.indexOf(plan));
 }else{
  const key=button.dataset.compareKind,quoteId=button.dataset.compareId;
  const current=selected.available?.[key]?.some(x=>x.id===quoteId);
  if(!current)return;
  choices[key]=quoteId;
  selected=estimateFcl(activeInput,data,choices);
 }
 segments();show();
});
function show(){
 if(selected?.inputs.transport==='fcl'){
  const d=diagnoseFclMatches(selected.inputs,data);
  const pending=selected.result?.pending||[];
  const diagnostics=[...d.reasons];
  if(pending.some(x=>x.includes('国内拖车：未匹配')))diagnostics.push('国内拖车没有匹配：请核对提空箱地、装箱地、起运站以及箱型');
  if(pending.some(x=>x.includes('租箱基础费（不含超期）：未匹配')))diagnostics.push('租箱价格未匹配：请核对箱型、提还箱地及有效期；或取消不需要的租箱费');
  const box=$('match-diagnostics');
  box.hidden=diagnostics.length===0;
  box.innerHTML=diagnostics.length?'<strong>匹配提示</strong><ul>'+[...new Set(diagnostics)].map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul>':'';
 }else{$('match-diagnostics').hidden=true;$('match-diagnostics').textContent='';}
 if(!selected){renderSupplierComparison();$('result').innerHTML='<section class="audit-overview audit-incomplete"><strong>没有找到可核算的拼箱价格组合</strong><p>请检查起运站、境外目的站、日期、启用状态和重抛比。请先到 <a href="/rail-rates.html">拼箱铁路运费库</a> 检查方案，再查看 <a href="/rates.html">国内干线</a> 和 <a href="/pickup-rates.html">提货费</a>。</p><p>没有采购价的项目不会作为0元计入。</p></section>';$('save').disabled=true;$('publish').disabled=true;return;}
 const r=selected.result,s=selected.inputs;
 const sources=s.sources?Object.values(s.sources):[s.pickupQuote,s.linehaulQuote].filter(Boolean);
 const costDates=sources.map(x=>x.quote?.validUntil||x.quote?.valid_until||x.valid_until||x.validUntil).filter(x=>/^\d{4}-\d{2}-\d{2}$/.test(String(x||''))).sort();
 const usableExpiry=costDates.find(x=>x>=s.date);
 if(!s.webValidUntil&&usableExpiry)s.webValidUntil=usableExpiry;
 if(s.webValidUntil&&usableExpiry&&s.webValidUntil>usableExpiry)s.webValidUntil=usableExpiry;
 const validityRows=(r.validity||[]).map(v=>`<tr><td>${esc(v.name)}</td><td>${esc(v.from||'未填写')} — ${esc(v.until||'未填写')}</td><td>${esc(v.status)}</td></tr>`).join('');
 const audit=quoteAuditRows(selected);
 const usd=n=>n===null||!Number.isFinite(Number(n))?'缺失':Number(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
 const auditTable='<section class="cost-audit"><div class="cost-audit-heading"><h3>价格组合与缺失检查</h3><span>'+audit.segments.length+' 个费用段 · '+audit.missing+' 段缺价 · '+audit.review+' 段待核对</span></div><div class="table-wrap"><table class="cost-audit-table"><thead><tr><th>费用段</th><th>匹配价格 / 供应商</th><th>已计入成本 USD</th><th>状态与补全要求</th><th>操作</th></tr></thead><tbody>'+
 audit.segments.map(seg=>'<tr class="audit-'+seg.status+'"><td><strong>'+esc(seg.label)+'</strong></td><td>'+esc(seg.source?supplier(seg.source):seg.amount!==null?'已匹配':'暂无匹配')+'<small>'+esc(seg.basis||'尚无计价依据')+'</small></td><td class="audit-money">'+(seg.amount===null?'—':usd(seg.amount))+'</td><td><span class="audit-pill audit-pill-'+seg.status+'">'+(seg.status==='ok'?'已匹配':seg.status==='review'?'待核实':'缺失价格')+'</span><small>'+esc(seg.issues.join('；')||(seg.status==='missing'?'未找到可用计价记录，请检查起运站、目的站、计价条件及价格状态':'当前计价结果仅覆盖已选费用段'))+'</small></td><td><a href="'+seg.link+'" class="audit-link">查看价格库</a></td></tr>').join('')+
 '</tbody></table></div>'+
 (audit.unmatched.length?'<div class="audit-unmatched"><strong>其他待处理问题</strong><ul>'+audit.unmatched.map(s=>'<li>'+esc(s)+'</li>').join('')+'</ul></div>':'')+
 '<p class="audit-footnote">费用只统计本票已匹配且可计入的金额。缺失费用没有被估为0；采购价过期、供应商未确认和附加条款需另行复核。</p></section>';
 const auditSummary='<div class="audit-overview '+(r.complete?'audit-complete':'audit-incomplete')+'"><strong>'+(r.complete?'已找到可核算方案':'已找到参考方案（部分费用待补）')+'</strong><span>'+(r.complete?'采购价统一参与试算，可选择其他方案比较成本和卖价。':'已计入所有匹配到的采购价；缺少的费用单独提示，不视为0元。')+'</span></div>';
 const validityHtml=validityRows?`<details class="cost-validity"><summary>采购价有效期（仅提示，不影响测算）</summary><table><thead><tr><th>费用项目</th><th>采购价有效期</th><th>匹配日期状态</th></tr></thead><tbody>${validityRows}</tbody></table></details>`:'';
 const qty=s.transport==='lcl'?r.railQty:s.quantity,mid=r.complete&&qty>0?r.price/qty:null,range=s.webRange??5,low=mid===null?null:mid*(1-range/100),high=mid===null?null:mid*(1+range/100);selected.websitePrice=mid===null?null:{quantity:qty,unit:s.transport==='lcl'?'billable_cbm':'container',mid,low,high};
 $('result').innerHTML=`<p class="audit-route"><strong>${esc(selected.label)}</strong></p>${auditSummary}<div class="stats"><article>${r.complete?'采购成本':'已知成本（未完整）'} USD<strong>${Number(r.cost).toFixed(2)}</strong></article><article>${r.complete?'官网目标售价':'暂估官网售价'} USD<strong>${Number(r.price).toFixed(2)}</strong></article><article>${r.complete?'预计利润':'暂估利润'} USD<strong>${Number(r.profit).toFixed(2)}</strong></article></div>${mid!==null?`<div class="website-price"><strong>官网销售价区间</strong><span>USD ${low.toFixed(2)}–${high.toFixed(2)} / ${s.transport==='lcl'?'计费方':'柜'}</span><small>官网只显示销售价，不公开采购成本和利润。</small></div>`:''}${auditTable}${validityHtml}${r.pending.length?`<p class="pending">待核对：${r.pending.map(esc).join('；')}。缺失费用未计入，暂估结果不能作为完整报价。</p>`:'<p>所选范围内费用已完整。</p>'}<details><summary>展开费用明细与采购来源（${r.lines.length}项）</summary><div class="table-wrap"><table><thead><tr><th>费用</th><th>计算依据</th><th>供应商</th><th>USD</th></tr></thead><tbody>${r.lines.map(l=>`<tr><td>${esc(l.name)}</td><td>${esc(l.basis)}</td><td>${esc(l.supplier_id?supplier(l.supplier_id):'—')}</td><td>${Number(l.value).toFixed(2)}</td></tr>`).join('')}</tbody></table></div><p>1 USD = CNY ${esc(s.fx)}${s.eurFx?'；1 EUR = USD '+esc(s.eurFx):''}。仅核算所选运输段；境外清关、配送及未列明费用未包含。</p>${s.railPlanId?`<p>拼箱铁路采购版本：${esc(s.railPlanId)}</p>`:''}${sources.map(row=>{const q=row.quote||row;return `<details><summary>${esc(row.origin||q.origin||'')} → ${esc(row.destination||q.destination||'')} · ${esc(supplier(row.supplier_id||q.supplier_id))}</summary><p>采购版本：${esc(row.id||q.quoteId||q.source?.filename||(typeof q.source==='string'?q.source:'—'))}</p><p class="cost-terms">${esc(q.notes||'无附加操作说明')}</p></details>`;}).join('')}</details>`;
 renderSupplierComparison();
 $('save').disabled=false;
 $('publish').disabled=!r.complete||mid===null;

}
$('segments').onchange=e=>{if(e.target.hasAttribute('data-pickup')){activeInput.pickupQuoteId=e.target.value;delete activeInput.pickupOverride;const previous=selected.id;matches=estimateLcl(activeInput,data);selected=matches.find(m=>m.id===previous)||matches[0];segments();show();return;}const key=e.target.dataset.segment;if(!key||!activeInput)return;choices[key]=e.target.value;selected=estimateFcl(activeInput,data,choices);segments();show();};
$('goods').onsubmit=async e=>{e.preventDefault();if(busy)return;busy=true;$('compute').disabled=true;const input=read(),fingerprint=JSON.stringify(input);invalidate();try{$('notice').textContent='正在读取最新采购价格…';await loadData(input);if(JSON.stringify(read())!==fingerprint){$('notice').textContent='输入已变化，请重新核算。';return;}activeInput=input;
 if(input.transport==='fcl'){matches=estimateFclVariants(input,data,{limit:35});selected=matches[0]||null;if(!selected&&input.station?.trim()){selected=estimateFcl(input,data,choices);matches=[selected];}}else{matches=estimateLcl(input,data);selected=matches[0]||null;}for(const item of [selected,...matches].filter(Boolean))Object.assign(item.inputs,{webRange:input.webRange,webMinimum:input.webMinimum,webValidUntil:input.webValidUntil});
 $('options').innerHTML=matches.map((m,i)=>`<option value="${i}">${esc(m.label)} · USD ${m.result.cost.toFixed(2)}${m.result.complete?'':' · 参考'}</option>`).join('');$('alternatives').hidden=matches.length<2;segments();show();$('notice').textContent='已按路线及规格匹配采购价格；有效期展示在报价结果下方，不作为匹配限制。';
 }catch(error){selected=null;$('segments').innerHTML='';$('result').textContent=error.message;$('save').disabled=true;$('notice').textContent='测算未完成，请检查输入或价格库。';}finally{busy=false;$('compute').disabled=false;}};
$('options').onchange=()=>{selected=matches[Number($('options').value)]||matches[0];segments();show();};
function renderHistory(){const p=pager.update(history.length,historyPage);historyPage=p.page;$('history').innerHTML=history.slice(p.start,p.end).map((h,j)=>`<button class="secondary" data-history="${p.start+j}">${esc(h.route)} · ${esc(new Date(h.created_at).toLocaleString())}</button>`).join('')||'暂无历史测算';}
async function loadHistory(){history=await all('freight_cost_snapshots');renderHistory();}
$('history').onclick=e=>{if(e.target.dataset.history===undefined)return;const h=history[Number(e.target.dataset.history)];invalidate();selected={id:'history',label:h.route,inputs:structuredClone(h.inputs),result:structuredClone(h.result),snapshotId:h.id};const s=selected.inputs;for(const id of ['transport','scope','origin','station','destination','date','box','equipment','pickupPlace','pieces','weight','volume','quantity','fx','eurFx','profitMode','profit','webRange','webMinimum','webValidUntil'])if(s[id]!==undefined)$(id).value=s[id]??'';if(!s.transport)$('transport').value='lcl';for(const id of ['truck','rent','preview'])if(s[id]!==undefined)$(id).checked=s[id];mode();$('notice').textContent='显示历史快照；重新核算将获取当前采购价。';show();const review=$('terms-reviewed');if(review)review.disabled=true;};
async function saveSnapshot(){if(selected.snapshotId)return selected.snapshotId;const snapshot=structuredClone(selected),saved=await cloudRequest('freight_cost_snapshots',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({route:snapshot.inputs.route,inputs:snapshot.inputs,result:snapshot.result})});if(saved.length!==1)throw Error('保存数量异常');selected.snapshotId=saved[0].id;await loadHistory();return selected.snapshotId;}
$('save').onclick=async()=>{if(!selected)return;$('save').disabled=true;try{await saveSnapshot();$('notice').textContent='已保存输入、采购版本及本次测算快照。';}catch(error){$('notice').textContent=error.message;}finally{$('save').disabled=!selected;}};
$('publish').onclick=async()=>{if(!selected?.result.complete||!selected.websitePrice)return;$('publish').disabled=true;try{const snapshotId=await saveSnapshot(),row=websiteQuoteDraft(selected,snapshotId);const saved=await cloudRequest('freight_public_quotes',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify(row)});if(saved.length!==1)throw Error('官网价格发布数量异常');$('notice').textContent='已生成官网销售价格草稿，请前往「官网销售价格」审核发布。';}catch(error){$('notice').textContent=error.message;}finally{$('publish').disabled=!selected?.result.complete;}};
async function start(){if(!syncAuthShell())return;try{suppliers=await listSuppliers();await Promise.all([loadHistory(),loadDestinationChoices().catch(error=>{$('cost-destination-help').textContent='站点列表暂不可用，可直接输入目的站。';})]);$('notice').textContent='价格在点击核算时读取；站点列表按已确认采购价筛选。';}catch(error){$('notice').textContent=error.message;}}
$('login-form').onsubmit=async e=>{e.preventDefault();try{const f=new FormData(e.target);await login(f.get('email'),f.get('password'));e.target.reset();await start();}catch(error){$('notice').textContent=error.message;}};start();
