import {draftableStationRail,needsBalanceFee,prepareStationRailQuote,stationRailSalesDraft} from './sales-quote-generator.js';
import {cloudRequest,currentUser,syncAuthShell} from './cloud.js';
const $=id=>document.getElementById(id), esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let rows=[],filtered=[],page=1,busy=false;const pageSize=30,selected=new Set();
const now=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const num=x=>Number(x);
const money=n=>Number.isFinite(num(n))?'USD '+num(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}):'—';
const quoteKey=r=>[r.origin,r.station,r.destination,r.transport,r.service_scope,r.container||''].map(v=>String(v||'').toLowerCase().trim()).join('|');
const valid=r=>{const m=r.pricing_meta||{};return r.source_snapshot_id&&num(m.cost)>0&&num(r.unit_price_low)>0&&num(r.unit_price_high)>=num(r.unit_price_low)&&r.valid_until&&r.valid_until>=now()&&(!r.valid_from||r.valid_from<=r.valid_until)&&r.currency==='USD'&&!m.sourceValidityNeedsReview;};
function notify(t){$('notice').textContent=t;}
function refreshView(){const query=$('search').value.trim().toLowerCase(),month=$('month').value,mode=$('transport').value,status=$('status').value;
 filtered=rows.filter(r=>(!mode||r.transport===mode)&&(!status||r.status===status)&&(!query||[r.origin,r.station,r.destination].join(' ').toLowerCase().includes(query))&&(!month||String(r.valid_from||r.created_at||'').slice(0,7)===month));
 page=Math.min(page,Math.max(1,Math.ceil(filtered.length/pageSize)));render();}
function render(){const start=(page-1)*pageSize,view=filtered.slice(start,start+pageSize);
 $('summary').textContent='共 '+filtered.length+' 条 · 待审核 '+filtered.filter(r=>r.status==='draft').length+' · 已发布 '+filtered.filter(r=>r.status==='active').length;
 $('rows').innerHTML=view.map(r=>{const m=r.pricing_meta||{},readiness=valid(r),checked=selected.has(r.id)?'checked':'';
 return '<tr><td><input type="checkbox" data-select="'+esc(r.id)+'" '+checked+'></td><td>'+esc(r.origin||r.station||'—')+' → '+esc(r.destination)+'<small style="display:block">'+esc(r.service_scope||'')+'</small></td><td>'+esc(r.transport==='fcl'?'铁路整箱':'铁路拼箱')+' '+esc(r.container||'')+'</td><td>'+esc(money(m.cost))+'</td><td>'+esc(money(r.unit_price_low))+' — '+esc(money(r.unit_price_high))+'<small style="display:block">/ '+esc(r.unit||'')+'</small></td><td>'+esc(m.profitMode||'—')+' '+esc(m.profit??'—')+'</td><td>'+esc(r.valid_from||'—')+' 至 '+esc(r.valid_until||'—')+'</td><td>'+esc(r.status==='active'?'已发布':r.status==='draft'?'待审核':'已下架')+(r.status==='draft'&&!readiness?'<small style="display:block;color:#b45309">需核对采购价有效期、成本快照及售价，暂不可发布</small>':'')+'</td><td><button class="secondary" data-action="'+(r.status==='active'?'archive':'publish')+'" data-id="'+esc(r.id)+'" '+(r.status==='draft'&&!readiness?'disabled':'')+'>'+(r.status==='active'?'下架':r.status==='draft'?'发布':'—')+'</button></td></tr>';}).join('');
 $('empty').hidden=rows.length>0;$('page').textContent=page+' / '+Math.max(1,Math.ceil(filtered.length/pageSize));$('prev').disabled=page<=1;$('next').disabled=page>=Math.ceil(filtered.length/pageSize);
 $('all').checked=view.length>0&&view.every(r=>selected.has(r.id));
}
async function load(){notify('正在读取销售价格…');selected.clear();const all=[];for(let offset=0;;offset+=500){const chunk=await cloudRequest('freight_public_quotes?select=*&order=created_at.desc,id.asc&limit=500&offset='+offset);all.push(...chunk);if(chunk.length<500)break;}rows=all;refreshView();notify('销售价格已同步。采购成本和利润仅在内部显示。');}
async function patch(id,fields){const result=await cloudRequest('freight_public_quotes?id=eq.'+encodeURIComponent(id),{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify(fields)});if(result.length!==1)throw Error('保存失败，请检查权限。');rows=rows.map(r=>r.id===id?result[0]:r);return result[0];}
async function publish(ids){let done=0;for(const id of ids){const row=rows.find(r=>r.id===id);if(!row||row.status!=='draft'||!valid(row))continue;
 const overlap=rows.some(x=>x.id!==id&&x.status==='active'&&quoteKey(x)===quoteKey(row)&&(!x.valid_until||x.valid_until>=now()));
 if(overlap)throw Error(row.origin+' → '+row.destination+' 存在同线路已发布价格，请先下架旧版，避免官网匹配冲突。');
 await patch(id,{status:'active'});done++;
 }notify('已发布 '+done+' 条；官网仅展示有效的已发布销售价格。');}
