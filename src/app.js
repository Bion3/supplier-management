import {regions,countries,countryInfo,countryLabel,normalizeCountry,supplierRegion} from './supplier-geography.js';
import {addPagerAfter} from './pagination.js';
import {login,logout,currentUser,listSuppliers,saveSupplier} from './cloud.js';
import {validateSupplier, filterSuppliers} from './suppliers.js';
const $ = id => document.getElementById(id);
let suppliers = [], editingId = null,page=1;
function option(value,label=value) {const o=document.createElement('option');o.value=value;o.textContent=label;return o;}
for(const region of regions) { $('region-filter').append(option(region)); $('supplier-form').elements.namedItem('region').append(option(region)); }
for(const [country,label] of countries) $('supplier-countries').append(option(country,label));
function updateCountryFilter() {
 const previous=$('country-filter').value, region=$('region-filter').value;
 const values=[...new Set(suppliers.filter(s=>!region||supplierRegion(s)===region).map(s=>normalizeCountry(s.country)).filter(Boolean))].sort((a,b)=>countryLabel(a).localeCompare(countryLabel(b),'zh-CN'));
 $('country-filter').replaceChildren(option('','全部国家'),...values.map(value=>option(value,countryLabel(value))));
 $('country-filter').value=values.includes(previous)?previous:'';
}
const pager=addPagerAfter($('empty'),'supplier',(value)=>{page=value;render();});
async function loadCloud() {
 $('add').disabled=true;
 try { suppliers=await listSuppliers(); updateCountryFilter(); render(); $('notice').textContent='云端数据已同步。'; $('add').disabled=false; }
 catch(error) {suppliers=[];render();$('notice').textContent=error.message;}
}
function authUI() {const user=currentUser();$('login-panel').hidden=!!user;$('workspace').hidden=!user;$('account').textContent=user?.email||'';$('logout').hidden=!user;}
$('login-form').addEventListener('submit',async event=>{event.preventDefault();const button=event.currentTarget.querySelector('button');button.disabled=true;try {await login($('login-email').value,$('login-password').value);$('login-password').value='';authUI();await loadCloud();}catch(error){$('login-error').textContent=error.message;}finally{button.disabled=false;}});
$('logout').addEventListener('click',async()=>{try{await logout();}catch{}suppliers=[];render();authUI();});
$('refresh').addEventListener('click',loadCloud);
function cell(text) { const td = document.createElement('td'); td.textContent = text; return td; }
function render() {
  $('total').textContent = suppliers.length;
  $('active').textContent = suppliers.filter(s => s.status === '合作中').length;
  $('pending').textContent = suppliers.filter(s => s.status === '待评估').length;
  const visible = filterSuppliers(suppliers, $('search').value, $('filter').value,{region:$('region-filter').value,country:$('country-filter').value});
  $('count').textContent = `显示 ${visible.length} 条`;
  $('rows').replaceChildren();
  const paging=pager.update(visible.length,page);page=paging.page;
  for (const s of visible.slice(paging.start,paging.end)) {
    const tr = document.createElement('tr');
    const name = cell(s.name), category = document.createElement('small'); category.textContent = s.category; name.append(category);
    const contact=cell(s.contact||'—'), phone=cell(s.phone||'—'), email=cell(s.email||'—');
    if(s.email) {const link=document.createElement('a');link.textContent=s.email;link.href='mailto:'+s.email;email.replaceChildren(link);}
    if(s.phone) {const link=document.createElement('a');link.textContent=s.phone;link.href='tel:'+s.phone.replace(/[^+0-9]/g,'');phone.replaceChildren(link);}
    const status = cell(''), badge = document.createElement('span'); badge.className = `badge ${s.status === '合作中' ? 'green' : ''}`; badge.textContent = s.status; status.append(badge);
    const action = cell(''), button = document.createElement('button'); button.className = 'secondary'; button.textContent = '编辑'; button.setAttribute('aria-label', `编辑 ${s.name}`); button.addEventListener('click', () => openEditor(s)); action.append(button);
    tr.append(name, cell(supplierRegion(s)||'未分类'),cell(countryLabel(s.country)||'未填写'),cell(s.city||'—'),contact,phone,email,cell(s.routes || '—'), status, action); $('rows').append(tr);
  }
  $('empty').hidden = visible.length > 0;
  $('empty').textContent = suppliers.length ? '没有匹配的供应商，请调整搜索条件。' : '暂无供应商，点击“新增供应商”开始录入。';
}
function openEditor(s) {
  editingId = s?.id ?? null; $('supplier-form').reset(); $('form-error').textContent = '';
  $('form-title').textContent = s ? '编辑供应商' : '新增供应商';
  if(s) for(const [key, value] of Object.entries(s)) { const field = $('supplier-form').elements.namedItem(key); if(field) field.value = value; }
  $('supplier-form').elements.namedItem('region').value=s?supplierRegion(s):'';
  $('editor').showModal();
}
$('add').addEventListener('click', () => openEditor());
for(const id of ['close','cancel']) $(id).addEventListener('click', () => $('editor').close());
$('region-filter').addEventListener('change',()=>{page=1;updateCountryFilter();render();});
$('clear-supplier-filters').addEventListener('click',()=>{for(const id of ['search','filter','region-filter','country-filter'])$(id).value='';page=1;updateCountryFilter();render();});
$('supplier-form').elements.namedItem('country').addEventListener('change',event=>{const info=countryInfo(event.target.value);$('supplier-form').elements.namedItem('region').value=info?.[2]||'';});
for(const id of ['search','filter','country-filter'])$(id).addEventListener(id==='search'?'input':'change',()=>{page=1;render();});
$('supplier-form').addEventListener('submit', async event => {
 event.preventDefault();const button=event.currentTarget.querySelector('[type=submit]');button.disabled=true;
 try {
  const data=validateSupplier(Object.fromEntries(new FormData(event.currentTarget)));
  const saved=await saveSupplier(data,editingId);
  suppliers=editingId?suppliers.map(s=>s.id===editingId?saved:s):[saved,...suppliers];
  updateCountryFilter();render();$('editor').close();$('notice').textContent='供应商已保存到云端。';
 } catch(error) {$('form-error').textContent=error.message;} finally {button.disabled=false;}
});
render();authUI();if(currentUser())loadCloud();
