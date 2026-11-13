// Shared pricing controls. Keep every edit versioned; never rewrite historic quotations.
export const CONTAINER_OPTIONS=['20尺','40尺','40HQ','45HQ','2×20尺'];
export const EQUIPMENT_OPTIONS=['待确认','SOC','COC'];
export const containerChoices=(value='',blankLabel='待确认')=>[
 ['',blankLabel],
 ...CONTAINER_OPTIONS.map(v=>[v,v]),
 ...(value&&!CONTAINER_OPTIONS.includes(value)?[[value,value+'（历史值，请规范化）']]:[])
];
export const equipmentChoices=value=>[
 ...EQUIPMENT_OPTIONS.map(v=>[v,v]),
 ...(value&&!EQUIPMENT_OPTIONS.includes(value)?[[value,value+'（历史值）']]:[])
];
export function validateBatchPriceTargets(rows,newPrice){
 if(newPrice===null)return;
 if(!Number.isFinite(newPrice)||newPrice<=0)throw Error('采购单价必须大于0。');
 const currencies=new Set(rows.map(r=>r.quote.currency));
 if(currencies.size!==1||![...currencies][0])throw Error('所选记录币种不同或未确认，不能统一设置单价；请先按币种筛选。');
 const units=new Set(rows.map(r=>r.quote.unit));
 if(units.size!==1||![...units][0])throw Error('所选记录计价单位不同或未确认，不能统一设置单价；请先按计价单位筛选。');
}
export function buildBatchVersions(rows,changes,version){
 return rows.map(r=>{
  const quote=structuredClone(r.quote);
  for(const k of ['container','equipment','validFrom','validUntil'])if(changes[k])quote[k]=changes[k];
  if(changes.price!==null)quote.price=changes.price;
  return version(r,{quote,supplier_id:changes.supplier||r.supplier_id,status:'draft'});
 });
}
export function installBatchPricing({getFiltered,getSelected,getRows,getLatest,version,save,reload,render,suppliers,withEquipment=false,header}) {
 const existing=document.querySelector('#workspace .fcl-toolbar');
 const target=existing?.closest('.panel')||document.querySelector('#workspace .panel');
 if(!target) return;
 const toolbar=document.createElement('div');
 toolbar.className='toolbar pricing-batch-toolbar';
 toolbar.innerHTML='<button type="button" class="secondary" data-filtered>选中筛选结果</button><button type="button" class="secondary" data-clear>清空选择</button><button type="button" class="secondary" data-edit>批量修改</button><span data-count></span>';
 const filterBar=target.querySelector('.fcl-toolbar');(filterBar?.closest('.cost-more-filters')||filterBar)?.insertAdjacentElement('afterend',toolbar);
 const selection=getSelected();
 const sync=()=>{
  toolbar.querySelector('[data-count]').textContent='已选 '+selection.size+' 条（跨页）';
  toolbar.querySelector('[data-edit]').disabled=!selection.size;
 };
 toolbar.querySelector('[data-filtered]').onclick=()=>{for(const row of getFiltered())selection.add(row.id);render();sync();};
 toolbar.querySelector('[data-clear]').onclick=()=>{selection.clear();render();sync();};
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const opt=(v,label=v)=>'<option value="'+esc(v)+'">'+esc(label)+'</option>';
 toolbar.querySelector('[data-edit]').onclick=()=>{
  const ids=[...selection];
  if(!ids.length)return;
  const dialog=document.createElement('dialog');
  dialog.className='supplier-quote-dialog';
  dialog.innerHTML='<form><div class="dialog-heading"><h2>批量修改 '+ids.length+' 条'+esc(header||'价格')+'</h2><button type="button" class="secondary" data-close>关闭</button></div><p>只修改填写的字段，原始版本保留。箱型统一从固定选项选择。</p><div class="fields">'+
   '<label>供应商<select name="supplier">'+opt('','保持原值')+suppliers().map(s=>opt(s.id,s.name)).join('')+'</select></label>'+
   '<label>箱型<select name="container">'+opt('','保持原值')+CONTAINER_OPTIONS.map(v=>opt(v)).join('')+'</select></label>'+
   (withEquipment?'<label>用箱<select name="equipment">'+opt('','保持原值')+opt('SOC')+opt('COC')+'</select></label>':'')+
   '<label>采购单价（同金额、同币种批量覆盖）<input name="price" type="number" min="0.01" step="any" placeholder="留空保持原值"></label>'+
   '<label>有效期起<input name="validFrom" type="date"></label><label>有效期至<input name="validUntil" type="date"></label></div>'+
   '<p data-error role="alert"></p><footer><button type="submit">核对并保存新版本</button></footer></form>';
  document.body.append(dialog);
  dialog.querySelector('[data-close]').onclick=()=>dialog.close();
  dialog.onclose=()=>dialog.remove();
  const form=dialog.querySelector('form');
  form.onsubmit=async e=>{
   e.preventDefault();
   const btn=form.querySelector('[type=submit]');if(btn.disabled)return;
   btn.disabled=true;
   try{
    const v=Object.fromEntries(new FormData(form));
    if(!Object.values(v).some(x=>String(x).trim()))throw Error('请至少填写一个修改项目。');
    const newPrice=v.price===''?null:Number(v.price);
    if(newPrice!==null&&(!Number.isFinite(newPrice)||newPrice<=0))throw Error('采购单价必须大于0。');
    await reload();
    const current=getLatest(getRows()).filter(r=>ids.includes(r.id));
    if(current.length!==ids.length)throw Error('有价格已经更新，请重新选择后操作。');
    if(current.length>500)throw Error('每次最多修改500条。');
    validateBatchPriceTargets(current,newPrice);
    const payload=buildBatchVersions(current,{...v,price:newPrice},version);
    if(!window.confirm('确认批量保存 '+payload.length+' 条修改吗？修改后为待确认，需核对并批量启用。'))return;
    let savedCount=0;
    try{for(let i=0;i<payload.length;i+=50){const chunk=payload.slice(i,i+50);await save(chunk);savedCount+=chunk.length;}}
    catch(err){throw Error('已保存 '+savedCount+' 条，其余未完成：'+err.message);}
    selection.clear();await reload();dialog.close();
    const notice=document.getElementById('notice');if(notice)notice.textContent='批量修改 '+payload.length+' 条成功；新版本待确认，历史价保留。';
   }catch(err){form.querySelector('[data-error]').textContent=err.message;}
   finally{btn.disabled=false;}
  };
  dialog.showModal();
 };
 document.addEventListener('change',sync);document.addEventListener('input',sync);
 sync();
 return {sync};
}


