import {cloudRequest} from './cloud.js';
export const crmFollowupURL=id=>'/crm.html?company='+encodeURIComponent(id);
export async function transferToCrm(kind,row,button){
 if(row.crm_company_id){location.assign(crmFollowupURL(row.crm_company_id));return;}
 button.disabled=true;
 try{let result=await cloudRequest('rpc/freight_acquisition_to_crm',{method:'POST',body:JSON.stringify({p_kind:kind,p_id:row.id})});
  if(result.status==='possible_duplicate'){
   const found=await cloudRequest('freight_companies?id=eq.'+encodeURIComponent(result.company_id)+'&select=id,company_name');
   if(found.length!==1)throw Error('无法读取可能重复的客户，请刷新后核对。');
   if(!confirm('可能已有客户：'+found[0].company_name+'\n来源企业：'+(row.company_name||'')+'\n确认关联到此客户并统一跟进？已有档案和跟进记录将保留，只补充来源及未重复的公开联系方式。'))return;
   result=await cloudRequest('rpc/freight_acquisition_to_crm',{method:'POST',body:JSON.stringify({p_kind:kind,p_id:row.id,p_company_id:found[0].id})});
  }
  if(!result.company_id)throw Error('未返回客户档案，请刷新核对。');location.assign(crmFollowupURL(result.company_id));
 }catch(error){alert('转入客户失败：'+error.message);}finally{button.disabled=false;}
}
export function installExhibitorCrm(ctx){const button=document.getElementById('bulk-to-crm');button.onclick=async()=>{
 if(ctx.isBusy())return;const rows=ctx.getRows().filter(r=>ctx.selected.has(r.id));if(!rows.length)return;
 ctx.lock(true);let imported=0,linked=0;const issues=[];
 try{for(const row of rows){if(row.crm_company_id){linked++;continue;}try{const r=await cloudRequest('rpc/freight_acquisition_to_crm',{method:'POST',body:JSON.stringify({p_kind:'exhibitor',p_id:row.id})});if(r.status==='possible_duplicate')issues.push(row.company_name+'：可能已有客户，请逐条确认关联');else if(r.company_id){imported++;ctx.selected.delete(row.id);}else issues.push(row.company_name+'：结果异常');}catch(e){issues.push(row.company_name+'：'+e.message);}document.getElementById('notice').textContent='正在转入客户：新增 '+imported+'，已有 '+linked+'，需核对 '+issues.length+'。';}await ctx.refresh();document.getElementById('notice').textContent='新增客户 '+imported+' 家，已有关联 '+linked+' 家，需核对 '+issues.length+' 家。'+issues.slice(0,4).join('；')+(issues.length>4?'；其余请逐条核对。':'');}finally{ctx.lock(false);}
 };}
