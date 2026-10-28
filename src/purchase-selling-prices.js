import {cloudRequest,currentUser} from './cloud.js';
import {railUnit} from './rail-unit.js';

// All surcharges use the same currency AND billing unit as their purchase-rate component.
export function purchaseFields(kind,row){
 const q=row?.quote||{};
 if(kind==='lcl_plan'){
  try{return [{key:'unit',label:'铁路计费方',purchase:railUnit(row.inputs).unit,unit:'计费方'}];}
  catch{return [{key:'unit',label:'铁路计费方',purchase:null,unit:'计费方'}];}
 }
 if(kind!=='domestic')return [{key:'price',label:'每'+(q.unit||'单位'),purchase:q.price,unit:q.unit||''}];
 if(q.sharedPickup||q.rule==='tier')return (q.tiers||[]).map((t,i)=>({key:'tier_'+i,label:(t.minVolume??0)+'–'+(t.maxVolume??'∞')+'方 / '+(t.minWeight??0)+'–'+(t.maxWeight??'∞')+'kg',purchase:t.amount,unit:t.unit==='cbm'?'CBM':t.unit==='billable'?'计费方':'票'}));
 if(q.rule==='fixed')return [{key:'fixed',label:'每票',purchase:q.fixed,unit:'票'}];
 return [{key:'cbm',label:'每方',purchase:q.cbm,unit:'CBM'},{key:'ton',label:'每吨',purchase:q.ton,unit:'吨'}];
}
export function sellingPrice(purchase,fee=0){
 if(purchase===null||purchase===undefined||purchase===''||!Number.isFinite(Number(purchase))||Number(purchase)<0)return null;
 if(!Number.isFinite(fee)||fee<0)throw Error('操作费必须为非负数');
 return Math.round((Number(purchase)+fee)*10000)/10000;
}
export function operationFeeTotal(purchase,fixed=0,percent=0){
 if(purchase===null||purchase===undefined||!Number.isFinite(Number(purchase)))return null;
 if(!Number.isFinite(fixed)||fixed<0||!Number.isFinite(percent)||percent<0)throw Error('操作费金额与比例必须为非负数');
 return Math.round((fixed+Number(purchase)*percent/100)*10000)/10000;
}
export function changeOperationFee(current,mode,amount){
 if(!Number.isFinite(amount)||amount<0)throw Error('操作费变更必须为非负金额');
 if(!Number.isFinite(current)||current<0)throw Error('原操作费无效');
 const next=mode==='set'?amount:mode==='add'?current+amount:mode==='subtract'?current-amount:NaN;
 if(!Number.isFinite(next)||next<0)throw Error('减少金额不能超过现有操作费');
 return Math.round(next*10000)/10000;
}
export function compatibleFeeBatch(kind,items,key){
 if(!items.length)throw Error('没有选中的采购价格');
 const dimensions=new Set();
 for(const row of items){
  const field=purchaseFields(kind,row).find(f=>f.key===key);
  if(!field||field.purchase===null||!Number.isFinite(Number(field.purchase)))throw Error('部分记录缺少同类采购价，不能批量加费');
  const currency=kind==='lcl_plan'?'USD':row.quote?.currency;
  if(!currency||!['USD','CNY','EUR'].includes(currency))throw Error('请先确定所有记录的币种');
  dimensions.add(currency+'|'+field.unit+'|'+(key.startsWith('tier_')?field.label:''));
 }
 if(dimensions.size!==1)throw Error('所选价格币种、计价单位或阶梯条件不一致，请缩小筛选范围');
 return true;
}
const escaped=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const config={
 '/fcl-rail.html':['fcl_rail','#fcl-rows','freight_fcl_rail_rates'],
 '/trucking.html':['trucking','#trucking-rows','freight_trucking_rates'],
 '/container-rental.html':['rental','#rental-rows','freight_container_rental_rates'],
 '/rates.html':['domestic','#rows','freight_domestic_rates'],
 '/pickup-rates.html':['domestic','#rows','freight_domestic_rates'],
 '/rail-rates.html':['lcl_plan','#history','freight_rail_plans']
};
export function mountOperationFees(){
 const configuration=config[location.pathname];if(!configuration)return;
 const [kind,selector,sourceTable]=configuration;
 const body=document.querySelector(selector),table=body?.closest('table');if(!body||!table)return;
 let saved=new Map(),sourceRows=new Map(),selected=new Set(),busy=false,booted=false,loading=false;
 const notice=document.createElement('div');notice.className='toolbar sale-toolbar';
 notice.innerHTML='<button type="button" class="secondary" data-select>选中本页操作费</button><button type="button" class="secondary" data-clear>清除</button><span data-count>已选0条</span><button type="button" data-bulk>批量增减操作费</button><span data-message role="status"></span>';
 table.closest('.panel').insertBefore(notice,table.closest('.table-wrap'));
 const message=t=>{notice.querySelector('[data-message]').textContent=t;};
 function ensureHeaders(){
  const head=table.querySelector('thead tr');if(!head)return;
  for(const key of ['operation-fee','selling-price'])if(!head.querySelector('th[data-col="'+key+'"]')){
   const th=document.createElement('th');th.dataset.col=key;th.className='sale-col';
   th.textContent=key==='operation-fee'?'操作费':'卖价';
   head.insertBefore(th,head.lastElementChild);
  }
 }
 const idFor=tr=>tr.dataset.saleRow||tr.querySelector('[data-select]')?.dataset.select||tr.querySelector('[data-rail-select]')?.dataset.railSelect;
 function updateCount(){notice.querySelector('[data-count]').textContent='已选 '+selected.size+' 条';}
 function renderCells(){
  ensureHeaders();
  for(const tr of body.querySelectorAll(':scope > tr')){
   if(tr.querySelector('td[data-col="operation-fee"]'))continue;
   const id=idFor(tr);if(!id)continue;
   const row=sourceRows.get(id),record=saved.get(id),fs=row?purchaseFields(kind,row):[];
   const op=document.createElement('td'),sale=document.createElement('td');op.className='sale-col';sale.className='sale-col';op.dataset.col='operation-fee';sale.dataset.col='selling-price';
   if(!row){op.textContent='读取中';sale.textContent='—';}
   else{
    const currency=kind==='lcl_plan'?'USD':row.quote?.currency||'';
    op.innerHTML='<div class="sale-cell"><input type="checkbox" data-fee-check="'+escaped(id)+'" '+(selected.has(id)?'checked':'')+' aria-label="选中操作费"><div class="sale-inputs">'+fs.map(f=>'<label>'+escaped(f.label)+' · 固定金额<input type="number" min="0" step="any" data-fee-id="'+escaped(id)+'" data-fee-key="'+escaped(f.key)+'" data-fee-type="fixed" value="'+escaped(record?.operation_fees?.[f.key]??0)+'" '+(f.purchase===null||f.purchase===undefined?'disabled title="请先补采购价"':'')+'></label><label>采购价比例 %<input type="number" min="0" max="300" step="any" data-fee-id="'+escaped(id)+'" data-fee-key="'+escaped(f.key)+'" data-fee-type="percent" value="'+escaped(record?.operation_percentages?.[f.key]??0)+'" '+(f.purchase===null||f.purchase===undefined?'disabled title="请先补采购价"':'')+'></label>').join('')+'</div></div>';
    sale.innerHTML='<div class="sale-inputs">'+fs.map(f=>{const fixed=Number(record?.operation_fees?.[f.key]??0),percent=Number(record?.operation_percentages?.[f.key]??0),fee=operationFeeTotal(f.purchase,fixed,percent),value=sellingPrice(f.purchase,fee??0);return '<div class="sale-result"><small>'+escaped(f.label)+'</small><strong>'+ (value===null?'采购价待补':escaped(currency)+' '+value.toLocaleString('en-US',{maximumFractionDigits:4}))+'</strong></div>';}).join('')+'</div>';
   }
   tr.insertBefore(op,tr.lastElementChild);tr.insertBefore(sale,tr.lastElementChild);
  }
  updateCount();
 }
 function redraw(){for(const td of body.querySelectorAll('td[data-col="operation-fee"],td[data-col="selling-price"]'))td.remove();renderCells();}
 async function refreshSource(){
  const all=[];for(let offset=0;offset<10000;offset+=500){
   const extra=location.pathname==='/pickup-rates.html'?'&kind=eq.pickup':'';
   const b=await cloudRequest(sourceTable+'?select=*&order=created_at.desc,id.asc&limit=500&offset='+offset+extra);all.push(...b);if(b.length<500)break;
  }
  sourceRows=new Map(all.map(r=>[r.id,r]));
 }
 async function refreshSaved(){
  const all=[];for(let offset=0;offset<10000;offset+=500){
   const b=await cloudRequest('freight_purchase_selling_prices?select=*&source_kind=eq.'+kind+'&limit=500&offset='+offset);all.push(...b);if(b.length<500)break;
  }
  saved=new Map(all.map(r=>[r.source_id,r]));
 }
 async function persist(row,key,fee,type='fixed'){
  const field=purchaseFields(kind,row).find(f=>f.key===key);
  if(!field||field.purchase===null||field.purchase===undefined)throw Error('采购价不存在，不能设置操作费');
  if(!Number.isFinite(fee)||fee<0||type==='percent'&&fee>300)throw Error('操作费比例须在0–300%之间，固定操作费必须非负');
  const currency=kind==='lcl_plan'?'USD':row.quote?.currency;
  if(!['USD','CNY','EUR'].includes(currency))throw Error('采购价币种待确认');
  const old=saved.get(row.id),fieldName=type==='percent'?'operation_percentages':'operation_fees';
  const next={...(old?.[fieldName]||{}),[key]:fee};
  const result=await cloudRequest('freight_purchase_selling_prices?on_conflict=source_kind,source_id',{
   method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=representation'},
   body:JSON.stringify({source_kind:kind,source_id:row.id,currency,[fieldName]:next,updated_at:new Date().toISOString()})
  });
  if(!Array.isArray(result)||result.length!==1)throw Error('保存未成功，请检查权限');
  saved.set(row.id,result[0]);
 }
 body.addEventListener('change',async e=>{
  if(e.target.matches('[data-fee-check]')){const id=e.target.dataset.feeCheck;e.target.checked?selected.add(id):selected.delete(id);updateCount();return;}
  const input=e.target.closest('input[data-fee-id]');if(!input||busy)return;
  const row=sourceRows.get(input.dataset.feeId);if(!row)return;
  const amount=Number(input.value);
  const feeType=input.dataset.feeType||'fixed';
  const savedField=feeType==='percent'?'operation_percentages':'operation_fees';
  if(input.value.trim()===''||!Number.isFinite(amount)||amount<0||feeType==='percent'&&amount>300){message('操作费不能为负；比例范围0–300%，0表示不加价');input.value=saved.get(row.id)?.[savedField]?.[input.dataset.feeKey]??0;return;}
  busy=true;input.disabled=true;
  try{await persist(row,input.dataset.feeKey,amount,feeType);message('固定金额和采购价比例已保存；卖价已自动更新');}
  catch(err){message('保存失败：'+err.message);input.value=saved.get(row.id)?.[savedField]?.[input.dataset.feeKey]??0;}
  finally{busy=false;redraw();}
 });
 notice.querySelector('[data-select]').onclick=()=>{for(const el of body.querySelectorAll('[data-fee-check]')){el.checked=true;selected.add(el.dataset.feeCheck);}updateCount();};
 notice.querySelector('[data-clear]').onclick=()=>{selected.clear();for(const el of body.querySelectorAll('[data-fee-check]'))el.checked=false;updateCount();};
 notice.querySelector('[data-bulk]').onclick=()=>{
  const ids=[...selected].filter(id=>sourceRows.has(id));if(!ids.length)return message('先在操作费列勾选记录');
  if(ids.length>500)return message('单次最多修改500条');
  const rows=ids.map(id=>sourceRows.get(id));
  const choices=purchaseFields(kind,rows[0]);if(!choices.length)return message('采购价格暂未录入');
  const dialog=document.createElement('dialog');dialog.className='supplier-quote-dialog fee-dialog';
  dialog.innerHTML='<form><div class="dialog-heading"><h2>批量操作费 · '+ids.length+'条</h2><button type="button" class="secondary" data-close>关闭</button></div><div class="fields"><label>费用项目<select name="field">'+choices.map(f=>'<option value="'+escaped(f.key)+'">'+escaped(f.label)+'</option>').join('')+'</select></label><label>操作费方式<select name="feeType"><option value="fixed">固定金额（原币种）</option><option value="percent">按采购价比例（%）</option></select></label><label>调整方式<select name="mode"><option value="set">统一设置</option><option value="add">每条增加</option><option value="subtract">每条减少</option></select></label><label>调整数值（金额或百分比）<input name="amount" type="number" min="0" step="any" required></label></div><p class="subtle">操作费 = 固定金额 + 采购价 × 百分比；卖价 = 采购价 + 操作费，不覆盖采购价。同一批需币种、单位、阶梯范围一致。</p><p data-error role="alert"></p><footer><button type="submit">预览并确认</button></footer></form>';
  document.body.append(dialog);dialog.querySelector('[data-close]').onclick=()=>dialog.close();dialog.onclose=()=>dialog.remove();
  dialog.querySelector('form').onsubmit=async e=>{
   e.preventDefault();if(busy)return;
   const v=Object.fromEntries(new FormData(e.target)),amount=Number(v.amount);
   try{
    if(v.amount.trim()==='')throw Error('请输入操作金额');
    compatibleFeeBatch(kind,rows,v.field);
    if(v.feeType==='percent'&&amount>300)throw Error('百分比范围0–300%');
    const fieldName=v.feeType==='percent'?'operation_percentages':'operation_fees';
    const updates=rows.map(row=>({row,value:changeOperationFee(Number(saved.get(row.id)?.[fieldName]?.[v.field]??0),v.mode,amount)}));
    if(v.feeType==='percent'&&updates.some(x=>x.value>300))throw Error('调整后比例超过300%');
    if(!confirm('确认对 '+rows.length+' 条记录'+({set:'统一设置为',add:'增加',subtract:'减少'}[v.mode]||'修改')+' '+amount+(v.feeType==='percent'?'%':' 原币种金额')+' 操作费？各行卖价自动重新计算，采购价不变。'))return;
    busy=true;let done=0,failed='';
    for(const x of updates){try{await persist(x.row,v.field,x.value,v.feeType);done++;}catch(err){failed=err.message;break;}}
    selected.clear();redraw();dialog.close();
    message('成功 '+done+'/'+updates.length+' 条'+(failed?'，中断原因：'+failed:'')+'；卖价已自动重算');
   }catch(err){dialog.querySelector('[data-error]').textContent=err.message;}
   finally{busy=false;}
  };
  dialog.showModal();
 };
 // Dynamic source tables re-render on page and filter changes.
 const observer=new MutationObserver(()=>{renderCells();if(!loading&&currentUser()&&[...body.querySelectorAll(':scope > tr')].some(tr=>{const id=idFor(tr);return id&&!sourceRows.has(id);})){
  loading=true;queueMicrotask(async()=>{try{await refreshSource();await refreshSaved();redraw();}catch(e){message(e.message);}finally{loading=false;}});}});
 observer.observe(body,{childList:true});
 async function boot(){
  if(booted||!currentUser())return;booted=true;
  try{await refreshSource();await refreshSaved();redraw();}
  catch(e){booted=false;message('操作费加载失败：'+e.message);}
 }
 void boot();
 const authObserver=new MutationObserver(()=>{if(currentUser())void boot();});
 authObserver.observe(document.documentElement,{attributes:true,attributeFilter:['class']});
}
if(typeof document!=='undefined')mountOperationFees();
