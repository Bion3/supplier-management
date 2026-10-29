import {installCostGaps} from './cost-gaps.js';
import {cloudRequest} from './cloud.js';
import {latestCosts,prepareCostEnable} from './cost-enable-model.js';
export function installCostEnable({kind,table,getRows,getFiltered,getSelected=()=>[],reload,buttonId}){
 const gaps=installCostGaps({kind,table,getRows,getFiltered,reload});
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const button=buttonId?document.getElementById(buttonId):document.createElement('button');button.type='button';button.className='secondary';button.textContent='批量启用';
 if(!buttonId){const heading=document.querySelector('#workspace .heading');let actions=heading.lastElementChild;if(actions.tagName!=='DIV'){const box=document.createElement('div');actions.before(box);box.append(actions);actions=box;}actions.append(button);}
 const dialog=document.createElement('dialog');dialog.className='supplier-quote-dialog';document.body.append(dialog);let busy=false,snapshot=[],chosen=[];
 const selectedIds=()=>new Set(getSelected());
 function refresh(){gaps.refresh();const ids=selectedIds(),filtered=new Set(getFiltered().map(r=>r.id));button.disabled=busy||!latestCosts(getRows()).some(r=>r.status!=='confirmed'&&(ids.has(r.id)||filtered.has(r.id)));}
 function report(prepared,completed=false){return (completed?'':`<p>可启用 <strong>${prepared.ready.length}</strong> 条，跳过 ${prepared.skipped.length} 条。保留价格、费用、有效期和历史版本。</p><p>启用后可参与内部测算；官网可查还需开启“官网展示”并通过公开报价校验。</p>`)+(kind==='rail'?'<p>待确认费用与原表特殊规则继续保留；未完成计费核对的原表报价暂不进入自动核算。</p>':'')+(prepared.skipped.length?`<details><summary>查看跳过原因（${prepared.skipped.length}条）</summary><ul>${prepared.skipped.map(r=>`<li>${esc(r.origin)} → ${esc(r.destination)}：${esc(r.reason)}</li>`).join('')}</ul></details>`:'');}
 button.onclick=()=>{if(busy)return;const ids=selectedIds(),current=latestCosts(getRows());snapshot=current;chosen=current.filter(r=>ids.has(r.id)).map(r=>r.id);const filtered=getFiltered().map(r=>r.id);dialog.innerHTML=`<form><div class="dialog-heading"><h2>批量启用成本</h2><button type="button" data-close class="secondary">关闭</button></div><label>启用范围<select name="scope"><option value="selected" ${!chosen.length?'disabled':''}>已勾选 ${chosen.length} 条</option><option value="filtered">全部筛选结果 ${filtered.length} 条（跨页）</option></select></label><div data-preview></div><p role="alert" data-error></p><footer><button type="submit">确认批量启用</button></footer></form>`;
  const form=dialog.querySelector('form'),scope=form.elements.scope,submit=form.querySelector('[type=submit]');scope.value=chosen.length?'selected':'filtered';const idsForScope=()=>scope.value==='selected'?chosen:filtered;
  const preview=()=>{const set=new Set(idsForScope()),prepared=prepareCostEnable(snapshot.filter(r=>set.has(r.id)),kind);form.querySelector('[data-preview]').innerHTML=report(prepared);submit.disabled=!prepared.ready.length;};scope.onchange=preview;preview();form.querySelector('[data-close]').onclick=()=>dialog.close();
  form.onsubmit=async event=>{event.preventDefault();if(busy||submit.disabled)return;busy=true;submit.disabled=true;button.disabled=true;let savedCount=0;try{const ids=new Set(idsForScope());await reload();const current=latestCosts(getRows()),matches=current.filter(r=>ids.has(r.id)),prepared=prepareCostEnable(matches,kind);for(const id of ids)if(!matches.some(r=>r.id===id))prepared.skipped.push({origin:'已更新记录',destination:'',reason:'请刷新后重新选择'});if(!prepared.ready.length)throw Error('没有可启用记录，请关闭后重新选择');
   for(let i=0;i<prepared.ready.length;i+=50){const saved=await cloudRequest(table,{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify(prepared.ready.slice(i,i+50))});savedCount+=saved.length;if(saved.length!==prepared.ready.slice(i,i+50).length)throw Error('保存数量异常，请刷新核对');}
   await reload();form.querySelector('[data-preview]').innerHTML=`<p>已启用 <strong>${savedCount}</strong> 条；跳过 ${prepared.skipped.length} 条。</p>`+report({ready:[],skipped:prepared.skipped},true);submit.hidden=true;scope.disabled=true;document.getElementById('notice').textContent=`已批量启用 ${savedCount} 条成本（内部测算可用；官网展示需单独开启）${prepared.skipped.length?'，跳过 '+prepared.skipped.length+' 条（详情见弹窗）':''}。`;
  }catch(error){form.querySelector('[data-error]').textContent=(savedCount?'已保存 '+savedCount+' 条。':'')+error.message;try{await reload();}catch{}submit.hidden=true;}finally{busy=false;refresh();}};dialog.showModal();
 };
 document.addEventListener('input',()=>queueMicrotask(refresh));document.addEventListener('change',()=>queueMicrotask(refresh));
 return {refresh};
}
