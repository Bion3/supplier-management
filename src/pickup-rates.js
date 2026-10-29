import {installCostEnable} from './cost-enable.js';
import {createListFilters} from './list-filters.js';
import {addPagerAfter} from './pagination.js';
import {login,currentUser,listSuppliers,cloudRequest,syncAuthShell} from './cloud.js';
import {blankRate,validateRate} from './domestic-model.js';
const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));let rows=[],suppliers=[],prior=null,page=1,filteredCosts=[];
const pager=addPagerAfter($('rows').closest('.table-wrap'),'pickup',(value)=>{page=value;renderTemplates();});
const extraFilters=createListFilters('rows',[
 {id:'name',label:'模板名称',get:r=>r.quote.templateName},{id:'area',label:'适用区域',get:r=>(r.quote.areas||[]).join(' ')||'全部始发地'},
 {id:'supplier',label:'供应商',get:r=>suppliers.find(s=>s.id===r.supplier_id)?.name||'通用模板'},
 {id:'status',label:'状态',type:'select',options:[['draft','待确认'],['confirmed','启用'],['inactive','停用']],get:r=>r.status},
 {id:'currency',label:'币种',type:'select',options:[['CNY','CNY'],['USD','USD']],get:r=>r.quote.currency}
],()=>{page=1;renderTemplates();});
async function load(){rows=[];for(let offset=0;;offset+=500){const r=await cloudRequest(`freight_domestic_rates?kind=eq.pickup&select=*&order=created_at.desc,id.asc&limit=500&offset=${offset}`);rows.push(...r);if(r.length<500)break;}renderTemplates();}
const tierKey=t=>JSON.stringify([t.minVolume,t.maxVolume,t.minWeight,t.maxWeight,t.unit||'fixed']);
function renderTemplates(){
 const old=new Set(rows.map(r=>r.supersedes_id).filter(Boolean));
 const current=rows.filter(r=>r.quote.sharedPickup&&!old.has(r.id));
 const list=extraFilters.apply(current);filteredCosts=list;
 const paging=pager.update(list.length,page);page=paging.page;
 const head=$('rows').closest('table').querySelector('thead tr');
 head.innerHTML=['模板 / 使用范围','第1档 · ≤5 CBM / ≤2500kg','第2档 · ≤10 CBM / ≤5000kg','第3档 · ≤15 CBM / ≤7500kg','有效期 / 状态','操作'].map(x=>'<th>'+x+'</th>').join('');
 $('rows').innerHTML=list.slice(paging.start,paging.end).map(r=>{
  const q=r.quote||{},tiers=[...(q.tiers||[])].sort((a,b)=>a.maxVolume-b.maxVolume||a.maxWeight-b.maxWeight);
  const points=[{volume:5,weight:2500},{volume:10,weight:5000},{volume:15,weight:7500}];
  const price=point=>{const band=tiers.find(t=>point.volume<=t.maxVolume&&point.weight<=t.maxWeight);
    return band&&Number.isFinite(Number(band.amount))?esc(band.amount):'<span class="pickup-missing">未设置</span>';};
  const scope=q.areas?.length?q.areas.join('、'):'全部提货地 · 收货仓100公里内';
  return '<tr data-sale-row="'+esc(r.id)+'"><td><strong>'+esc(q.templateName||'通用提货价')+'</strong><small>'+esc(scope)+'</small></td>'+
  points.map(p=>'<td class="pickup-price"><strong>'+price(p)+'</strong><small>'+esc(q.currency||'USD')+' / 票</small></td>').join('')+
  '<td><span class="pickup-status '+(r.status==='confirmed'?'is-active':'')+'">'+(r.status==='confirmed'?'已确认':r.status==='inactive'?'停用':'待确认')+'</span><small>'+esc(q.validUntil||'长期有效（待核实）')+'</small></td>'+
  '<td><button type="button" data-edit="'+esc(r.id)+'" class="secondary">修改模板</button></td></tr>';
 }).join('')||'<tr><td colspan="6">暂无有效的提货价格模板</td></tr>';
 bulkEnable.refresh();
}

