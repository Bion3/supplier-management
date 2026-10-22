// Supplier sheets retain their original units and conditions until billing is verified.
export function fixedFeeColumns(row){
 const bands=row.inputs.ticketFeeBands;
 if(bands)return [bands.upToHalf,bands.halfToThree,bands.overThree];
 const fee=row.inputs.railUnitCost?.fees;
 return [fee??null,fee??null,fee??null];
}
export function updateImportedQuote(row,rate,changes={}){
 if(!row.inputs.importSource)throw Error('不是供应商原表报价');
 if(rate===''||rate===null||!Number.isFinite(Number(rate))||Number(rate)<0)throw Error('请填写非负运费单价');
 const inputs=structuredClone(row.inputs);
 inputs.external[inputs.selected].rate=Number(rate);
 inputs.railUnitCost={...inputs.railUnitCost,unit:Number(rate),complete:false};
 const amount=(v,label,optional=false)=>{if(v===null||v===''||v===undefined){if(optional)return null;throw Error('请填写'+label);}const n=Number(v);if(!Number.isFinite(n)||n<0)throw Error(label+'须为非负数');return n;};
 if(changes.bands){inputs.ticketFeeBands={currency:'USD',unit:'票'};for(const key of ['upToHalf','halfToThree','overThree'])inputs.ticketFeeBands[key]=amount(changes.bands[key],'阶梯固定费',true);}
 if('minimum' in changes){const n=amount(changes.minimum,'最低收费',true);inputs.external[inputs.selected].minimum=n;inputs.railUnitCost.minimum=n;}
 if(changes.chargeItems)inputs.chargeItems=changes.chargeItems.map(item=>{if(!item.name?.trim())throw Error('请填写费用名称');if(!['USD','CNY'].includes(item.currency))throw Error('费用币种无效');return {name:item.name.trim(),amount:amount(item.amount,item.name,true),currency:item.currency,unit:'票'};});
 if(changes.profitPreset){const p=changes.profitPreset;if(!['markup','margin','fixed'].includes(p.mode))throw Error('利润方式无效');const value=amount(p.value,'利润');if(p.mode==='margin'&&value>=100)throw Error('毛利率须小于100%');inputs.profitPreset={mode:p.mode,value};}
 return {origin:row.origin,destination:row.destination,status:'draft',inputs,valid_from:row.valid_from,valid_until:row.valid_until,supersedes_id:row.id};
}
export function quoteDisplay(row){
 const q=row.inputs.railUnitCost;
 return {unit:q?.billingUnit||'计费方',ratio:Number.isFinite(q?.ratio)&&q.ratio>0?'1 : '+q.ratio+'kg':'待确认',status:row.status==='inactive'?'停用':row.status==='draft'?'待确认':'启用'};
}
export function installSupplierQuoteDialog({save,reload,notice}){
 const dialog=document.createElement('dialog');dialog.className='detail-dialog supplier-quote-dialog';document.body.append(dialog);let current;
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 return row=>{
  current=row;const s=row.inputs.importSource,q=row.inputs.railUnitCost;
  dialog.innerHTML=`<form><div class="dialog-heading"><h2>供应商原表报价</h2><button type="button" data-close class="secondary">关闭</button></div><p>${esc(row.origin)} → ${esc(row.destination)} · ${esc(row.inputs.external[row.inputs.selected].supplierName)}</p><label>铁路运费 USD / ${esc(q.billingUnit)}<input name="rate" type="number" min="0" step="any" required value="${esc(q.unit)}"></label><p>状态：待确认。保存费用会保留原表和历史版本；计费规则核对完成前不进入自动成本核算。</p><p>适用月份：${esc(s.quotationPeriod)}（${esc(s.periodBasis)}）</p><details open><summary>原表费用和适用规则（追溯参考）</summary><p style="white-space:pre-wrap">${esc(s.ticketFeeText)}\n${esc(s.conditions)}</p></details><details><summary>原表来源</summary><p>${esc(s.filename)} · ${esc(s.sheet)} · ${esc(s.cell)}</p><p>原始站点：${esc(s.rawDestination)}；方向：${esc(s.direction)}</p><p style="white-space:pre-wrap">${esc(q.pending.join('\n'))}</p></details><p role="alert" data-error></p><footer><button type="submit" ${row.status==='inactive'?'disabled':''}>保存单价修改</button></footer></form>`;
  const field=(name,label,value)=>`<label>${label}<input name="${name}" type="number" min="0" step="any" value="${esc(value)}"></label>`;
  const fees=row.inputs.ticketFeeBands||{},profit=row.inputs.profitPreset||{mode:'markup',value:0};
  const extra=document.createElement('section');extra.className='quote-fee-editor';
  extra.innerHTML=`<h3>单项采购费用</h3><p>USD/票；留空表示待确认，0表示确认不收。阶梯费用按原表范围单独维护。</p><div class="fields">${field('upToHalf','固定费 ≤0.5方',fees.upToHalf)}${field('halfToThree','固定费 >0.5至3方',fees.halfToThree)}${field('overThree','固定费 >3方',fees.overThree)}${field('minimum','最低运费 USD/票',q.minimum)}</div><h3>其他费用（每票）</h3><div data-charges></div><button type="button" class="secondary" data-add-charge>添加费用</button><details><summary>报价利润预设（预留）</summary><p>仅保存报价预设，待报价功能接入时使用；采购成本按供应商费用保存。</p><div class="fields"><label>利润方式<select name="profitMode"><option value="markup">成本加成 %</option><option value="margin">销售毛利率 %</option><option value="fixed">固定利润 USD/票</option></select></label>${field('profitValue','利润数值',profit.value)}</div></details>`;
  dialog.querySelector('form > details').before(extra);
  extra.querySelector('[name=profitMode]').value=profit.mode;
  const addCharge=(item={name:'',amount:null,currency:'USD'})=>{const div=document.createElement('div');div.className='quote-charge fields';div.innerHTML=`<label>费用名称<input data-name value="${esc(item.name)}" required></label><label>金额/票<input data-amount type="number" min="0" step="any" value="${esc(item.amount)}" placeholder="待确认"></label><label>币种<select data-currency><option>USD</option><option>CNY</option></select></label><button type="button" class="secondary" data-remove-charge>移除</button>`;div.querySelector('[data-currency]').value=item.currency;div.querySelector('[data-remove-charge]').onclick=()=>div.remove();extra.querySelector('[data-charges]').append(div);};
  const charges=row.inputs.chargeItems??(/报关[\s\S]*150\s*元/.test(s.conditions||'')?[{name:'报关费（含1页）',amount:150,currency:'CNY'}]:[]);charges.forEach(addCharge);extra.querySelector('[data-add-charge]').onclick=()=>addCharge();
  dialog.querySelector('button[type=submit]').textContent='保存费用新版本';
  dialog.querySelector('[data-close]').onclick=()=>dialog.close();
  dialog.querySelector('form').onsubmit=async e=>{e.preventDefault();const button=dialog.querySelector('[type=submit]');if(button.disabled)return;button.disabled=true;try{const data=new FormData(e.target),chargeItems=[...extra.querySelectorAll('.quote-charge')].map(el=>({name:el.querySelector('[data-name]').value,amount:el.querySelector('[data-amount]').value,currency:el.querySelector('[data-currency]').value}));const payload=updateImportedQuote(current,data.get('rate'),{bands:Object.fromEntries(['upToHalf','halfToThree','overThree'].map(key=>[key,data.get(key)])),minimum:data.get('minimum'),chargeItems,profitPreset:{mode:data.get('profitMode'),value:data.get('profitValue')}});await save(payload);await reload();dialog.close();notice('已保存单项采购费用和利润预设，原表及历史版本保留。');}catch(error){dialog.querySelector('[data-error]').textContent=error.message;}finally{button.disabled=false;}};
  dialog.showModal();
 };
}
