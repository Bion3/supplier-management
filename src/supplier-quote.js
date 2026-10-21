// Supplier sheets retain their original units and conditions until billing is verified.
export function fixedFeeColumns(row){
 const bands=row.inputs.ticketFeeBands;
 if(bands)return [bands.upToHalf,bands.halfToThree,bands.overThree];
 const fee=row.inputs.railUnitCost?.fees;
 return [fee??null,fee??null,fee??null];
}
export function updateImportedQuote(row,rate){
 if(!row.inputs.importSource)throw Error('不是供应商原表报价');
 if(rate===''||rate===null||!Number.isFinite(Number(rate))||Number(rate)<0)throw Error('请填写非负运费单价');
 const inputs=structuredClone(row.inputs);
 inputs.external[inputs.selected].rate=Number(rate);
 inputs.railUnitCost={...inputs.railUnitCost,unit:Number(rate),complete:false};
 return {origin:row.origin,destination:row.destination,status:'draft',inputs,valid_from:row.valid_from,valid_until:row.valid_until,supersedes_id:row.id};
}
export function quoteDisplay(row){
 const q=row.inputs.railUnitCost;
 return {unit:q?.billingUnit||'计费方',ratio:Number.isFinite(q?.ratio)&&q.ratio>0?'1 : '+q.ratio+'kg':'待确认',status:row.status==='inactive'?'停用':row.status==='draft'?'待确认':'启用'};
}
export function installSupplierQuoteDialog({save,reload,notice}){
 const dialog=document.createElement('dialog');dialog.className='detail-dialog';document.body.append(dialog);let current;
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 return row=>{
  current=row;const s=row.inputs.importSource,q=row.inputs.railUnitCost;
  dialog.innerHTML=`<form><div class="dialog-heading"><h2>供应商原表报价</h2><button type="button" data-close class="secondary">关闭</button></div><p>${esc(row.origin)} → ${esc(row.destination)} · ${esc(row.inputs.external[row.inputs.selected].supplierName)}</p><label>铁路运费 USD / ${esc(q.billingUnit)}<input name="rate" type="number" min="0" step="any" required value="${esc(q.unit)}"></label><p>状态：待确认。保存改单价会保留原表和历史版本；计费规则核对完成前不进入自动成本核算。</p><p>适用月份：${esc(s.quotationPeriod)}（${esc(s.periodBasis)}）</p><details open><summary>费用和适用规则</summary><p style="white-space:pre-wrap">${esc(s.ticketFeeText)}\n${esc(s.conditions)}</p></details><details><summary>原表来源</summary><p>${esc(s.filename)} · ${esc(s.sheet)} · ${esc(s.cell)}</p><p>原始站点：${esc(s.rawDestination)}；方向：${esc(s.direction)}</p><p style="white-space:pre-wrap">${esc(q.pending.join('\n'))}</p></details><p role="alert" data-error></p><footer><button type="submit" ${row.status==='inactive'?'disabled':''}>保存单价修改</button></footer></form>`;
  dialog.querySelector('[data-close]').onclick=()=>dialog.close();
  dialog.querySelector('form').onsubmit=async e=>{e.preventDefault();const button=dialog.querySelector('[type=submit]');if(button.disabled)return;button.disabled=true;try{const payload=updateImportedQuote(current,new FormData(e.target).get('rate'));await save(payload);await reload();dialog.close();notice('已保存供应商报价新版本，计费规则仍待确认。');}catch(error){dialog.querySelector('[data-error]').textContent=error.message;}finally{button.disabled=false;}};
  dialog.showModal();
 };
}
