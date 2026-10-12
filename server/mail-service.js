import {validEmail,validateMail} from '../src/mail-model.js';
const base='https://hcorkkudgicarsmexnqf.supabase.co';
const key='sb_publishable_nB2eShVqNNkND-zOSHYSnQ_Pf2xtBgp';
export const sender='benjamin@eurasiago.com';
export function smtpOptions(password){return {host:'smtp.feishu.cn',port:465,secure:true,auth:{user:sender,pass:password},tls:{minVersion:'TLSv1.2'},connectionTimeout:15000,greetingTimeout:15000,socketTimeout:30000,disableFileAccess:true,disableUrlAccess:true,logger:false,debug:false};}
export function makeService({fetcher=fetch,createTransport,password=process.env.SMTP_PASSWORD}={}){
 async function request(path,token,options={}){const res=await fetcher(base+path,{...options,headers:{apikey:key,Authorization:'Bearer '+token,'Content-Type':'application/json',...options.headers},signal:AbortSignal.timeout(15000)});const data=await res.json().catch(()=>null);if(!res.ok)throw Error('账号权限或数据库请求失败。');return data;}
 async function authorize(token){if(!token)throw Error('请先登录。');const user=await request('/auth/v1/user',token);const access=await request('/rest/v1/freight_mail_access?user_id=eq.'+encodeURIComponent(user.id)+'&select=user_id',token);if(access.length!==1)throw Error('账号未获邮件系统权限。');return user;}
 async function patch(id,data,token){return request('/rest/v1/freight_mail_messages?id=eq.'+encodeURIComponent(id),token,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify(data)});}
 async function send(id,token){
  await authorize(token);if(!password)throw Error('尚未配置飞书邮箱专用密码 SMTP_PASSWORD。');
  const drafts=await request('/rest/v1/freight_mail_messages?id=eq.'+encodeURIComponent(id)+'&select=*',token);if(drafts.length!==1||drafts[0].status!=='draft')throw Error('只可发送待发送草稿；请勿重复点击。');
  const d=drafts[0];validateMail(d.subject,d.body);if(!validEmail(d.recipient))throw Error('收件邮箱格式无效。');
  if(d.purpose==='测试'){if(d.recipient.toLowerCase()!==sender)throw Error('测试邮件只允许发给发信邮箱自身。');}
  else{const c=await request('/rest/v1/freight_contacts?id=eq.'+encodeURIComponent(d.contact_id||'')+'&select=*',token);if(c.length!==1||c[0].company_id!==d.company_id||c[0].channel!=='邮箱'||c[0].status!=='有效'||!c[0].email_allowed||c[0].value.trim().toLowerCase()!==d.recipient.toLowerCase())throw Error('收件人尚未核实或已停止邮件联系。');
   for(let offset=0;;offset+=500){const banned=await request('/rest/v1/freight_contacts?channel=eq.'+encodeURIComponent('邮箱')+'&email_allowed=eq.false&select=value&order=id.asc&limit=500&offset='+offset,token);if(banned.some(c=>c.value.trim().toLowerCase()===d.recipient.toLowerCase()))throw Error('该邮箱已停止邮件联系。');if(banned.length<500)break;}
  }
  const claimed=await request('/rest/v1/rpc/freight_mail_claim',token,{method:'POST',body:JSON.stringify({p_id:id})});if(claimed.length!==1)throw Error('邮件已由其他请求处理，请刷新记录。');
  const row=claimed[0];if(row.subject!==d.subject||row.body!==d.body||row.recipient!==d.recipient||row.contact_id!==d.contact_id||row.purpose!==d.purpose||row.company_id!==d.company_id){await patch(id,{status:'failed',error:'草稿在发送前已修改，请重新预览并新建草稿。'},token);throw Error('草稿已修改，请重新预览。');}
  let info;const transport=createTransport(smtpOptions(password));
  try{info=await transport.sendMail({from:{name:'Benjamin · Eurasiago',address:sender},replyTo:sender,to:row.recipient,subject:row.subject,text:row.body,messageId:`<${id}@eurasiago.com>`});if(!info.accepted?.length)throw Object.assign(Error('收件人被服务器拒绝'),{code:'EENVELOPE'});}
  catch(e){const failed=['EAUTH','EENVELOPE','EDNS'].includes(e.code)||(e.responseCode>=400&&e.responseCode<600);const message=failed?'发信服务器拒绝或连接失败，请检查邮箱配置。':'发送结果不确定，请先检查飞书已发送邮件，避免重复发送。';await patch(id,{status:failed?'failed':'unknown',error:message},token).catch(()=>{});throw Error(message);}
  finally{transport.close?.();}
  try{await patch(id,{status:'sent',sent_at:new Date().toISOString(),message_id:info.messageId,error:null},token);}catch{throw Error('服务器已接受邮件，但发送记录更新失败。请检查飞书邮件，勿重复发送。');}
  return {status:'sent',message_id:info.messageId};
 }
 return {authorize,send,configured:!!password};
}
