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
export function installBatchPricing({getFiltered,getSelected,getRows,getLatest,version,save,reload,render,suppliers,withEquipment=false,header}) {
 const existing=document.querySelector('#workspace .fcl-toolbar');
 const target=existing?.parentElement||document.querySelector('#workspace .panel');
 if(!target) return;
 const toolbar=document.createElement('div');
 toolbar.className='toolbar pricing-batch-toolbar';
 toolbar.innerHTML='<button type="button" class="secondary" data-filtered>选中筛选结果</button><button type="button" class="secondary" data-clear>清空选择</button><button type="button" class="secondary" data-edit>批量修改</button><span data-count></span>';
 const filterBar=target.querySelector('.fcl-toolbar');filterBar?.insertAdjacentElement('afterend',toolbar);
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
    if(newPrice!==null&&new Set(current.map(r=>r.quote.currency)).size>1)throw Error('所选记录包含不同币种，不能统一设置单价；请先按币种筛选。');
    const payload=current.map(r=>{
     const quote=structuredClone(r.quote);
     for(const k of ['container','equipment','validFrom','validUntil'])if(v[k])quote[k]=v[k];
     if(newPrice!==null)quote.price=newPrice;
     return version(r,{quote,supplier_id:v.supplier||r.supplier_id,status:'draft'});
    });
    if(!window.confirm('确认批量保存 '+payload.length+' 条修改吗？修改后为待确认，需核对并批量启用。'))return;
    for(let i=0;i<payload.length;i+=50)await save(payload.slice(i,i+50));
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
