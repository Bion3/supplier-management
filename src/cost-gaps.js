import {cloudRequest,listSuppliers} from './cloud.js';
import {latestCosts} from './cost-enable-model.js';
import {costGaps,gapFields,repairCost,missing} from './cost-gaps-model.js';
import {CONTAINER_OPTIONS} from './price-table-controls.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function installCostGaps({kind,table,getRows,getFiltered,reload}){
 const button=document.createElement('button');button.type='button';button.className='secondary';
 const heading=document.querySelector('#workspace .heading');if(!heading)return {refresh(){}};
 heading.append(button);
 const current=()=>latestCosts(getFiltered());
 function refresh(){
  const rows=current(),count=rows.filter(r=>costGaps(r,kind).some(i=>i.level==='block')).length;
  button.textContent=`报价待补全 ${count} 条`;
  for(const r of rows){const action=document.querySelector(`[data-edit="${r.id}"]`),tr=action?.closest('tr');if(!tr)continue;
   tr.querySelector('[data-cost-gap]')?.remove();
   const issues=costGaps(r,kind);if(!issues.length)continue;
   const badge=document.createElement('button');badge.type='button';badge.dataset.costGap='';badge.className='secondary';
   badge.textContent=issues.some(i=>i.level==='block')?'⚠ 影响报价':'有效期提示';badge.title=issues.map(i=>i.label).join('；');badge.onclick=()=>open(r.id);action.parentElement.append(badge);
  }
 }
 async function open(focusId){
  const dialog=document.createElement('dialog');dialog.style.width='min(920px,95vw)';
  dialog.innerHTML=`<form><h2>报价缺失检查与批量补全</h2><p>按当前列表筛选范围检查。有效期仅提示，不阻止成本取价；轻货缺方价、重货缺吨价分别提示。</p><label>缺失项筛选<select data-filter></select></label><button type="button" data-all class="secondary">选择全部筛选结果</button> <button type="button" data-clear class="secondary">清空选择</button><span data-count></span><div data-list style="max-height:280px;overflow:auto"></div><div class="fields"><label>批量修改字段<select name="field"></select></label><label>修改值<span data-value></span></label><label><input type="checkbox" name="onlyMissing" checked>仅补空值</label></div><p>只修改所选字段，保存为待确认的新版本。阶梯明细、自营铁路分摊及单项附加费请在原记录编辑。</p><p data-error role="alert"></p><button type="submit">保存所选修改</button> <button type="button" data-close class="secondary">关闭</button></form>`;
  document.body.append(dialog);dialog.onclose=()=>dialog.remove();dialog.querySelector('[data-close]').onclick=()=>dialog.close();dialog.showModal();
  const form=dialog.querySelector('form'),selected=new Set(focusId?[focusId]:[]),filter=form.querySelector('[data-filter]');let rows=current(),busy=false;
  const defs=[...gapFields.common,...gapFields[kind]],field=form.elements.field;
  field.innerHTML=defs.map(([k,l])=>`<option value="${k}">${l}</option>`).join('');
  const labels=new Map(rows.flatMap(r=>costGaps(r,kind)).map(i=>[i.key,i.label]));
  filter.innerHTML='<option value="block">所有影响报价项</option><option value="all">全部提醒（含有效期）</option>'+[...labels].map(([k,l])=>`<option value="${k}">${esc(l)}</option>`).join('');
  const matches=()=>rows.filter(r=>costGaps(r,kind).some(i=>filter.value==='all'||filter.value==='block'&&i.level==='block'||i.key===filter.value));
  function draw(){const found=matches();form.querySelector('[data-count]').textContent=`已选 ${selected.size} 条 / 筛选 ${found.length} 条`;form.querySelector('[data-list]').innerHTML=found.map(r=>`<label style="display:block;padding:8px;border-bottom:1px solid #ddd"><input type="checkbox" data-id="${r.id}" ${selected.has(r.id)?'checked':''}>${esc(r.origin)} → ${esc(r.destination)}：${costGaps(r,kind).map(i=>esc((i.level==='warning'?'提示：':'')+i.label)).join('；')}</label>`).join('')||'没有匹配的缺失项';}
  form.querySelector('[data-list]').onchange=e=>{if(e.target.dataset.id){e.target.checked?selected.add(e.target.dataset.id):selected.delete(e.target.dataset.id);draw();}};
  filter.onchange=draw;form.querySelector('[data-all]').onclick=()=>{matches().forEach(r=>selected.add(r.id));draw();};form.querySelector('[data-clear]').onclick=()=>{selected.clear();draw();};
  let suppliers=[];try{suppliers=await listSuppliers();}catch(e){form.querySelector('[data-error]').textContent=e.message;}
  function valueField(){const type=defs.find(d=>d[0]===field.value)[2];const choices=type==='supplier'?suppliers.map(s=>[s.id,s.name]):type==='rule'?[['billable','按重抛比分轻重货（干线）'],['cbm','按方价'],['ton','按吨价'],['fixed','固定金额'],['tier','双条件阶梯']]:type==='currency'?['CNY','USD','EUR'].map(v=>[v,v]):type==='container'?CONTAINER_OPTIONS.map(v=>[v,v]):type==='equipment'?[['SOC','SOC'],['COC','COC']]:type==='boolean'?[['yes','已含'],['no','另计']]:null;form.querySelector('[data-value]').innerHTML=choices?`<select name="value"><option value="">请选择</option>${choices.map(([v,l])=>`<option value="${esc(v)}">${esc(l)}</option>`).join('')}</select>`:`<input name="value" ${['number','positive'].includes(type)?'type="number" min="0" step="any"':''} required>`;}
  field.onchange=valueField;valueField();draw();
  form.onsubmit=async e=>{e.preventDefault();if(busy)return;busy=true;const submit=form.querySelector('[type=submit]');submit.disabled=true;let saved=0;try{
   if(!selected.size)throw Error('请先选择记录');if(selected.size>500)throw Error('每次最多修改500条，请缩小筛选范围');
   const key=field.value,value=form.elements.value.value,onlyMissing=form.elements.onlyMissing.checked;
   await reload();const fresh=latestCosts(getRows()).filter(r=>selected.has(r.id));if(fresh.length!==selected.size)throw Error('记录已更新，请关闭后重新选择');
   const targets=fresh.filter(r=>{const q=kind==='rail'?r.inputs?.external?.[r.inputs.selected]:r.quote;const old=key==='supplier_id'?(kind==='rail'?q?.supplierId:r.supplier_id):q?.[key];return !onlyMissing||missing(old)||old==='待确认';});
   if(!targets.length)throw Error('所选字段均非空；如需覆盖请取消“仅补空值”');
   if(['price','cbm','ton','fixed','rate','fees','minimum','delivery'].includes(key)&&new Set(targets.map(r=>kind==='rail'?'USD':r.quote?.currency||'')).size>1)throw Error('金额修改请先按同一币种筛选');
   if(key==='price'&&new Set(targets.map(r=>r.quote?.unit||'')).size>1)throw Error('单价修改请先按相同计价单位筛选');
   const payload=targets.map(r=>repairCost(r,kind,key,value));
   if(!window.confirm(`将保存 ${payload.length} 条待确认新版本，是否继续？`))return;
   for(let i=0;i<payload.length;i+=50){const chunk=payload.slice(i,i+50),result=await cloudRequest(table,{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify(chunk)});saved+=result.length;if(result.length!==chunk.length)throw Error('保存数量异常，请刷新核对');}
   await reload();dialog.close();document.getElementById('notice').textContent=`已补全 ${saved} 条，新版本待确认；请核对后批量启用。`;
  }catch(error){form.querySelector('[data-error]').textContent=(saved?`已保存 ${saved} 条。`:'')+error.message;if(saved){selected.clear();await reload();rows=current();draw();}}finally{busy=false;submit.disabled=false;refresh();}};
 }
 button.onclick=()=>open();return {refresh};
}
