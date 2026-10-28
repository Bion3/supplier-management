import {transferToCrm,installExhibitorCrm} from './crm-acquisition.js';
import {mergeExhibitorContacts,exhibitorContactsByType} from './exhibitor-contact-model.js';
import {exhibitionCategories,exhibitionTypes,exhibitionTiers,exhibitionSources,tierGuide} from './exhibitions-classification.js';
import {installExhibitionAuto} from './exhibitions-auto.js';
import {cloudRequest,currentUser,syncAuthShell,appRequest} from './cloud.js';
import {addPagerAfter} from './pagination.js';
import {countryLabel} from './supplier-geography.js';
import {companyTypes,fairFields,exhibitorFields,validateEntry,identity,filterEntries,importPlan,entriesCSV,safeURL,editionYear} from './exhibitions-model.js';
const $=id=>document.getElementById(id),tables={fairs:'freight_exhibitions',exhibitors:'freight_exhibitors'};
let kind='fairs',fairs=[],exhibitors=[],visible=[],page=1,pageRows=[],editing=null,busy=false,plan=null,generation=0,exhibitorsLoaded=false;
const selected=new Set(),pager=addPagerAfter($('expo-table'),'expo',n=>{page=n;render();});
installExhibitorCrm({getRows:()=>exhibitors,selected,isBusy:()=>busy,lock,refresh:()=>load()});
const auto=installExhibitionAuto({getFairs:()=>fairs,refresh:()=>load(),isBusy:()=>busy,lock});
$('tier-guide').textContent=tierGuide;for(const [name,url,purpose] of exhibitionSources){const a=document.createElement('a');a.href=url;a.textContent=name+' · '+purpose;a.target='_blank';a.rel='noopener noreferrer';$('source-links').append(a);}
const statuses=()=>kind==='fairs'?['待核实','已核实','延期','取消']:['待核实','已核实','失效'];
function option(value,label=value){return new Option(label,value);}
function options(id,values,label,format=v=>v){const el=$(id),old=el.value;el.replaceChildren(option('',label),...values.map(v=>option(v,format(v))));if([...el.options].some(o=>o.value===old))el.value=old;}
function fillFilters(){options('year-filter',[...new Set(['2025','2026',...fairs.map(editionYear).filter(Boolean)])].sort(),'全部年份');options('category-filter',exhibitionCategories,'全部大类');options('tier-filter',exhibitionTiers,'全部级别');options('exhibition-type-filter',exhibitionTypes,'全部类型');options('region-filter',[...new Set(fairs.map(r=>r.region).filter(Boolean))].sort(),'全部地区');options('platform-filter',[...new Set(fairs.map(r=>r.source_platform).filter(Boolean))].sort(),'全部来源');const rows=kind==='fairs'?fairs:exhibitors;options('country-filter',[...new Set(rows.map(r=>r.country).filter(Boolean))].sort(),'全部国家',countryLabel);options('industry-filter',[...new Set(rows.map(r=>r.industry).filter(Boolean))].sort(),'全部行业');options('status-filter',statuses(),'全部状态');options('type-filter',companyTypes,'全部类型');options('tag-filter',[...new Set(exhibitors.flatMap(r=>r.tags||[]))].sort(),'全部标签');const old=$('fair-filter').value;$('fair-filter').replaceChildren(option('','全部展会'),...fairs.map(r=>option(r.id,r.name+' · '+r.edition)));if(fairs.some(r=>r.id===old))$('fair-filter').value=old;}
async function all(table,order){const result=[];for(let offset=0;;offset+=500){const rows=await cloudRequest(table+'?select=*&order='+order+'&limit=500&offset='+offset);result.push(...rows);if(rows.length<500)return result;}}
async function load(){if(!currentUser())return;const g=++generation;$('notice').textContent='正在加载…';try{const list=await all(tables.fairs,'starts_on.asc.nullslast,id.asc');let companies=exhibitors;if(kind==='exhibitors'||exhibitorsLoaded)companies=await all(tables.exhibitors,'company_name.asc,id.asc');if(g!==generation||!currentUser())return;fairs=list;exhibitors=companies;if(kind==='exhibitors')exhibitorsLoaded=true;selected.clear();fillFilters();render();$('notice').textContent='资料已同步。';}catch(error){if(g===generation)$('notice').textContent=error.message;}}
function link(value,label){const a=document.createElement('a');try{a.href=safeURL(value);if(!a.href||!value)return document.createTextNode('—');}catch{return document.createTextNode('无有效链接');}a.textContent=label;a.target='_blank';a.rel='noopener noreferrer';return a;}
function td(text){const el=document.createElement('td');const value=String(text??'');el.textContent=value.length>160?value.slice(0,160)+'…':value;if(value.length>160)el.title=value;return el;}
function contactCell(row,type){
 const items=exhibitorContactsByType(row,type),cell=document.createElement('td');
 if(!items.length){cell.textContent=type==='person'?'—':'待补充';return cell;}
 const add=(target,item)=>{
  const line=document.createElement('div');line.className='expo-contact-line';line.textContent=item.value;
  line.title=(item.verification==='verified'?'已核实':'待核实')+' · '+(item.source_url||item.source_type||'手工录入');
  target.append(line);
 };
 items.slice(0,2).forEach(item=>add(cell,item));
 if(items.length>2){
  const details=document.createElement('details');details.className='expo-contact-more';
  const summary=document.createElement('summary');summary.textContent='另有 '+(items.length-2)+' 条';
  details.append(summary);items.slice(2).forEach(item=>add(details,item));cell.append(details);
 }
 return cell;
}
function button(label,action){const b=document.createElement('button');b.className='secondary';b.type='button';b.textContent=label;b.disabled=busy;b.onclick=()=>{if(!busy)action();};return b;}
function classificationCell(r){const el=td(''),badge=document.createElement('strong'),meta=document.createElement('small');badge.className='expo-tier '+(r.tier?.startsWith('A')?'tier-a':r.tier?.startsWith('B')?'tier-b':'');badge.textContent=r.tier||'待评估';if(r.tier_basis)badge.title=r.tier_basis;meta.textContent=(r.category||'待分类')+' · '+(r.exhibition_type||'待分类')+(r.industry?' · '+r.industry:'');el.append(badge,meta);if(r.tier_source_url)el.append(link(r.tier_source_url,'分级依据'));if(r.certification){const cert=document.createElement('small');cert.textContent=r.certification;el.append(cert,link(r.certification_url,'认证来源'));}return el;}
function render(){
 const isFair=kind==='fairs';$('expo-table').dataset.kind=kind;$('add-entry').textContent=isFair?'新增展会':'新增展商';$('tab-fairs').textContent='展会库（'+fairs.length+'）';$('tab-exhibitors').textContent='展商目录'+(exhibitorsLoaded?'（'+exhibitors.length+'）':'');
 for(const id of ['fair-filter-label','type-filter-label','tag-filter-label','select-filtered','clear-selection','bulk-open','bulk-to-crm','expo-contact-complete'])$(id).hidden=isFair;$('period-label').hidden=!isFair;
 for(const k of ['fairs','exhibitors'])$('tab-'+k).setAttribute('aria-pressed',String(k===kind));
 const fairById=new Map(fairs.map(r=>[r.id,r]));
 visible=filterEntries(isFair?fairs:exhibitors.map(r=>({...r,...Object.fromEntries(['edition','starts_on','region','category','tier','exhibition_type','source_platform'].map(k=>[k,fairById.get(r.exhibition_id)?.[k]]))})),{category:$('category-filter').value,region:$('region-filter').value,tier:$('tier-filter').value,exhibitionType:$('exhibition-type-filter').value,platform:$('platform-filter').value,year:$('year-filter').value,query:$('query').value,country:$('country-filter').value,industry:$('industry-filter').value,status:$('status-filter').value,type:isFair?'':$('type-filter').value,exhibition:isFair?'':$('fair-filter').value,tag:isFair?'':$('tag-filter').value,period:isFair?$('period-filter').value:''});
 const paging=pager.update(visible.length,page);page=paging.page;pageRows=visible.slice(paging.start,paging.end);$('table-head').replaceChildren();const tr=document.createElement('tr');
 const columns=isFair?['展会 / 届次','时间','国家 / 城市','分类 / 级别','场馆 / 主办方','来源与目录','核实 / 目录状态','自动更新','操作']:['选择','公司 / 所属展会','国家 / 城市','行业','产品 / 服务','企业类型','标签','展位 / 目录届次','联系人','邮箱','电话','来源','核实状态','操作'];
 for(const title of columns){const th=document.createElement('th');if(title==='选择'){const input=document.createElement('input');input.type='checkbox';input.setAttribute('aria-label','选择本页展商');input.checked=pageRows.length>0&&pageRows.every(r=>selected.has(r.id));input.indeterminate=pageRows.some(r=>selected.has(r.id))&&!input.checked;input.disabled=busy;input.onchange=()=>{pageRows.forEach(r=>input.checked?selected.add(r.id):selected.delete(r.id));render();};th.append(input);}else th.textContent=title;tr.append(th);}$('table-head').append(tr);$('rows').replaceChildren();const byId=new Map(fairs.map(r=>[r.id,r]));
 for(const r of pageRows){const row=document.createElement('tr'),actions=td(''),box=document.createElement('div');box.className='expo-row-actions';box.append(button('编辑',()=>openEditor(r)));if(isFair){box.append(button('查看展商',()=>switchKind('exhibitors',r.id)),button('采集详情',()=>auto.open(r)));const sources=td('');sources.append(link(r.source_url,r.source_platform||'来源'),document.createTextNode(' · '),link(r.discovery_url,'平台收录'),document.createTextNode(' · '),link(r.directory_url,'展商目录'));row.append(td(r.name+' · '+r.edition),td([r.starts_on||'日期待定',r.ends_on].filter(Boolean).join(' 至 ')),td([countryLabel(r.country),r.city].filter(Boolean).join(' / ')),classificationCell(r),td([r.venue,r.organizer].filter(Boolean).join(' / ')),sources,td(r.status+' / '+r.directory_status),td(r.auto_update===false?'已暂停':(r.last_crawl_status||'待首次采集')+(r.last_crawled_at?' · '+new Date(r.last_crawled_at).toLocaleDateString('zh-CN',{timeZone:'Asia/Shanghai'}):'')));}
 else{const follow=button(r.crm_company_id?'打开客户跟进':'转入客户跟进',()=>transferToCrm('exhibitor',r,follow));follow.disabled=busy||(!r.crm_company_id&&(r.status==='失效'||!r.catalog_edition||r.catalog_edition==='待核实'));box.append(follow);const check=td(''),input=document.createElement('input');input.type='checkbox';input.setAttribute('aria-label','选择 '+r.company_name);input.checked=selected.has(r.id);input.disabled=busy;input.onchange=()=>{input.checked?selected.add(r.id):selected.delete(r.id);render();};check.append(input);const company=td(r.company_name),small=document.createElement('small'),fair=byId.get(r.exhibition_id);small.textContent=fair?fair.name+' · '+fair.edition:'所属展会待核对';company.append(small);const sources=td('');sources.append(link(r.source_url,'目录来源'),document.createTextNode(' · '),link(r.website,'官网'));row.append(check,company,td([countryLabel(r.country),r.city].filter(Boolean).join(' / ')),td(r.industry),td(r.products),td(r.company_type),td((r.tags||[]).join('、')),td([r.booth,r.catalog_edition].filter(Boolean).join(' / ')),contactCell(r,'person'),contactCell(r,'email'),contactCell(r,'phone'),sources,td(r.status+(r.verified_on?' · '+r.verified_on:'')));}actions.append(box);row.append(actions);$('rows').append(row);}
 $('summary').textContent='筛选 '+visible.length+' 条'+(!isFair?' · 已选 '+selected.size+' 条':'');$('empty').hidden=visible.length>0;$('bulk-open').disabled=busy||!selected.size;$('bulk-to-crm').disabled=busy||!selected.size;
}
async function switchKind(value,fairId){if(busy)return;kind=value;page=1;selected.clear();for(const id of ['query','category-filter','region-filter','tier-filter','exhibition-type-filter','platform-filter','country-filter','industry-filter','status-filter','type-filter','tag-filter','period-filter'])$(id).value='';fillFilters();$('fair-filter').value=fairId||'';render();if(value==='exhibitors'&&!exhibitorsLoaded)await load();}
function lock(value){busy=value;for(const el of document.querySelectorAll('main button,main select,main input,dialog button,dialog input,dialog select,dialog textarea'))el.disabled=value;if(!value){$('import-confirm').disabled=!plan?.accepted.length||!!plan?.errors.length;render();}}
function openEditor(row){editing=row||null;const fields=kind==='fairs'?fairFields:exhibitorFields;$('entry-fields').replaceChildren();$('entry-title').textContent=(row?'编辑':'新增')+(kind==='fairs'?'展会':'展商');$('entry-error').textContent='';
 const make=(key,label,values)=>{const wrapper=document.createElement('label');wrapper.textContent=label;let input;if(values){input=document.createElement('select');for(const v of values)input.append(option(v));}else if(['notes','products','tier_basis'].includes(key)){input=document.createElement('textarea');input.rows=3;wrapper.className='wide';}else{input=document.createElement('input');input.type=key.endsWith('_on')?'date':['website','directory_url','source_url','discovery_url','tier_source_url','certification_url'].includes(key)?'url':key==='email'?'email':'text';}input.name=key;input.required=['name','company_name','source_url','exhibition_id'].includes(key);input.value=Array.isArray(row?.[key])?row[key].join(';'):row?.[key]??(values?values[0]:'');wrapper.append(input);$('entry-fields').append(wrapper);return input;};
 if(kind==='exhibitors'){const select=make('exhibition_id','所属展会',[]);for(const fair of fairs)select.append(option(fair.id,fair.name+' · '+fair.edition));select.value=row?.exhibition_id||$('fair-filter').value||fairs[0]?.id||'';}
 if(kind==='fairs'){const label=document.createElement('label');label.className='wide expo-auto-setting';label.textContent='允许自动更新此展会';const input=document.createElement('input');input.type='checkbox';input.name='auto_update';input.checked=row?.auto_update!==false;label.prepend(input);$('entry-fields').append(label);}
 for(const [key,label] of Object.entries(fields))make(key,label,key==='category'?exhibitionCategories:key==='tier'?exhibitionTiers:key==='exhibition_type'?exhibitionTypes:key==='status'?statuses():key==='company_type'?companyTypes:key==='directory_status'?['未收集','收集中','待核实','已整理']:null);if(kind==='exhibitors'){
  const extraFields=[
   ['extra_emails','其他邮箱（每行一个）'],
   ['extra_phones','其他电话（每行一个）'],
   ['extra_people','其他联系人（每行一个）']
  ];
  for(const [key,label] of extraFields){
   const wrap=document.createElement('label');wrap.className='wide';wrap.textContent=label;
   const field=document.createElement('textarea');field.name=key;field.rows=2;
   field.placeholder='每行一条，可补充多个；已有联系方式会保留';
   wrap.append(field);$('entry-fields').append(wrap);
  }
 }
 $('entry-dialog').showModal();
}
$('entry-form').onsubmit=async event=>{event.preventDefault();if(busy)return;const form=Object.fromEntries(new FormData(event.target));let data;try{data=validateEntry(form,kind,form.exhibition_id);if(kind==='exhibitors')data.contacts=mergeExhibitorContacts({...editing,...data,contacts:editing?.contacts||[]},{
  emails:form.extra_emails,phones:form.extra_phones,people:form.extra_people
});if(kind==='fairs')data.auto_update=form.auto_update==='on';if(editing?.status===data.status)data.verified_on=editing.verified_on;const existing=kind==='fairs'?fairs:exhibitors;if(existing.some(r=>r.id!==editing?.id&&identity(r,kind)===identity(data,kind)))throw Error('已有相同展会或展商，请编辑现有记录。');}catch(error){$('entry-error').textContent=error.message;return;}lock(true);try{const rows=await cloudRequest(tables[kind]+(editing?'?id=eq.'+editing.id:''),{method:editing?'PATCH':'POST',headers:{Prefer:'return=representation'},body:JSON.stringify(data)});if(rows.length!==1)throw Error('未能保存，请刷新后核对权限。');$('entry-dialog').close();await load();$('notice').textContent='记录已保存。';}catch(error){$('entry-error').textContent=error.message;}finally{lock(false);}};
function download(text,name){const url=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('import-open').onclick=()=>{if(busy)return;if(kind==='exhibitors'&&!$('fair-filter').value){$('notice').textContent='请先在“所属展会”选择一个展会，再导入该展会的展商目录。';return;}plan=null;$('import-file').value='';$('import-summary').textContent='';$('import-preview').textContent='';$('import-error').textContent='';$('import-confirm').disabled=true;$('import-context').textContent=kind==='fairs'?'导入展会库':'导入到：'+$('fair-filter').selectedOptions[0].textContent;$('import-dialog').showModal();};
$('download-template').onclick=()=>download(entriesCSV([],kind),(kind==='fairs'?'展会':'展商')+'导入模板.csv');
$('import-file').onchange=async()=>{plan=null;$('import-confirm').disabled=true;$('import-error').textContent='';try{const file=$('import-file').files[0];if(!file)return;if(file.size>5e6)throw Error('文件不能超过5MB。');if(!file.name.toLowerCase().endsWith('.csv'))throw Error('请选择 UTF-8 CSV 文件。');plan=importPlan(await file.text(),kind,kind==='fairs'?fairs:exhibitors,$('fair-filter').value);$('import-summary').textContent=`共${plan.total}条，可导入${plan.accepted.length}条，重复${plan.duplicates}条，错误${plan.errors.length}条。`;$('import-preview').textContent=plan.accepted.slice(0,8).map(r=>[r.name||r.company_name,countryLabel(r.country),r.industry,r.company_type||'',r.source_url].filter(Boolean).join(' / ')).join('\n');$('import-error').textContent=plan.errors.slice(0,10).join('\n');$('import-confirm').disabled=!plan.accepted.length||!!plan.errors.length;}catch(error){$('import-error').textContent=error.message;}};
$('import-confirm').onclick=async()=>{if(busy||!plan?.accepted.length||plan.errors.length)return;lock(true);let saved=0;try{for(let i=0;i<plan.accepted.length;i+=100){const batch=plan.accepted.slice(i,i+100),rows=await cloudRequest(tables[kind],{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify(batch)});if(rows.length!==batch.length)throw Error('导入结果不完整，请刷新核对。');saved+=rows.length;$('import-summary').textContent='已保存 '+saved+' / '+plan.accepted.length+' 条。';}plan=null;$('import-dialog').close();await load();$('notice').textContent='已导入 '+saved+' 条，均为待核实。';}catch(error){plan=null;$('import-error').textContent='已保存 '+saved+' 条；'+error.message+' 请关闭并刷新后重新导入，已保存的记录将跳过。';}finally{lock(false);}};
$('bulk-type').replaceChildren(option('','不修改'),...companyTypes.map(v=>option(v)));$('bulk-open').onclick=()=>{if(busy||!selected.size)return;$('bulk-form').reset();$('bulk-count').textContent='修改已选 '+selected.size+' 条展商；空白项保持原值。';$('bulk-error').textContent='';$('bulk-dialog').showModal();};
$('bulk-form').onsubmit=async event=>{event.preventDefault();if(busy)return;const data=Object.fromEntries(new FormData(event.target)),tags=data.tags.split(/[,，;；]/).map(t=>t.trim()).filter(Boolean);if(!data.industry.trim()&&!data.company_type&&!tags.length){$('bulk-error').textContent='请至少填写一个分类项。';return;}const targets=exhibitors.filter(r=>selected.has(r.id));lock(true);let saved=0;try{for(let offset=0;offset<targets.length;offset+=2000){const batch=targets.slice(offset,offset+2000),result=await cloudRequest('rpc/freight_exhibitors_classify',{method:'POST',body:JSON.stringify({p_ids:batch.map(r=>r.id),p_industry:data.industry.trim()||null,p_type:data.company_type||null,p_tags:tags})});const byId=new Map(batch.map(r=>[r.id,r]));for(const row of result){Object.assign(byId.get(row.id),row);selected.delete(row.id);saved++;}if(result.length!==batch.length)throw Error('部分展商未更新，请刷新核对权限。');}$('bulk-dialog').close();fillFilters();$('notice').textContent='已分类 '+saved+' 条展商。';}catch(error){$('bulk-error').textContent='已保存 '+saved+' 条；'+error.message;}finally{lock(false);}};
for(const [dialog,close] of [['entry-dialog','entry-close'],['import-dialog','import-close'],['bulk-dialog','bulk-close']]){$(close).onclick=()=>{if(!busy)$(dialog).close();};$(dialog).addEventListener('cancel',e=>{if(busy)e.preventDefault();});}
$('expo-contact-complete').onclick=async()=>{
 if(kind!=='exhibitors'||busy)return;
 const chosen=exhibitors.filter(r=>selected.has(r.id)&&r.website?.startsWith('https://')).slice(0,10);
 if(!chosen.length){$('notice').textContent='所选展商没有可检查的 HTTPS 官网。';return;}
 if(!confirm('从 '+chosen.length+' 家展商的公开官网补全缺失邮箱/电话？现有联系方式不会被覆盖，也不会自动发送邮件。'))return;
 const button=$('expo-contact-complete');button.disabled=true;
 let completed=0,added=0,failed=0;
 try{
  for(const row of chosen){
   try{
    const result=await appRequest('/api/lead-enrich',{method:'POST',body:JSON.stringify({action:'enrich-exhibitor',exhibitor_id:row.id})});
    if(result.error)throw Error(result.error);
    completed++;added+=result.added||0;
   }catch(e){failed++;}
   $('notice').textContent='展商官网补全进度 '+(completed+failed)+' / '+chosen.length+'；完成 '+completed+'、新增联系方式 '+added+'、失败 '+failed+'。';
  }
  await load();
  $('notice').textContent='本批展商已处理 '+chosen.length+' 家；新增公开联系方式 '+added+' 条，失败 '+failed+' 家。所有联系方式仍需人工核实。';
 }finally{button.disabled=false;}
};
$('add-entry').onclick=()=>{if(!busy)openEditor();};$('refresh').onclick=()=>{if(!busy)load();};$('tab-fairs').onclick=()=>switchKind('fairs');$('tab-exhibitors').onclick=()=>switchKind('exhibitors');
for(const id of ['query','year-filter','category-filter','region-filter','tier-filter','exhibition-type-filter','platform-filter','country-filter','industry-filter','status-filter','type-filter','tag-filter','fair-filter','period-filter'])$(id).addEventListener(id==='query'?'input':'change',()=>{page=1;selected.clear();render();});
$('clear-filters').onclick=()=>{for(const id of ['query','year-filter','category-filter','region-filter','tier-filter','exhibition-type-filter','platform-filter','country-filter','industry-filter','status-filter','type-filter','tag-filter','fair-filter','period-filter'])$(id).value='';page=1;selected.clear();render();};
$('select-filtered').onclick=()=>{visible.forEach(r=>selected.add(r.id));render();};$('clear-selection').onclick=()=>{selected.clear();render();};$('export').onclick=()=>download(entriesCSV(visible,kind),(kind==='fairs'?'展会':'展商')+'筛选结果.csv');
syncAuthShell();render();if(currentUser())load();
