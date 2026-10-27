import {cloudRequest,currentUser} from './cloud.js';

export const SALE_FIELDS={
 fcl_rail:[['price','卖价 / 原计价单位']],
 trucking:[['price','卖价 / 原计价单位']],
 rental:[['price','卖价 / 原计价单位']],
 domestic:[['cbm','方卖价'],['ton','吨卖价'],['fixed','固定卖价']],
 lcl_plan:[['unit','USD/计费方']]
};
export function saleFields(kind,row){
 if(kind!=='domestic')return SALE_FIELDS[kind];
 const q=row?.quote||{};
 if(q.sharedPickup)return (q.tiers||[]).map((t,i)=>['tier_'+i, (t.minVolume??0)+'–'+(t.maxVolume??0)+'方 / '+(t.minWeight??0)+'–'+(t.maxWeight??0)+'kg']);
 if(q.rule==='fixed')return [['fixed','卖价/票']];
 if(q.rule==='tier')return [['fixed','阶梯卖价参考/票']];
 return [['cbm','方卖价'],['ton','吨卖价']];
}
export function validSellingFields(kind,fields,currency){
 if(!['USD','CNY','EUR'].includes(currency))throw Error('请先确定币种');
 const allowed=new Set(SALE_FIELDS[kind].map(x=>x[0]));
 if(!allowed.size)throw Error('未知价格类别');
 for(const [k,v] of Object.entries(fields)){
  if(!allowed.has(k)&&!(kind==='domestic'&&/^tier_\d+$/.test(k)))throw Error('非法卖价字段');
  if(v!==null&&(!Number.isFinite(v)||v<=0))throw Error('卖价必须大于零；清空表示未设置');
 }
 return true;
}
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const config={
 '/fcl-rail.html':['fcl_rail','#fcl-rows'],
 '/trucking.html':['trucking','#trucking-rows'],
 '/container-rental.html':['rental','#rental-rows'],
 '/rates.html':['domestic','#rows'],
 '/rail-rates.html':['lcl_plan','#history'],
 '/pickup-rates.html':['domestic','#rows']
};
export function mountPurchaseSellingPrices(){
 const [kind,selector]=config[location.pathname]||[];
 if(!kind)return;
 const body=document.querySelector(selector),table=body?.closest('table');
 if(!body||!table)return;
 let saved=new Map(),selection=new Set(),busy=false,sourceRows=new Map(),pending=new Set();
 let currencyFor=()=>null;
 const head=table.querySelector('thead tr');
 if(!head.querySelector('th.sale-col')){const th=document.createElement('th');th.textContent='卖价（内部）';th.className='sale-col';head.insertBefore(th,head.lastElementChild);}
 const actions=document.createElement('div');actions.className='toolbar sale-toolbar';
 actions.innerHTML='<button type="button" class="secondary" data-sel-visible>选中本页</button><button type="button" class="secondary" data-clear>清除选择</button><span data-count>卖价已选0条</span><button type="button" data-bulk>批量修改卖价</button><span data-message role="status"></span>';
 table.closest('.panel').insertBefore(actions,table.closest('.table-wrap'));
 const message=t=>{actions.querySelector('[data-message]').textContent=t;};
 async function loadRows(){
  if(!currentUser())return;
  const data=[];
  for(let offset=0;offset<10000;offset+=500){
   const chunk=await cloudRequest('freight_'+(kind==='fcl_rail'?'fcl_rail_rates':kind==='trucking'?'trucking_rates':kind==='rental'?'container_rental_rates':kind==='domestic'?'domestic_rates':'rail_plans')+'?select=*&order=created_at.desc,id.asc&limit=500&offset='+offset);
   data.push(...chunk);if(chunk.length<500)break;
  }
  sourceRows=new Map(data.map(r=>[r.id,r]));
 }
 const currency=(row)=>kind==='lcl_plan'?'USD':(row?.quote?.currency||'');
 const fieldsFor=row=>saleFields(kind,row);
 function updateCount(){actions.querySelector('[data-count]').textContent='卖价已选 '+selection.size+' 条';}
 function renderCells(){
  for(const tr of body.querySelectorAll(':scope > tr')){
   const id=tr.dataset.saleRow||tr.querySelector('input[data-select]')?.dataset.select||tr.querySelector('input[data-rail-select]')?.dataset.railSelect;
   if(!id||tr.querySelector('td.sale-col'))continue;
   const row=sourceRows.get(id),value=saved.get(id);
   const td=document.createElement('td');td.className='sale-col';
   if(!row){td.textContent='读取中';tr.insertBefore(td,tr.lastElementChild);continue;}
   const fs=fieldsFor(row),unit=kind==='lcl_plan'?'USD':currency(row);
   td.innerHTML='<div class="sale-cell"><label class="sale-select"><input type="checkbox" data-sale-select="'+esc(id)+'" '+(selection.has(id)?'checked':'')+' aria-label="选择卖价修改"></label><div class="sale-inputs">'+fs.map(([k,label])=>'<label>'+esc(label)+'<input type="number" min="0.01" step="any" data-sale-id="'+esc(id)+'" data-sale-field="'+esc(k)+'" value="'+esc(value?.selling_values?.[k]??'')+'" placeholder="未设置" title="'+esc(label)+'"></label>').join('')+'<small>'+esc(unit||'币种未定')+' · '+(kind==='domestic'?'按原计价规则':'按采购计价单位')+'</small></div></div>';
   tr.insertBefore(td,tr.lastElementChild);
  }
  updateCount();
 }
 const observer=new MutationObserver(()=>renderCells());observer.observe(body,{childList:true});
 function rerender(){for(const td of body.querySelectorAll('td.sale-col'))td.remove();renderCells();}
 async function fetchValues(){
  const all=[];for(let offset=0;offset<10000;offset+=500){const b=await cloudRequest('freight_purchase_selling_prices?select=*&source_kind=eq.'+encodeURIComponent(kind)+'&limit=500&offset='+offset);all.push(...b);if(b.length<500)break;}
  saved=new Map(all.map(r=>[r.source_id,r]));rerender();
 }
 async function persist(id,fields){
  const row=sourceRows.get(id);if(!row)throw Error('采购价格已更新，请刷新重试');
  const cur=currency(row);validSellingFields(kind,fields,cur);
  const existing=saved.get(id)?.selling_values||{};
  const combined={...existing,...fields};for(const k of Object.keys(combined))if(combined[k]===null)delete combined[k];
  const result=await cloudRequest('freight_purchase_selling_prices?on_conflict=source_kind,source_id',{
   method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify({source_kind:kind,source_id:id,currency:cur,selling_values:combined,updated_at:new Date().toISOString()})
  });
  if(!Array.isArray(result)||result.length!==1)throw Error('保存失败，检查权限');
  saved.set(id,result[0]);
 }
 body.addEventListener('change',async e=>{
  const cb=e.target.closest('[data-sale-select]');if(cb){cb.checked?selection.add(cb.dataset.saleSelect):selection.delete(cb.dataset.saleSelect);updateCount();return;}
  const input=e.target.closest('input[data-sale-id]');if(!input||busy)return;
  const raw=input.value.trim(),num=raw?Number(raw):null;
  if(raw&&(!Number.isFinite(num)||num<=0)){message('请输入大于零的卖价，或清空');input.focus();return;}
  busy=true;input.disabled=true;
  try{await persist(input.dataset.saleId,{[input.dataset.saleField]:num});message('卖价已保存，不影响采购价，也不会自动发布官网');}
  catch(err){message('保存失败：'+err.message);input.value=saved.get(input.dataset.saleId)?.selling_values?.[input.dataset.saleField]??'';}
  finally{input.disabled=false;busy=false;}
 });
 actions.querySelector('[data-sel-visible]').onclick=()=>{for(const input of body.querySelectorAll('input[data-sale-select]')){input.checked=true;selection.add(input.dataset.saleSelect);}updateCount();};
 actions.querySelector('[data-clear]').onclick=()=>{selection.clear();for(const input of body.querySelectorAll('input[data-sale-select]'))input.checked=false;updateCount();};
 actions.querySelector('[data-bulk]').onclick=async()=>{
  if(busy)return;
  if(!selection.size)return message('请先勾选卖价列中的记录');
  const ids=[...selection].filter(id=>sourceRows.has(id));
  if(!ids.length)return message('未找到选中采购版本，请刷新');
  if(ids.length>500)return message('单次最多修改500条');
  const field=kind==='domestic'?window.prompt('选择修改字段：cbm（方卖价）/ ton（吨卖价）/ fixed（固定卖价）；提货模板请输入 tier_0、tier_1 等档位','cbm'):kind==='lcl_plan'?'unit':'price';
  if(field===null)return;
  if(!SALE_FIELDS[kind].some(([key])=>key===field)&&!(kind==='domestic'&&/^tier_\d+$/.test(field)))return message('字段不正确');
  const raw=window.prompt('输入统一卖价（按原币种与计价单位；不能用空值批量覆盖）');
  if(raw===null)return;
  const amount=Number(raw);
  if(!raw.trim()||!Number.isFinite(amount)||amount<=0)return message('卖价必须大于零');
  const curr=new Set(ids.map(id=>currency(sourceRows.get(id))));
  if(curr.size!==1||![...curr][0])return message('所选记录币种不一致或未确认，请先按币种筛选');
  if(kind==='domestic'&&ids.some(id=>!fieldsFor(sourceRows.get(id)).some(([k])=>k===field)))return message('所选记录计价规则不同，请分类后批量修改');
  if(kind!=='domestic'&&kind!=='lcl_plan'&&new Set(ids.map(id=>sourceRows.get(id)?.quote?.unit)).size!==1)return message('所选记录计价单位不同，请先筛选');
  if(!confirm('确定批量修改 '+ids.length+' 条卖价？采购价不变，官网不会自动公开。'))return;
  busy=true;let done=0;
  try{for(const id of ids){try{await persist(id,{[field]:amount});done++;}catch(e){message('完成 '+done+' 条，失败记录：'+e.message);break;}}}
  finally{busy=false;selection.clear();rerender();message('已保存 '+done+' / '+ids.length+' 条卖价；采购价未修改');}
 };
 (async()=>{try{await loadRows();renderCells();await fetchValues();}catch(e){message('卖价加载失败：'+e.message);}})();
}
if(typeof document!=='undefined')mountPurchaseSellingPrices();