// Navigation only: procurement values and historical records remain untouched.
export function costRouteGroup(row,kind='') {
 if(['domestic','trucking'].includes(kind))return '国内运输';
 const destination=String(row.destination||'').toLowerCase();
 const groups=[
 ['俄罗斯 / 白俄罗斯',/俄罗斯|白俄罗斯|莫斯科|圣彼得堡|叶卡|新西伯利亚|克列西哈|明斯克|布列斯特|moscow|moskva|petersburg|yekaterinburg|novosibirsk|minsk|brest/],
 ['中亚',/哈萨克|乌兹别克|吉尔吉斯|塔吉克|土库曼|阿拉木图|阿斯塔纳|塔什干|比什凯克|杜尚别|阿什哈巴德|阿腾科里|almaty|astana|tashkent|bishkek|altynkol/],
 ['伊朗 / 中东',/伊朗|德黑兰|阿富汗|海拉顿|海拉特|土耳其|伊斯坦布尔|tehran|iran|istanbul|hairatan|herat/],
 ['欧洲',/德国|波兰|荷兰|比利时|法国|英国|意大利|西班牙|捷克|匈牙利|汉堡|杜伊斯堡|马拉|华沙|罗兹|鹿特丹|安特卫普|巴黎|伦敦|米兰|布拉格|布达佩斯|汉诺威|hamburg|duisburg|malaszewicze|warsaw|lodz|rotterdam|antwerp|paris|london|milan|prague|budapest|tilbury/]
 ];
 return groups.find(([,re])=>re.test(destination))?.[0]||'其他 / 未归类';
}
export function filterCostRoutes(rows,{group='',origin='',destination=''}={},kind='') {
 return rows.filter(r=>(!group||costRouteGroup(r,kind)===group)&&(!origin||r.origin===origin)&&(!destination||r.destination===destination));
}
export function installCostRouteBrowser({kind,onChange}) {
 const workspace=document.getElementById('workspace');
 const toolbar=workspace?.querySelector('.panel .toolbar');
 if(!toolbar)return {apply:rows=>rows};
 const state={group:'',origin:'',destination:''};
 const box=document.createElement('section');box.className='cost-route-browser';
 const nativeGroup=toolbar.querySelector('#line-group-filter');
 const search=toolbar.querySelector('#search,#rail-search');
 if(search){const label=search.closest('label');label.classList.add('cost-primary-search');box.append(label);}
 const controls={};
 for(const [key,label] of [['group','航线分类'],['origin',['trucking','rental'].includes(kind)?'起始地 / 提箱地':'起运站'],['destination','目的地']]){
  if(key==='group'&&nativeGroup){box.append(nativeGroup.closest('label'));continue;}
  const field=document.createElement('label');field.textContent=label;const select=document.createElement('select');select.setAttribute('aria-label',label);field.append(select);box.append(field);controls[key]=select;
  select.onchange=()=>{state[key]=select.value;if(key==='group'){state.origin='';state.destination='';}if(key==='origin')state.destination='';onChange();};
 }
 const reset=document.createElement('button');reset.type='button';reset.className='secondary';reset.textContent='重置';reset.onclick=()=>{Object.keys(state).forEach(k=>state[k]='');for(const el of [...box.querySelectorAll('input,select'),...toolbar.querySelectorAll('input,select')]){if(Object.values(controls).includes(el))continue;if(el.tagName==='SELECT')el.selectedIndex=Math.max(0,[...el.options].findIndex(o=>o.defaultSelected));else el.value=el.defaultValue;}onChange();updateSummary();};box.append(reset);
 const count=document.createElement('small');count.setAttribute('aria-live','polite');box.append(count);toolbar.before(box);
 const details=document.createElement('details');details.className='cost-more-filters';const summary=document.createElement('summary');summary.textContent='更多筛选';details.append(summary);toolbar.before(details);details.append(toolbar);
 const updateSummary=()=>{const n=[...details.querySelectorAll('input,select')].filter(el=>el.tagName==='SELECT'?el.selectedIndex!==Math.max(0,[...el.options].findIndex(o=>o.defaultSelected)):el.value!==el.defaultValue).length;summary.textContent='更多筛选'+(n?' · 已设置 '+n+' 项':'');};details.addEventListener('input',updateSummary);details.addEventListener('change',updateSummary);updateSummary();
 // Keep the one canonical route filter and move existing controls, preserving listeners.
 if(nativeGroup)nativeGroup.addEventListener('change',()=>{state.origin='';state.destination='';onChange();});
 const lead=workspace.querySelector('.heading p');if(lead)lead.textContent='先选航线和起运站，再查看、更新或批量维护费用。';
 workspace.classList.add('cost-route-layout');
 function options(key,values){const select=controls[key];if(!select)return;select.replaceChildren(new Option('全部',''));const counts=new Map();for(const value of values)if(value)counts.set(value,(counts.get(value)||0)+1);for(const [value,n] of [...counts].sort(([a],[b])=>a.localeCompare(b,'zh-CN')))select.add(new Option(value+' · '+n,value));if(state[key]&&!counts.has(state[key]))state[key]='';select.value=state[key];}
 return {apply(rows){options('group',rows.map(r=>costRouteGroup(r,kind)));const grouped=filterCostRoutes(rows,{group:state.group},kind);options('origin',grouped.map(r=>r.origin));const origins=filterCostRoutes(grouped,{origin:state.origin},kind);options('destination',origins.map(r=>r.destination));const result=filterCostRoutes(rows,state,kind);count.textContent=result.length+' 条费用';return result;}};
}
