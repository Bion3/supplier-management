import {mailContent} from '../src/mail-content.js';
import {smtpOptions,sender} from './mail-service.js';
import {validateMail,validEmail} from '../src/mail-model.js';
import {queueOptions} from '../src/mail-rules.js';
const url='https://hcorkkudgicarsmexnqf.supabase.co/rest/v1/rpc/freight_mail_worker';
const key='sb_publishable_nB2eShVqNNkND-zOSHYSnQ_Pf2xtBgp';
export function makeWorker({fetcher=fetch,enqueue,createTransport,secret=process.env.MAIL_WORKER_SECRET,password=process.env.SMTP_PASSWORD,now=()=>Date.now()}={}){
 async function rpc(action,id,result={}){if(!secret)throw Error('Worker configuration missing');const response=await fetcher(url,{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({p_secret:secret,p_action:action,p_id:id,p_result:result}),signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('Worker database request failed');return response.json();}
 async function later(id,date){await enqueue('freight-mail',{id},queueOptions(id,date,now()));}
 return async function process(message){if(!/^[0-9a-f-]{36}$/i.test(message.id||''))return;
  const data=await rpc('get',message.id);if(data.in_progress_until){await later(message.id,data.in_progress_until);return;}if(!data.row)return;const row=data.row;
  if(new Date(row.scheduled_at).getTime()>now()){await later(row.id,row.scheduled_at);return;}
  if(!password)throw Error('SMTP configuration missing');
  try{validateMail(row.subject,row.body);if(!validEmail(row.recipient))throw Error('Invalid recipient');}catch{throw Error('Invalid scheduled mail');}
  const claimed=await rpc('claim',row.id);if(claimed.deferred_until){await later(row.id,claimed.deferred_until);return;}if(claimed.not_due){await later(row.id,claimed.not_due);return;}if(!claimed.row)return;
  const m=claimed.row;try{validateMail(m.subject,m.body);if(!validEmail(m.recipient))throw Error();}catch{await rpc('finish',m.id,{status:'failed',error:'定时草稿内容无效，请重新预览'});return;}let info;const transport=createTransport(smtpOptions(password));
  try{info=await transport.sendMail({from:{name:'Benjamin · Eurasiago',address:sender},replyTo:sender,to:m.recipient,subject:m.subject,...mailContent(m.body),messageId:`<${m.id}@eurasiago.com>`});if(!info.accepted?.length)throw Object.assign(Error('Rejected'),{code:'EENVELOPE'});}
  catch(e){const failed=['EAUTH','EENVELOPE','EDNS'].includes(e.code)||(e.responseCode>=400&&e.responseCode<600);await rpc('finish',m.id,{status:failed?'failed':'unknown',error:failed?'发信服务器拒绝或连接失败':'结果不确定，请核查飞书邮件，避免重复发送'});return;}
  finally{transport.close?.();}
  await rpc('finish',m.id,{status:'sent',message_id:info.messageId});
 };
}