function tier(t={minVolume:1,maxVolume:5,minWeight:0,maxWeight:2500,amount:80}){const div=document.createElement('div');div.className='tier fields';div.innerHTML=[['minVolume','最小CBM'],['maxVolume','最大CBM'],['minWeight','最小kg'],['maxWeight','最大kg'],['amount','每票金额']].map(([key,label])=>`<label>${label}<input name="${key}" type="number" min="0" step="any" required value="${t[key]}"></label>`).join('')+'<button type="button" class="secondary" data-remove>移除此档</button>';$('tiers').append(div);}
function edit(row){prior=row?.id||null;const q=row?.quote,f=$('template-form');f.reset();f.elements.supplier_id.innerHTML='<option value="">通用模板（未关联供应商）</option>'+suppliers.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('');for(const [name,value] of Object.entries({tierMode:q?.tierMode||(q?'strict':'ceil'),name:q?.templateName||'本地提货通用价',currency:q?.currency||'USD',areas:q?.areas?.join(',')||'',status:row?.status||'draft',validFrom:q?.validFrom||'',validUntil:q?.validUntil||'',supplier_id:row?.supplier_id||'',source:q?.source||''}))f.elements[name].value=value;$('tiers').innerHTML='';(q?.tiers||[{minVolume:1,maxVolume:5,minWeight:0,maxWeight:2500,amount:80},{minVolume:6,maxVolume:10,minWeight:2500,maxWeight:5000,amount:80}]).forEach(tier);$('error').textContent='';$('editor').showModal();}
document.addEventListener('click',e=>{if(e.target.dataset.edit)edit(rows.find(r=>r.id===e.target.dataset.edit));if(e.target.hasAttribute('data-remove'))e.target.closest('.tier').remove();});$('add').onclick=()=>edit();$('close').onclick=()=>$('editor').close();$('add-tier').onclick=()=>tier();
$('template-form').onsubmit=async e=>{e.preventDefault();try{const f=new FormData(e.target),q={...blankRate(),kind:'pickup',origin:'通用本地提货',destination:'本地集货仓',sharedPickup:true,templateName:f.get('name').trim(),areas:f.get('areas').split(/[,，]/).map(x=>x.trim()).filter(Boolean),currency:f.get('currency'),status:f.get('status'),supplier_id:f.get('supplier_id')||null,rule:'tier',tierMode:f.get('tierMode'),deliveryIncluded:true,minimum:0,validFrom:f.get('validFrom'),validUntil:f.get('validUntil'),source:f.get('source'),tiers:[...$('tiers').children].map(el=>Object.fromEntries([...el.querySelectorAll('input')].map(x=>[x.name,Number(x.value)])))};q.tiers.forEach(t=>t.unit='fixed');validateRate(q);$('save').disabled=true;const r=await cloudRequest('freight_domestic_rates',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({kind:'pickup',origin:q.origin,destination:q.destination,supplier_id:q.supplier_id,status:q.status,quote:q,supersedes_id:prior})});if(r.length!==1)throw Error('保存未成功');await load();$('editor').close();$('notice').textContent='已保存共享模板。新测算自动使用新版本，历史测算保持原价。';}catch(e){$('error').textContent=e.message;}finally{$('save').disabled=false;}};
const bulkEnable=installCostEnable({kind:'domestic',table:'freight_domestic_rates',getRows:()=>rows,getFiltered:()=>filteredCosts,reload:load});
async function start(){if(!syncAuthShell())return;try{suppliers=await listSuppliers();await load();}catch(e){$('notice').textContent=e.message;}}$('login-form').onsubmit=async e=>{e.preventDefault();try{const f=new FormData(e.target);await login(f.get('email'),f.get('password'));e.target.reset();await start();}catch(e){$('notice').textContent=e.message;}};start();
