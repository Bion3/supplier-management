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
let rows=[],filtered=[],page=1,activeGroup='lcl';const size=40;
function render(){
 const start=(page-1)*size;const visible=filtered.slice(start,start+size);
 $('pool-summary').textContent='当前分类 '+filtered.length+' 条 · 全库 '+rows.length+' 条；所有价格均为内部核价参考，尚未直接对外发布。';
 $('pool-rows').innerHTML=visible.map(row=>{
  const q=row.source_quote||{},type=types[row.source_kind]||['其他','/pricing.html'],category=priceCategory(row);
  const currency=row.purchase_currency||q.currency||'';
  const cost=row.purchase_amount===null?'待核算':currency+' '+Number(row.purchase_amount).toLocaleString('en-US',{maximumFractionDigits:2});
  const indicative=row.purchase_amount!==null&&currency==='USD'&&Number(row.purchase_amount)>0?'USD '+(Number(row.purchase_amount)*1.15).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}):'待核算';
  const unit=q.container||q.box||'';const date=(row.valid_from||'未填写')+' — '+(row.valid_until||'未填写');
  const status=row.source_status==='confirmed'?'已确认':'待核实';
  return '<tr><td>'+clean(categoryNames[category]||type[0])+'</td><td>'+clean(row.origin)+' → '+clean(row.destination)+'</td><td>'+clean(cost)+'</td><td>'+clean(indicative)+'</td><td>'+clean([unit,q.equipment,q.unit].filter(Boolean).join(' / '))+'</td><td>'+clean(status)+'</td><td>'+clean(date)+'</td><td><a href="'+type[1]+'">查看采购来源 →</a></td></tr>';
 }).join('')||'<tr><td colspan="8">暂无匹配数据，请调整筛选。</td></tr>';
 $('pool-page').textContent=page+' / '+Math.max(1,Math.ceil(filtered.length/size));
 $('pool-prev').disabled=page<=1;$('pool-next').disabled=page*size>=filtered.length;
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
  const batch=await cloudRequest('freight_sales_price_candidates?select=source_kind,source_id,origin,destination,source_status,source_quote,purchase_amount,purchase_currency,valid_from,valid_until&order=created_at.desc,source_id.asc&limit=500&offset='+offset);
  all.push(...batch);if(batch.length<500)break;
 }
 rows=all;filter();
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
if(currentUser())load().catch(e=>{$('pool-summary').textContent='同步池读取失败：'+e.message;});
