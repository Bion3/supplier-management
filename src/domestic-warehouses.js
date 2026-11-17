import {cloudRequest,login,syncAuthShell} from './cloud.js';
import {warehouseFields,validateWarehouse,warehouseQuery} from './domestic-warehouses-model.js';
const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const form=$('master-form'),filters=$('filters');let page=1,rows=[],prior=null,sequence=0;
async function load(){const seq=++sequence;$('notice').textContent='正在加载仓库…';$('prev').disabled=$('next').disabled=true;try{
 const result=await cloudRequest(warehouseQuery(Object.fromEntries(new FormData(filters)),page));if(seq!==sequence)return;
 rows=result.slice(0,50);$('master-rows').innerHTML=rows.map(r=>'<tr>'+warehouseFields.filter(k=>k!=='notes').map(k=>'<td>'+((['address','charges','hours','phone'].includes(k)&&r[k])?'<details><summary>'+esc(String(r[k]).slice(0,45))+(r[k].length>45?'…':'')+'</summary><p style="white-space:pre-wrap">'+esc(r[k])+'</p></details>':esc(r[k]||'—'))+(k==='name'&&r.notes?'<small>'+esc(r.notes)+'</small>':'')+'</td>').join('')+'<td>'+(r.enabled?'启用':'停用')+'</td><td><button class="secondary" data-edit="'+r.id+'">编辑</button></td></tr>').join('')||'<tr><td colspan="12">暂无符合条件的仓库</td></tr>';
 $('prev').disabled=page===1;$('next').disabled=result.length<=50;$('page-label').textContent='第 '+page+' 页 · 本页 '+rows.length+' 条';$('notice').textContent='可按仓库类型、所属口岸、供应商筛选。';
 }catch(e){if(seq===sequence){$('notice').textContent=e.message;$('master-rows').innerHTML='';$('page-label').textContent='加载失败，请重新查询';}}}
function edit(row){prior=row||null;form.reset();$('master-error').textContent='';$('editor-title').textContent=row?'编辑仓库':'新增仓库';for(const k of warehouseFields)form.elements[k].value=row?.[k]??(k==='country'?'中国':k==='warehouse_type'?'集货仓':'');form.elements.enabled.value=String(row?.enabled??true);$('master-editor').showModal();}
form.onsubmit=async e=>{e.preventDefault();if($('save-master').disabled)return;try{const payload=validateWarehouse(Object.fromEntries(new FormData(form)));$('save-master').disabled=true;const path='domestic_warehouses'+(prior?'?id=eq.'+prior.id+'&revision=eq.'+prior.revision:'');const result=await cloudRequest(path,{method:prior?'PATCH':'POST',headers:{Prefer:'return=representation'},body:JSON.stringify(payload)});if(result.length!==1)throw Error('记录已被修改，请关闭窗口、重新查询后编辑。');$('master-editor').close();await load();}catch(e){$('master-error').textContent=e.message;}finally{$('save-master').disabled=false;}};
$('close-master').onclick=()=>$('master-editor').close();$('add-warehouse').onclick=()=>edit();$('master-rows').onclick=e=>{const id=e.target.closest('[data-edit]')?.dataset.edit;if(id)edit(rows.find(r=>r.id===id));};
filters.onsubmit=e=>{e.preventDefault();page=1;load();};filters.onreset=()=>{setTimeout(()=>{page=1;load();},0);};
$('prev').onclick=()=>{page=Math.max(1,page-1);load();};$('next').onclick=()=>{page++;load();};
$('login-form').onsubmit=async e=>{e.preventDefault();try{const d=new FormData(e.target);await login(d.get('email'),d.get('password'));e.target.reset();await load();}catch(error){$('notice').textContent=error.message;}};
if(syncAuthShell())load();