async function archive(ids){let done=0;for(const id of ids){const r=rows.find(r=>r.id===id);if(r?.status!=='active')continue;await patch(id,{status:'inactive'});done++;}notify('已下架 '+done+' 条。');}
async function reprice(ids){const mode=$('profit-mode').value,value=num($('profit').value),validUntil=$('valid-until').value;if(!Number.isFinite(value)||value<0||(mode==='margin'&&value>=100))throw Error('利润参数无效。');if(!validUntil||validUntil<now())throw Error('请选择今天或以后的有效期。');
 let count=0;for(const id of ids){const r=rows.find(x=>x.id===id);if(r?.status!=='draft')continue;const meta=r.pricing_meta||{},cost=num(meta.cost),qty=num(meta.quantity||0)|| (r.transport==='fcl'?num(meta.quantity||1):0);
 if(!(cost>0)||!r.source_snapshot_id||!(qty>0))continue;
 const total=mode==='markup'?cost*(1+value/100):mode==='margin'?cost/(1-value/100):cost+value;
 const unit=total/qty,spread=num(meta.rangePercent??5),minimum=num(r.minimum_charge||0);
 if(!(unit>0)||!Number.isFinite(spread)||spread<0||spread>30)continue;
 await patch(id,{unit_price_low:Number((unit*(1-spread/100)).toFixed(2)),unit_price_high:Number((unit*(1+spread/100)).toFixed(2)),valid_until:validUntil,pricing_meta:{...meta,profitMode:mode,profit:value,targetPrice:total,quantity:qty}});count++;
 }notify('已更新 '+count+' 条草稿；发布前请再次核对完整成本与利润。');}
async function guarded(fn){if(busy)return;busy=true;for(const id of ['reprice','publish','archive'])$(id).disabled=true;try{await fn();refreshView();}catch(e){notify('操作中止：'+e.message);}finally{busy=false;for(const id of ['reprice','publish','archive'])$(id).disabled=false;}}
const picked=()=>[...selected].filter(id=>rows.some(r=>r.id===id));
$('rows').addEventListener('change',e=>{const id=e.target.dataset.select;if(!id)return;if(e.target.checked)selected.add(id);else selected.delete(id);render();});
$('rows').addEventListener('click',e=>{const b=e.target.closest('[data-action]');if(!b)return;guarded(async()=>{if(b.dataset.action==='publish')await publish([b.dataset.id]);else if(b.dataset.action==='archive')await archive([b.dataset.id]);});});
$('all').onchange=e=>{for(const r of filtered.slice((page-1)*pageSize,page*pageSize))if(e.target.checked)selected.add(r.id);else selected.delete(r.id);render();};
for(const id of ['month','transport','status','search'])$(id).addEventListener(id==='search'?'input':'change',()=>{page=1;refreshView();});
$('prev').onclick=()=>{page--;render();};$('next').onclick=()=>{page++;render();};
$('refresh').onclick=()=>guarded(load);
$('publish').onclick=()=>guarded(async()=>{if(!picked().length)throw Error('请选择要发布的草稿。');await publish(picked());});
$('archive').onclick=()=>guarded(async()=>{if(!picked().length)throw Error('请选择要下架的报价。');await archive(picked());});
$('reprice').onclick=()=>guarded(async()=>{if(!picked().length)throw Error('请选择要更新的草稿。');await reprice(picked());});

