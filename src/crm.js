import {installMailVerification} from './mail-verification.js';
import {installCrmBulk} from './crm-bulk.js';
import {createPager} from './pagination.js';
import {login,logout,currentUser,cloudRequest} from './cloud.js';
import {companyGroupOptions,filterCompanies,latestFollowups,validateCompany,validateContact,chinaDate,initialContacts} from './crm-model.js';
const $=id=>document.getElementById(id);
let companies=[],contacts=[],shipments=[],followups=[],page=1,selected=null,editingCompany=null,editingContact=null,generation=0,detailGeneration=0,selectedCompanies=new Set(),filteredCompanies=[],pageCompanies=[];
let size=30;
const pager=createPager('prev','next',(value,newSize)=>{page=value-0;size=newSize;render();},30);
async function all(table,order='id.asc'){
 const result=[];
 for(let offset=0;;offset+=500){const rows=await cloudRequest(`${table}?select=*&order=${order}&limit=500&offset=${offset}`);result.push(...rows);if(rows.length<500)return result;}
}
function authUI(){const user=currentUser();$('login-panel').hidden=!!user;$('workspace').hidden=!user;$('account').textContent=user?.email||'';$('logout').hidden=!user;}
async function load(){
 const g=++generation;$('add-company').disabled=true;$('notice').textContent='正在同步客户档案…';
 try{const data=await Promise.all([all('freight_companies'),all('freight_contacts'),all('freight_shipments'),all('freight_followups','created_at.desc,id.asc')]);if(g!==generation)return;[companies,contacts,shipments,followups]=data;selectedCompanies.clear();fillOwners();render();$('notice').textContent='客户档案已同步。';$('add-company').disabled=false;}
 catch(e){if(g!==generation)return;companies=[];contacts=[];shipments=[];followups=[];render();$('notice').textContent=e.message;authUI();}
}
function td(text){const el=document.createElement('td');el.textContent=text??'—';return el;}
function paragraph(text){const el=document.createElement('p');el.textContent=text;return el;}
function btn(text,action){const b=document.createElement('button');b.type='button';b.className='secondary';b.textContent=text;b.addEventListener('click',action);return b;}
function render(){
 fillGroups();
 const latest=latestFollowups(followups),today=chinaDate();
 $('total').textContent=companies.length;$('pending').textContent=companies.filter(c=>c.status==='待核实').length;
 $('due-count').textContent=companies.filter(c=>latest.get(c.id)?.next_date&&latest.get(c.id).next_date<=today).length;
 const visible=filterCompanies(companies,contacts,followups,{group:$('group-filter').value,query:$('search').value,status:$('status').value,due:$('due').value,region:$('region-filter').value.trim(),role:$('role-filter').value,industry:$('industry-filter').value.trim(),owner:$('owner-filter').value,contact:$('contact-filter').value});
 const pages=Math.max(1,Math.ceil(visible.length/size));page=Math.max(1,Math.min(page,pages));
 $('count').textContent=`共 ${visible.length} 家`;$('rows').replaceChildren();
 const byCompany=new Map();for(const c of contacts){const list=byCompany.get(c.company_id)||[];list.push(c);byCompany.set(c.company_id,list);}
 filteredCompanies=visible;pageCompanies=visible.slice((page-1)*size,page*size);for(const c of pageCompanies){
  const tr=document.createElement('tr'),name=td(c.company_name),sub=document.createElement('small');sub.textContent=c.role;name.append(sub);
  const candidates=byCompany.get(c.id)||[],contact=td(candidates[0]?.value||'待补充');const count=document.createElement('small');count.textContent=`${candidates.length} 条 · 请核实有效性`;contact.append(count);
  const route=td(c.current_routes||(c.historical_routes||[]).slice(0,2).join('\n')||'待补充');if(!c.current_routes){const note=document.createElement('small');note.textContent='历史线路';route.append(note);}
  const next=latest.get(c.id)?.next_date,action=td('');action.append(btn('查看 / 跟进',()=>openDetail(c.id)));
  const choose=td(''),checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=selectedCompanies.has(c.id);checkbox.setAttribute('aria-label','选择 '+c.company_name);checkbox.onchange=()=>{checkbox.checked?selectedCompanies.add(c.id):selectedCompanies.delete(c.id);syncCompanySelection();};choose.append(checkbox);tr.append(choose,name,contact,route,td(c.status),td(next?next+(next<today?' · 逾期':''):'未安排'),action);$('rows').append(tr);
 }
 $('empty').hidden=visible.length>0;$('empty').textContent=companies.length?'没有符合条件的公司。':'暂无公司档案。';
 pager.update(visible.length,page);$('page').textContent=`${page} / ${pages}`;$('prev').disabled=page<=1;$('next').disabled=page>=pages;syncCompanySelection();
}
function renderDetail(){
 const c=companies.find(x=>x.id===selected);if(!c)return;
 $('detail-title').textContent=c.company_name;$('detail-note').textContent=[`状态：${c.status} · 角色：${c.role} · 负责人：${c.owner||'未分配'}`,`当前需求：${c.current_routes||'待核实'}`,`地址：${(c.addresses||[]).join('； ')||'待补充'}`,c.notes].filter(Boolean).join('\n');
 $('contacts').replaceChildren();for(const contact of contacts.filter(x=>x.company_id===selected)){
  const card=document.createElement('div');card.className='contact-card';card.append(paragraph(`${contact.name||'姓名待补充'} · ${contact.channel}：${contact.value}\n${contact.context} · ${contact.status}`),btn('编辑',()=>openContact(contact)));$('contacts').append(card);
 }if(!$('contacts').children.length)$('contacts').append(paragraph('暂无联系方式。'));
 $('followups').replaceChildren();for(const f of followups.filter(x=>x.company_id===selected).sort((a,b)=>b.created_at.localeCompare(a.created_at))){const card=document.createElement('div');card.className='followup-card';card.append(paragraph(`${new Date(f.created_at).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})}：${f.result}`),paragraph(`下一步：${f.next_action||'未安排'} · 下次联系：${f.next_date||'未安排'}`));$('followups').append(card);}
 $('history').replaceChildren();for(const s of shipments.filter(x=>x.company_id===selected).sort((a,b)=>(b.train_date||'').localeCompare(a.train_date||''))){const tr=document.createElement('tr');tr.append(td(s.train_date),td(s.origin),td(s.destination),td(s.container_type),td(s.container_quantity));$('history').append(tr);}
}
async function openDetail(id){
 selected=id;const dg=++detailGeneration;$('followup-form').reset();$('followup-error').textContent='';renderDetail();$('sources').textContent='正在读取来源…';if(!$('detail').open)$('detail').showModal();
 try{const rows=await cloudRequest(`freight_sources?company_id=eq.${encodeURIComponent(id)}&select=*&order=sheet.asc,row_number.asc`);if(dg!==detailGeneration||selected!==id)return;$('sources').replaceChildren();for(const r of rows){const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent=`${r.source_filename} · ${r.sheet}!${r.row_number}`;details.append(summary,paragraph(Object.entries(r.raw).map(([k,v])=>`${k}：${v}`).join('\n')));$('sources').append(details);}if(!rows.length)$('sources').textContent='手动新增档案，无导入来源。';}
 catch(e){if(dg===detailGeneration)$('sources').textContent=e.message;}
}
function openCompany(c){editingCompany=c?.id||null;$('company-form').reset();$('initial-contact-rows').replaceChildren();$('initial-contacts').hidden=!!c;if(!c)addInitialContact();$('company-error').textContent='';$('company-title').textContent=c?'编辑公司档案':'新增公司';if(c)for(const key of ['company_name','status','role','region','owner','industry','current_routes','notes','addresses'])$('company-form').elements.namedItem(key).value=key==='addresses'?(c.addresses||[]).join('\n'):c[key]||'';$('company-editor').showModal();}
function addInitialContact(){
 const row=document.createElement('fieldset');row.className='contact-card';const legend=document.createElement('legend');legend.textContent='联系人';row.append(legend);const fields=document.createElement('div');fields.className='fields';
 for(const [key,title,type] of [['name','姓名','text'],['email','邮箱','email'],['phone','电话','tel'],['wechat','微信','text'],['context','备注 / 来源','text']]){const label=document.createElement('label');label.textContent=title;const input=document.createElement('input');input.dataset.field=key;input.type=type;input.maxLength=key==='name'?120:500;label.append(input);fields.append(label);}
 const label=document.createElement('label');label.textContent='有效性';const status=document.createElement('select');status.dataset.field='status';for(const text of ['待核实','有效','失效']){const o=document.createElement('option');o.textContent=text;status.append(o);}label.append(status);fields.append(label);row.append(fields,btn('移除联系人',()=>row.remove()));$('initial-contact-rows').append(row);
}
$('add-initial-contact').addEventListener('click',addInitialContact);
function readInitialContacts(){return initialContacts([...$('initial-contact-rows').children].map(row=>Object.fromEntries([...row.querySelectorAll('[data-field]')].map(input=>[input.dataset.field,input.value]))));}
function openContact(c){editingContact=c?.id||null;$('contact-form').reset();$('contact-error').textContent='';if(c)for(const key of ['name','channel','value','context','status'])$('contact-form').elements.namedItem(key).value=c[key]||'';$('contact-editor').showModal();}
async function save(table,data,id){const rows=await cloudRequest(table+(id?`?id=eq.${encodeURIComponent(id)}`:''),{method:id?'PATCH':'POST',headers:{Prefer:'return=representation'},body:JSON.stringify(data)});if(rows.length!==1)throw Error('保存未成功，请检查账号权限。');return rows[0];}
function formHandler(id,error,fn){$(id).addEventListener('submit',async e=>{e.preventDefault();const b=e.currentTarget.querySelector('[type=submit]');b.disabled=true;$(error).textContent='';try{await fn(Object.fromEntries(new FormData(e.currentTarget)));}catch(err){$(error).textContent=err.message;}finally{b.disabled=false;}});}
formHandler('login-form','login-error',async()=>{await login($('login-email').value,$('login-password').value);$('login-password').value='';authUI();await load();});
formHandler('company-form','company-error',async data=>{const value=validateCompany(data);if(companies.some(c=>c.id!==editingCompany&&c.company_name===value.company_name))throw Error('已有同名公司，请打开现有档案。');let saved;if(editingCompany){saved=await save('freight_companies',value,editingCompany);}else{const initial=readInitialContacts().map(c=>({id:crypto.randomUUID(),...c}));const result=await cloudRequest('rpc/freight_create_company',{method:'POST',body:JSON.stringify({p_company:{id:crypto.randomUUID(),...value},p_contacts:initial})});if(!result.company?.id||!Array.isArray(result.contacts))throw Error('保存结果异常，请刷新后检查。');saved=result.company;contacts=[...result.contacts,...contacts];}companies=editingCompany?companies.map(c=>c.id===editingCompany?saved:c):[saved,...companies];render();renderDetail();$('company-editor').close();});
formHandler('contact-form','contact-error',async data=>{if(!selected)throw Error('请先选择公司。');const value=validateContact(data);const saved=await save('freight_contacts',editingContact?value:{id:crypto.randomUUID(),company_id:selected,...value},editingContact);contacts=editingContact?contacts.map(c=>c.id===editingContact?saved:c):[saved,...contacts];render();renderDetail();$('contact-editor').close();});
formHandler('followup-form','followup-error',async data=>{const result=String(data.result||'').trim(),next_action=String(data.next_action||'').trim();if(!result)throw Error('请填写沟通结果。');if(data.next_date&&!next_action)throw Error('安排下次联系时，请填写下一步动作。');const saved=await save('freight_followups',{company_id:selected,result,next_action,next_date:data.next_date||null,owner_id:currentUser().id});followups.unshift(saved);render();renderDetail();$('followup-form').reset();});
document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>$(b.dataset.close).close()));
$('logout').addEventListener('click',async()=>{++generation;++detailGeneration;try{await logout();}catch{}companies=[];contacts=[];shipments=[];followups=[];selected=null;selectedCompanies.clear();for(const id of ['detail','company-editor','contact-editor'])$(id).close();render();authUI();});
$('refresh').addEventListener('click',load);$('add-company').addEventListener('click',()=>openCompany());$('edit-company').addEventListener('click',()=>openCompany(companies.find(c=>c.id===selected)));$('add-contact').addEventListener('click',()=>openContact());
for(const id of ['search','group-filter','status','due','region-filter','role-filter','industry-filter','owner-filter','contact-filter'])$(id).addEventListener(['search','region-filter','industry-filter'].includes(id)?'input':'change',()=>{page=1;render();});
function fillGroups(){
 const select=$('group-filter'),previous=select.value,options=companyGroupOptions(companies,contacts);
 select.replaceChildren(new Option('全部客户分组',''),new Option('未分组','__ungrouped'));
 for(const [isBatch,label] of [[true,'采集批次'],[false,'联系分组']]){const rows=options.filter(x=>x.isBatch===isBatch);if(!rows.length)continue;const group=document.createElement('optgroup');group.label=label;for(const row of rows)group.append(new Option(`${row.name}（${row.count}家）`,row.name));select.append(group);}
 select.value=previous;if(select.selectedIndex<0)select.value='';
}
function fillOwners(){const value=$('owner-filter').value;$('owner-filter').replaceChildren(new Option('全部',''));for(const owner of [...new Set(companies.map(c=>c.owner).filter(Boolean))].sort())$('owner-filter').append(new Option(owner,owner));$('owner-filter').value=value;}
function syncCompanySelection(){const chosen=pageCompanies.filter(c=>selectedCompanies.has(c.id)).length;$('company-select-page').checked=pageCompanies.length>0&&chosen===pageCompanies.length;$('company-select-page').indeterminate=chosen>0&&chosen<pageCompanies.length;$('company-selection').textContent='已选 '+selectedCompanies.size+' 家（跨页、分组保留）';for(const id of ['bulk-company','bulk-followup','export-selected'])$(id).disabled=!selectedCompanies.size;}
$('company-select-page').onchange=e=>{for(const c of pageCompanies)e.target.checked?selectedCompanies.add(c.id):selectedCompanies.delete(c.id);render();};$('select-filtered').onclick=()=>{for(const c of filteredCompanies)selectedCompanies.add(c.id);render();};$('clear-selection').onclick=()=>{selectedCompanies.clear();render();};$('clear-filters').onclick=()=>{for(const id of ['search','group-filter','status','due','region-filter','role-filter','industry-filter','owner-filter','contact-filter'])$(id).value='';page=1;render();};
installCrmBulk({getCompanies:()=>companies,getContacts:()=>contacts,selected:selectedCompanies,applyCompanies:rows=>{const map=new Map(rows.map(r=>[r.id,r]));companies=companies.map(c=>map.get(c.id)||c);fillOwners();render();},applyFollowups:rows=>{followups.unshift(...rows);render();},render});
installMailVerification({buttonId:'bulk-email-verification',getContacts:()=>contacts,getEpoch:()=>generation,getScopes:()=>{
 const scopeRows=ids=>contacts.filter(c=>ids.has(c.company_id)),scopes=[{value:'selected',label:'已选客户的邮箱',rows:scopeRows(selectedCompanies)}];
 if($('group-filter').value){const group=$('group-filter').value,ids=new Set(filterCompanies(companies,contacts,followups,{group}).map(c=>c.id));scopes.push({value:'group',label:'当前分组：'+(group==='__ungrouped'?'未分组':group),rows:scopeRows(ids)});}
 scopes.push({value:'filtered',label:'全部筛选客户的邮箱',rows:scopeRows(new Set(filteredCompanies.map(c=>c.id)))});return scopes;
},applyRows:rows=>{const map=new Map(rows.map(c=>[c.id,c]));contacts=contacts.map(c=>map.get(c.id)||c);},render});
$('prev').addEventListener('click',()=>{page--;render();});$('next').addEventListener('click',()=>{page++;render();});render();authUI();if(currentUser())load();


