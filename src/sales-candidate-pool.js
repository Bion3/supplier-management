import {cloudRequest,currentUser} from './cloud.js';
const $=id=>document.getElementById(id);
const clean=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const types={fcl_rail:['整柜 · 铁路运费','/fcl-rail.html'],domestic:['拼箱 · 干线','/rates.html'],trucking:['整柜 · 拖车费','/trucking.html'],rental:['整柜 · 租箱费','/container-rental.html'],lcl_plan:['拼箱 · 铁路运费','/rail-rates.html']};
export function priceCategory(row){
 if(row.source_kind==='domestic')return row.source_quote?.kind==='linehaul'?'lcl_linehaul':'other';
 return {fcl_rail:'fcl_rail',trucking:'fcl_truck',rental:'fcl_rent',lcl_plan:'lcl_rail'}[row.source_kind]||'other';
}
export const groupOf=category=>category.startsWith('lcl_')?'lcl':category.startsWith('fcl_')?'fcl':'other';
const categoryNames={lcl_linehaul:'拼箱 · 干线',lcl_rail:'拼箱 · 铁路运费',fcl_truck:'整柜 · 拖车费',fcl_rail:'整柜 · 铁路运费',fcl_rent:'整柜 · 租箱费',other:'其他待归类'};
let rows=[],filtered=[],page=1,activeGroup='lcl',busy=false;const selected=new Set(),size=40;
const key=r=>r.source_kind+'|'+r.source_id;
const chosen=()=>rows.filter(r=>selected.has(key(r)));
const pageRows=()=>filtered.slice((page-1)*size,page*size);
const usd=x=>'USD '+Number(x).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
function statusNotice(message){$('pool-bulk-notice').textContent=message;}
function refreshSelected(){
 $('pool-selected').textContent='已选 '+chosen().length+' 条';
 $('pool-all').checked=pageRows().length>0&&pageRows().every(r=>selected.has(key(r)));
}
function render(){
 const start=(page-1)*size;const visible=filtered.slice(start,start+size);
 $('pool-summary').textContent='当前分类 '+filtered.length+' 条 · 全库 '+rows.length+' 条；所有价格均为内部核价参考，尚未直接对外发布。';
 $('pool-rows').innerHTML=visible.map(row=>{
  const q=row.source_quote||{},type=types[row.source_kind]||['其他','/pricing.html'],category=priceCategory(row);
  const currency=row.purchase_currency||q.currency||'';
  const cost=row.purchase_amount===null?'待核算':currency+' '+Number(row.purchase_amount).toLocaleString('en-US',{maximumFractionDigits:2});
  const effectiveCost=row.purchase_price_override===null?cost:currency+' '+Number(row.purchase_price_override).toLocaleString('en-US',{maximumFractionDigits:2})+'（测算调整）';
  const basis=row.purchase_price_override??row.purchase_amount;
  const indicative=row.selling_price_override!==null?usd(row.selling_price_override):basis!==null&&currency==='USD'&&Number(basis)>0?usd(Number(basis)*(1+Number(row.markup_percent??15)/100)):'待核算';
  const unit=q.container||q.box||'';const date=(row.valid_from||'未填写')+' — '+(row.valid_until||'未填写');
  const status=row.source_status==='confirmed'?'已确认':'待核实';
  return '<tr><td><input type="checkbox" data-pool-select="'+clean(key(row))+'" '+(selected.has(key(row))?'checked':'')+' aria-label="选择价格"></td><td>'+clean(categoryNames[category]||type[0])+'</td><td>'+clean(row.origin)+' → '+clean(row.destination)+'</td><td>'+clean(effectiveCost)+'</td><td>'+clean(indicative)+'</td><td>'+clean([unit,q.equipment,q.unit].filter(Boolean).join(' / '))+'</td><td>'+clean(status)+' / '+(row.review_status==='reviewed'?'销售已核实':'销售待核实')+'</td><td>'+clean(row.override_valid_until||row.valid_until||'未填写')+'</td><td><a href="'+type[1]+'">查看来源</a></td></tr>';
 }).join('')||'<tr><td colspan="9">暂无匹配数据，请调整筛选。</td></tr>';
 $('pool-page').textContent=page+' / '+Math.max(1,Math.ceil(filtered.length/size));
 $('pool-prev').disabled=page<=1;$('pool-next').disabled=page*size>=filtered.length;refreshSelected();
}
function filter(){
 const kind=$('pool-kind').value,state=$('pool-state').value,query=$('pool-search').value.trim().toLowerCase();
 filtered=rows.filter(row=>groupOf(priceCategory(row))===activeGroup&&(!kind||priceCategory(row)===kind)&&(!state||row.source_status===state)&&(!query||(row.origin+' '+row.destination).toLowerCase().includes(query)));
 page=1;render();
}
async function load(){
 if(!currentUser())return;
 $('pool-summary').textContent='正在读取全部已同步采购价格…';
 const all=[];
 for(let offset=0;offset<20000;offset+=500){
  const batch=await cloudRequest('freight_sales_price_candidates?select=source_kind,source_id,origin,destination,source_status,source_quote,purchase_amount,purchase_currency,valid_from,valid_until,review_status,review_note,markup_percent,selling_price_override,purchase_price_override,override_valid_until&order=created_at.desc,source_id.asc&limit=500&offset='+offset);
  all.push(...batch);if(batch.length<500)break;
 }
 rows=all;selected.clear();filter();
}
for(const tab of document.querySelectorAll('[data-pool-group]'))tab.addEventListener('click',()=>{
 activeGroup=tab.dataset.poolGroup;
 document.querySelectorAll('[data-pool-group]').forEach(button=>button.setAttribute('aria-pressed',String(button===tab)));
 for(const option of $('pool-kind').options){
  option.hidden=Boolean(option.value&&groupOf(option.value)!==activeGroup);
 }
 $('pool-kind').value='';filter();
});
for(const id of ['pool-kind','pool-state'])$(id).addEventListener('change',filter);
$('pool-search').addEventListener('input',filter);
$('pool-prev').onclick=()=>{page=Math.max(1,page-1);render();};
$('pool-next').onclick=()=>{page++;render();};
$('pool-refresh').onclick=()=>load().catch(e=>{$('pool-summary').textContent='同步池读取失败：'+e.message;});
for(const option of $('pool-kind').options)option.hidden=Boolean(option.value&&groupOf(option.value)!==activeGroup);

