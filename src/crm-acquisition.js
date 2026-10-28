import {cloudRequest} from './cloud.js';
export const crmFollowupURL=id=>'/crm.html?company='+encodeURIComponent(id);
export async function transferToCrm(kind,row,button){
 button.disabled=true;try{let id=row.crm_company_id;if(!id){const result=await cloudRequest('rpc/freight_acquisition_to_crm',{method:'POST',body:JSON.stringify({p_kind:kind,p_id:row.id})});id=result.company_id;}if(!id)throw Error('客户暂不可读取，请刷新重试。');location.assign(crmFollowupURL(id));}catch(e){alert('打开跟进失败：'+e.message);}finally{button.disabled=false;}
}
export function installExhibitorCrm(){const button=document.getElementById('bulk-to-crm');if(button)button.remove();}
