import {cloudRequest,listSuppliers} from './cloud.js';
import {latestCosts} from './cost-enable-model.js';
import {costGaps,costReadiness,gapFields,repairCost,missing} from './cost-gaps-model.js';
import {CONTAINER_OPTIONS} from './price-table-controls.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function installCostGaps({kind,table,getRows,getFiltered,reload}){
 const button=document.createElement('button');button.type='button';button.className='secondary';
 const heading=document.querySelector('#workspace .heading');if(!heading)return {refresh(){}};
 const priceButton=document.createElement('button'),reviewButton=document.createElement('button');
 for(const b of [priceButton,reviewButton]){b.type='button';b.className='secondary';}
 heading.append(priceButton,reviewButton,button);
 priceButton.onclick=()=>open(null,'price');reviewButton.onclick=()=>open(null,'review');
 const current=()=>{const latest=new Set(latestCosts(getRows()).map(r=>r.id));return getFiltered().filter(r=>latest.has(r.id));};
 function refresh(){
  const rows=current(),states=rows.map(r=>costReadiness(r,kind));
  priceButton.textContent=`缺价格 ${states.filter(s=>s.state==='price').length}`;
  reviewButton.textContent=`待确认 ${states.filter(s=>s.state==='review').length}`;
  button.textContent='批量修改';
  for(const r of rows){const action=document.querySelector(`[data-edit="${r.id}"]`)||(kind==='rail'?document.querySelector(`[data-history="${getRows().indexOf(r)}"]`):null),tr=action?.closest('tr');if(!tr)continue;
   tr.querySelector('[data-cost-gap]')?.remove();
   const {state,label,issues}=costReadiness(r,kind);if(state==='inactive')continue;
   const badge=document.createElement('button');badge.type='button';badge.dataset.costGap='';badge.className='secondary';
   badge.textContent=label;badge.title=issues.length?issues.map(i=>i.label).join('；'):(r.status==='confirmed'?'已启用，可参与内部测算':'资料齐全，可批量启用');badge.onclick=()=>open(r.id,state);action.parentElement.append(badge);
  }
 }
 async function open(focusId,initial='all'){
  const dialog=document.createElement('dialog');dialog.style.cssText='width:min(1050px,95vw);max-height:90vh;overflow:auto';
  dialog.innerHTML=`<style>
.cost-group-layout{display:grid;grid-template-columns:210px minmax(0,1fr);gap:24px}.cost-group-nav button{display:flex;justify-content:space-between;width:100%;text-align:left;margin:0 0 6px;padding:10px;background:#f3f6f7;color:#23424b;border:0}.cost-group-nav button[aria-pressed=true]{background:#dff4ef;color:#087c70}.cost-group-table{width:100%;font-size:13px;border-collapse:collapse}.cost-group-table td,.cost-group-table th{padding:10px;text-align:left;border-bottom:1px solid #e4ebed;position:static!important}.cost-group-table input[type=checkbox],.cost-group-check input{width:16px!important;height:16px;display:inline-block;margin:0 8px 0 0}.cost-group-table small{display:block;color:#70838a}.cost-group-footer{display:flex;align-items:center;justify-content:space-between;margin-top:16px;border-top:1px solid #e4ebed;padding-top:16px}.cost-group-editor{display:flex;gap:16px;align-items:end;margin-top:16px}.cost-group-editor label{flex:1}.cost-group-table-wrap{max-height:300px;overflow:auto}@media(max-width:700px){.cost-group-layout{grid-template-columns:1fr}.cost-group-nav{max-height:140px;overflow:auto}}
</style><form><div style="display:flex;justify-content:space-between;align-items:center"><h2>按问题批量处理</h2><button type="button" data-close class="secondary">关闭</button></div><p>先选同类问题，参考原运价后统一补全。</p><div class="cost-group-layout"><aside><div data-groups class="cost-group-nav"></div><select data-filter hidden></select><small>同一记录可出现在多个问题组</small></aside><section><h3 data-title></h3><div><button type="button" data-all class="secondary">全选本组</button> <button type="button" data-clear class="secondary">清空选择</button> <span data-count></span></div><div data-list class="cost-group-table-wrap"></div><div class="cost-group-editor"><label data-field-label>修改字段<select name="field"></select></label><label>统一补为<span data-value></span></label></div><label class="cost-group-check"><input type="checkbox" name="onlyMissing" checked>仅补空值</label><small data-help></small></section></div><p data-error role="alert"></p><footer class="cost-group-footer"><small>保存为待确认新版本，保留历史。</small><button type="submit">保存本组</button></footer></form>`;
  document.body.append(dialog);dialog.onclose=()=>dialog.remove();dialog.querySelector('[data-close]').onclick=()=>dialog.close();dialog.showModal();
  const form=dialog.querySelector('form'),selected=new Set(focusId?[focusId]:[]),filter=form.querySelector('[data-filter]');let rows=current(),busy=false;
  const defs=[...gapFields.common,...gapFields[kind]],field=form.elements.field;
  field.innerHTML=defs.map(([k,l])=>`<option value="${k}">${l}</option>`).join('');
  const groups=new Map();
  for(const r of rows)for(const issue of costGaps(r,kind).filter(i=>i.level==='block')){const id=issue.key==='railFees'||issue.key==='validation'?issue.key+':'+issue.label:issue.key; if(!groups.has(id))groups.set(id,{key:issue.key==='railFees'?({'最低运费':'minimum','外配另计杂费':'fees','铁路单价':'rate'}[issue.label]||issue.key):issue.key,label:issue.label,ids:new Set()});groups.get(id).ids.add(r.id);}
  groups.set('custom',{key:null,label:'其他批量修改',ids:new Set(rows.filter(r=>r.status!=='inactive').map(r=>r.id))});
  filter.innerHTML=[...groups].map(([id,g])=>`<option value="${esc(id)}">${esc(g.label)}</option>`).join('');
  filter.value=[...groups].find(([id,g])=>id!=='custom'&&(!focusId||g.ids.has(focusId)))?.[0]||'custom';
  const matches=()=>rows.filter(r=>groups.get(filter.value)?.ids.has(r.id));
  function reference(r){const q=r.quote||{},a=r.inputs?.external?.[r.inputs?.selected];const money=v=>missing(v)?'待确认':Number(v).toLocaleString();if(kind==='rail')return `${r.inputs?.mode==='external'?money(a?.rate):money(r.inputs?.railUnitCost?.unit)} USD / 计费方`;if(kind==='domestic')return `${q.currency||'币种待确认'} · 方价 ${money(q.cbm)} / 吨价 ${money(q.ton)}`;return `${q.currency||'币种待确认'} ${money(q.price)} / ${q.unit||'单位待确认'}`;}
  function draw(){const found=matches(),g=groups.get(filter.value);form.querySelector('[data-title]').textContent=`${g.label} · ${found.length} 条`;form.querySelector('[data-count]').textContent=`已选 ${selected.size} 条`;form.querySelector('[data-groups]').innerHTML=[...groups].map(([id,g])=>`<button type="button" data-group="${esc(id)}" aria-pressed="${id===filter.value}"><span>${esc(g.label)}</span><span>${g.ids.size}</span></button>`).join('');form.querySelector('[data-list]').innerHTML=found.length?`<table class="cost-group-table"><thead><tr><th></th><th>线路 / 供应商</th><th>采购运价</th><th>箱型 / 用箱</th><th>参考</th></tr></thead><tbody>${found.map(r=>{const q=r.quote||{},a=r.inputs?.external?.[r.inputs?.selected],supplier=suppliers.find(s=>s.id===r.supplier_id)?.name||a?.supplierName||q.supplierLabel||'供应商待确认';const source=q.source||r.inputs?.importSource;return `<tr><td><input aria-label="选择${esc(r.origin)}到${esc(r.destination)}" type="checkbox" data-id="${r.id}" ${selected.has(r.id)?'checked':''}></td><td>${esc(r.origin)} → ${esc(r.destination)}<small>${esc(supplier)}</small></td><td><strong>${esc(reference(r))}</strong></td><td>${esc(q.container||r.inputs?.box||'—')}<small>${esc(q.equipment||'')}</small></td><td><details><summary>原报价</summary><small>${esc(typeof source==='string'?source:source?.filename||q.source||'无来源文件')}</small><small>${esc(q.notes||a?.included||'无补充说明')}</small></details></td></tr>`;}).join('')}</tbody></table>`:'本组没有待处理记录';}
  form.querySelector('[data-list]').onchange=e=>{if(e.target.dataset.id){e.target.checked?selected.add(e.target.dataset.id):selected.delete(e.target.dataset.id);draw();}};
  function selectGroup(){selected.clear();const g=groups.get(filter.value),def=defs.find(d=>d[0]===g.key);field.disabled=filter.value!=='custom';form.querySelector('[data-field-label]').hidden=filter.value!=='custom';field.value=def?.[0]||defs[0][0];form.querySelector('[data-help]').textContent=def||filter.value==='custom'?'仅修改选中记录的对应字段。':'此问题包含复杂费用或校验条件，请返回原记录编辑。';form.querySelector('[type=submit]').disabled=!def&&filter.value!=='custom';form.querySelector('[data-value]').parentElement.hidden=!def&&filter.value!=='custom';form.elements.onlyMissing.checked=filter.value==='custom';valueField();draw();}
  form.querySelector('[data-groups]').onclick=e=>{const b=e.target.closest('[data-group]');if(b){filter.value=b.dataset.group;selectGroup();}};
  filter.onchange=selectGroup;form.querySelector('[data-all]').onclick=()=>{matches().forEach(r=>selected.add(r.id));draw();};form.querySelector('[data-clear]').onclick=()=>{selected.clear();draw();};
  let suppliers=[];try{suppliers=await listSuppliers();}catch(e){form.querySelector('[data-error]').textContent=e.message;}
  function valueField(){const type=defs.find(d=>d[0]===field.value)[2];const choices=type==='supplier'?suppliers.map(s=>[s.id,s.name]):type==='rule'?[['billable','按重抛比分轻重货（干线）'],['cbm','按方价'],['ton','按吨价'],['fixed','固定金额'],['tier','双条件阶梯']]:type==='currency'?['CNY','USD','EUR'].map(v=>[v,v]):type==='container'?CONTAINER_OPTIONS.map(v=>[v,v]):type==='equipment'?[['SOC','SOC'],['COC','COC']]:type==='boolean'?[['yes','已含'],['no','另计']]:null;form.querySelector('[data-value]').innerHTML=choices?`<select name="value"><option value="">请选择</option>${choices.map(([v,l])=>`<option value="${esc(v)}">${esc(l)}</option>`).join('')}</select>`:`<input name="value" ${['number','positive'].includes(type)?'type="number" min="0" step="any"':''} required>`;}
  field.onchange=valueField;selectGroup();if(focusId&&matches().some(r=>r.id===focusId)){selected.add(focusId);draw();}
  form.onsubmit=async e=>{e.preventDefault();if(busy)return;busy=true;const submit=form.querySelector('[type=submit]');submit.disabled=true;let saved=0;try{
   if(!selected.size)throw Error('请先选择记录');if(selected.size>500)throw Error('每次最多修改500条，请缩小筛选范围');
   const key=field.value,value=form.elements.value.value,onlyMissing=form.elements.onlyMissing.checked;
   const group=groups.get(filter.value);if(filter.value!=='custom'&&group.key!==key)throw Error('请在原记录编辑此问题');if([...selected].some(id=>!group.ids.has(id)))throw Error('只能修改当前组记录');
   await reload();const fresh=latestCosts(getRows()).filter(r=>selected.has(r.id));if(fresh.length!==selected.size)throw Error('记录已更新，请关闭后重新选择');
   const targets=fresh.filter(r=>{const q=kind==='rail'?r.inputs?.external?.[r.inputs.selected]:r.quote;const old=key==='supplier_id'?(kind==='rail'?q?.supplierId:r.supplier_id):q?.[key];return !onlyMissing||missing(old)||old==='待确认';});
   if(!targets.length)throw Error('所选字段均非空；如需覆盖请取消“仅补空值”');
   if(['price','cbm','ton','fixed','rate','fees','minimum','delivery'].includes(key)&&new Set(targets.map(r=>kind==='rail'?'USD':r.quote?.currency||'')).size>1)throw Error('金额修改请先按同一币种筛选');
   if(key==='price'&&new Set(targets.map(r=>r.quote?.unit||'')).size>1)throw Error('单价修改请先按相同计价单位筛选');
   const payload=targets.map(r=>repairCost(r,kind,key,value));
   if(!window.confirm(`将修改「${group.label}」中 ${payload.length} 条记录，保存为待确认新版本，是否继续？`))return;
   for(let i=0;i<payload.length;i+=50){const chunk=payload.slice(i,i+50),result=await cloudRequest(table,{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify(chunk)});saved+=result.length;if(result.length!==chunk.length)throw Error('保存数量异常，请刷新核对');}
   await reload();dialog.close();document.getElementById('notice').textContent=`已补全 ${saved} 条，新版本待确认；请核对后批量启用。`;
  }catch(error){form.querySelector('[data-error]').textContent=(saved?`已保存 ${saved} 条。`:'')+error.message;if(saved){selected.clear();await reload();rows=current();draw();}}finally{busy=false;submit.disabled=false;refresh();}};
 }
 button.onclick=()=>open();return {refresh};
}