let procurementRows=[],sourceCandidates=[],sourceBusy=false;
const sourceSelected=new Set();
const currencyMoney=r=>String(r.quote.currency||'USD')+' '+Number(r.quote.price).toLocaleString();
const sourceExisting=r=>rows.some(q=>['draft','active'].includes(q.status)&&q.pricing_meta?.sourceRailId===r.id);
function sourceRender(){
 const body=$('source-rows');
 body.innerHTML=sourceCandidates.map(r=>{
  const available=!sourceExisting(r),checked=sourceSelected.has(r.id);
  const needsFee=needsBalanceFee(r);
  return '<tr><td><input type="checkbox" data-source-select="'+esc(r.id)+'" '+(checked?'checked':'')+' '+(!available?'disabled':'')+'></td><td>'+esc(r.origin)+' → '+esc(r.destination)+'<small style="display:block">'+esc(r.quote.container)+' / '+esc(r.quote.equipment)+'</small><details><summary>原始条款</summary><p style="white-space:pre-wrap;max-width:440px">'+esc(r.quote.notes||'无特殊备注，仍应核实费用范围')+'</p></details></td><td>'+esc(currencyMoney(r))+' / '+esc(r.quote.unit)+'</td><td>'+(needsFee?'<input data-fee="'+esc(r.id)+'" type="number" min="0" step="any" placeholder="核实后填写" style="width:120px">':'—')+'</td><td><input data-other="'+esc(r.id)+'" type="number" min="0" step="any" placeholder="需核实；无则填0" style="width:140px"></td><td><label><input data-review="'+esc(r.id)+'" type="checkbox"> 已核实费用和条款</label></td><td><button class="secondary" data-create="'+esc(r.id)+'" '+(!available?'disabled':'')+'>'+(available?'生成草稿':'已有草稿')+'</button></td></tr>';
 }).join('')||'<tr><td colspan="7">没有符合自动生成条件的采购价；可返回采购库核实箱型、单位和采购状态。</td></tr>';
 $('source-summary').textContent='匹配 '+sourceCandidates.length+' 条已确认采购价，已选 '+sourceSelected.size+' 条。明确的20GP、40HQ和45HQ按柜计价可进入草稿；模糊40尺和2×20尺仍须单独审核。';
 $('source-all').checked=sourceCandidates.length>0&&sourceCandidates.filter(r=>!sourceExisting(r)).every(r=>sourceSelected.has(r.id));
}
async function sourceLoad(){
 if(!currentUser())throw Error('请先登录');
 const month=$('source-month').value;
 if(!/^\d{4}-\d{2}$/.test(month))throw Error('请选择运价月份');
 procurementRows=[];
 for(let offset=0;;offset+=500){
  const chunk=await cloudRequest('freight_fcl_rail_rates?select=*&order=created_at.desc,id.asc&limit=500&offset='+offset);
  procurementRows.push(...chunk);if(chunk.length<500)break;
 }
 sourceCandidates=draftableStationRail(procurementRows,month+'-01');
 sourceSelected.clear();sourceRender();
}
function sourceFields(id){
 const body=$('source-rows');
 return {fee:body.querySelector('[data-fee="'+id+'"]'),other:body.querySelector('[data-other="'+id+'"]'),review:body.querySelector('[data-review="'+id+'"]')};
}
function prepareSelectedRail(row){
 const form=sourceFields(row.id),date=$('source-month').value+'-01',fx=Number($('source-fx').value);
 if(!Number.isFinite(fx)||fx<=0)throw Error('人民币兑美元汇率必须大于零');
 const result=prepareStationRailQuote(row,{date,fx,reviewed:form.review?.checked,profitMode:$('profit-mode').value,profit:Number($('profit').value),balanceFee:form.fee?.value??null,otherFee:form.other?.value??null,range:5,minimum:0});
 return result;
}
async function persistDraft(row,selectedRate){
 const snapshot=await cloudRequest('freight_cost_snapshots',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({route:selectedRate.inputs.route,inputs:selectedRate.inputs,result:selectedRate.result})});
 if(snapshot.length!==1)throw Error('成本快照保存失败');
 const draft=stationRailSalesDraft(selectedRate,snapshot[0].id);
 const inserted=await cloudRequest('freight_public_quotes',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify(draft)});
 if(inserted.length!==1)throw Error('销售草稿创建失败');
 rows.unshift(inserted[0]);sourceSelected.delete(row.id);
 return inserted[0];
}
$('source-load').onclick=()=>guarded(sourceLoad);
$('source-to-review').onclick=()=>{$('published-management').open=true;$('status').value='draft';$('month').value='';refreshView();$('published-management').scrollIntoView({behavior:'smooth',block:'start'});};
$('source-all').onchange=e=>{for(const row of sourceCandidates)if(!sourceExisting(row)){if(e.target.checked)sourceSelected.add(row.id);else sourceSelected.delete(row.id);}for(const cb of $('source-rows').querySelectorAll('[data-source-select]'))cb.checked=sourceSelected.has(cb.dataset.sourceSelect);$('source-summary').textContent='已选 '+sourceSelected.size+' 条，请逐条核实费用后生成草稿。';};
$('source-rows').addEventListener('change',e=>{const id=e.target.dataset.sourceSelect;if(!id)return;if(e.target.checked)sourceSelected.add(id);else sourceSelected.delete(id);$('source-summary').textContent='已选 '+sourceSelected.size+' 条，提交前须逐条核实所有另计费用。';});
$('source-rows').addEventListener('click',event=>{
 const button=event.target.closest('[data-create]');if(!button)return;
 guarded(async()=>{
  const row=sourceCandidates.find(r=>r.id===button.dataset.create);
  if(!row||sourceExisting(row))throw Error('采购价已改变或已有草稿，请刷新');
  const estimate=prepareSelectedRail(row);
  if(!confirm('确认生成 '+row.origin+' → '+row.destination+' '+row.quote.container+' '+row.quote.equipment+' 的待审核销售草稿？不会直接发布官网。'))return;
  await persistDraft(row,estimate);notify('已生成待审核销售草稿；尚未公开。');sourceRender();refreshView();
 });
});
$('source-batch').onclick=()=>guarded(async()=>{
 if(sourceBusy)return;
 const batch=sourceCandidates.filter(r=>sourceSelected.has(r.id)&&!sourceExisting(r));
 if(!batch.length)throw Error('请选择至少一条尚未生成草稿的采购价格');
 if(batch.length>100)throw Error('一次最多处理100条，请缩小筛选范围');
 const ready=[],errors=[];
 for(const r of batch)try{ready.push({row:r,estimate:prepareSelectedRail(r)});}catch(e){errors.push(r.origin+' → '+r.destination+'：'+e.message);}
 if(errors.length){notify('有 '+errors.length+' 条尚未完成核实：'+errors.slice(0,3).join('；')+'。请修正后再批量生成。');return;}
 if(!confirm('将生成 '+ready.length+' 条销售草稿。所有条款及附加费用已逐条核实？本次不会公开销售价。'))return;
 sourceBusy=true;$('source-batch').disabled=true;
 let done=0;try{
  for(const {row,estimate} of ready){
   try{await persistDraft(row,estimate);done++;}catch(e){errors.push(row.origin+' → '+row.destination+'：'+e.message);}
  }
  sourceRender();refreshView();
  notify('批量生成草稿：成功 '+done+' 条'+(errors.length?'；失败 '+errors.length+' 条：'+errors.slice(0,2).join('；'):'')+'。请在第三步审核发布。');
 }finally{sourceBusy=false;$('source-batch').disabled=false;}
});
if(syncAuthShell()&&currentUser()){$('workspace').hidden=false;load().catch(e=>notify(e.message));}else{$('login-panel').hidden=false;}