$('pool-rows').addEventListener('change',e=>{
 const id=e.target.dataset.poolSelect;if(!id)return;
 if(e.target.checked)selected.add(id);else selected.delete(id);
 refreshSelected();
});
$('pool-all').addEventListener('change',e=>{
 for(const r of pageRows())if(e.target.checked)selected.add(key(r));else selected.delete(key(r));
 render();
});
$('pool-select-filtered').onclick=()=>{
 for(const r of filtered)selected.add(key(r));render();
 statusNotice('已选中当前筛选的 '+filtered.length+' 条价格。');
};
$('pool-clear').onclick=()=>{selected.clear();render();statusNotice('已清空选择');};
$('pool-edit').onclick=()=>{$('pool-edit-panel').hidden=!$('pool-edit-panel').hidden;};
$('pool-edit-close').onclick=()=>{$('pool-edit-panel').hidden=true;};
$('pool-edit-mode').onchange=()=>{
 const date=$('pool-edit-mode').value==='expiry';
 $('pool-edit-date-label').hidden=!date;
 $('pool-edit-number-label').hidden=date;
};
async function batchPatch(changes,label){
 if(busy)return;const target=chosen();
 if(!target.length)return statusNotice('请先勾选价格。');
 if(target.length>1100)return statusNotice('单次修改条数超过安全上限。');
 if(!confirm('确认对 '+target.length+' 条价格执行「'+label+'」？此操作不会直接发布到官网。'))return;
 busy=true;$('pool-edit-apply').disabled=true;$('pool-review').disabled=true;
 let done=0;let failed=0;
 try{
  for(const r of target){
   try{
    const patch=typeof changes==='function'?changes(r):changes;
    const result=await cloudRequest('freight_sales_price_candidates?source_kind=eq.'+encodeURIComponent(r.source_kind)+'&source_id=eq.'+encodeURIComponent(r.source_id),{
      method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({...patch,updated_at:new Date().toISOString()})
    });
    if(!Array.isArray(result)||result.length!==1)throw Error('写入未成功');
    Object.assign(r,result[0]);done++;
   }catch(error){failed++;if(failed===1)statusNotice('部分记录失败：'+error.message);}
  }
  statusNotice(label+'：成功 '+done+' 条'+(failed?'，失败 '+failed+' 条。请核实权限或字段':'。')+'；未自动对外发布。');
  if(done&&!failed)$('pool-edit-panel').hidden=true;
  render();
 }finally{busy=false;$('pool-edit-apply').disabled=false;$('pool-review').disabled=false;}
}
$('pool-review').onclick=()=>{
 const target=chosen();if(!target.length)return statusNotice('请先选择需要核实的记录。');
 if(target.some(r=>r.source_status!=='confirmed'))return statusNotice('选中记录包含采购待核实项，请先确认原始采购价，再批量核实销售价。');
 batchPatch({review_status:'reviewed',reviewed_at:new Date().toISOString()},'销售价格批量核实');
};
$('pool-edit-apply').onclick=()=>{
 const mode=$('pool-edit-mode').value;
 if(mode==='expiry'){
  const value=$('pool-edit-date').value;
  if(!/^\\d{4}-\\d{2}-\\d{2}$/.test(value))return statusNotice('请选择有效日期。');
  if(chosen().some(r=>r.valid_from&&value<r.valid_from))return statusNotice('截止日期不能早于原报价开始日期。');
  return batchPatch({override_valid_until:value,review_status:'needs_review'},'销售有效期修改');
 }
 const raw=$('pool-edit-number').value.trim(),n=Number(raw);
 if(raw===''||!Number.isFinite(n)||n<0)return statusNotice('请输入有效的非负数。');
 if(mode==='markup'){
  if(n>300)return statusNotice('加成率不得超过300%。');
  return batchPatch({markup_percent:n,selling_price_override:null,review_status:'needs_review'},'销售加成率修改');
 }
 if(n===0)return statusNotice('单价或成本必须大于零。');
 if(mode==='price'&&chosen().some(r=>r.purchase_currency!=='USD'))return statusNotice('选中记录含非美元价格；请按币种单独筛选或先核实换汇后定价。');
 return batchPatch(mode==='price'?{selling_price_override:n,review_status:'needs_review'}:{purchase_price_override:n,selling_price_override:null,review_status:'needs_review'},mode==='price'?'销售单价修改':'销售测算成本调整');
};

if(currentUser())load().catch(e=>{$('pool-summary').textContent='同步池读取失败：'+e.message;});
