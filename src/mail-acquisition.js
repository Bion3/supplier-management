import {cloudRequest,currentUser} from './cloud.js';
export async function openAcquisitionMail(kind,rows,button){
 if(!rows.length)throw Error('请先选择客户。');
 const userId=currentUser()?.id;if(!userId)throw Error('请先登录。');
 const old=button?.textContent;if(button)button.disabled=true;
 try{
  const ids=[];
  for(const [index,row] of rows.entries()){
   if(currentUser()?.id!==userId)throw Error('账号已变化，请重新选择。');
   if(button)button.textContent=`准备收件人 ${index+1}/${rows.length}`;
   let id=kind==='company'?row.id:row.crm_company_id;
   if(!id){const result=await cloudRequest('rpc/freight_acquisition_to_crm',{method:'POST',body:JSON.stringify({p_kind:kind,p_id:row.id})});id=result.company_id;}
   if(!id)throw Error('客户关联失败，请刷新后重试。');ids.push(id);
  }
  if(currentUser()?.id!==userId)throw Error('账号已变化，请重新选择。');
  sessionStorage.setItem('mail-acquisition-selection',JSON.stringify({userId,companyIds:[...new Set(ids)],createdAt:Date.now()}));
  location.assign('/mail.html?from=acquisition');
 }finally{if(button){button.textContent=old;button.disabled=false;}}
}
