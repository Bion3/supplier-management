import {smtpOptions,sender} from './mail-service.js';
const allowed=new Set(['https://www.eurasiago.com','https://eurasiago.com']);
const endpoint='https://hcorkkudgicarsmexnqf.supabase.co/rest/v1/rpc/freight_inquiry_notice';
const key='sb_publishable_nB2eShVqNNkND-zOSHYSnQ_Pf2xtBgp';
export function createInquiryNotice({createTransport,fetcher=fetch,password=process.env.SMTP_PASSWORD,secret=process.env.MAIL_WORKER_SECRET}={}){
 return async request=>{
  const origin=request.headers.get('origin');
  const headers={'Cache-Control':'no-store','Vary':'Origin'};
  if(!allowed.has(origin))return Response.json({error:'Origin not allowed'},{status:403,headers});
  Object.assign(headers,{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type'});
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(request.method!=='POST')return Response.json({error:'Method not allowed'},{status:405,headers});
  if(!password||!secret)return Response.json({status:'unavailable'},{status:503,headers});
  async function rpc(id,action,status=null){
   const res=await fetcher(endpoint,{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({p_secret:secret,p_id:id,p_action:action,p_status:status}),signal:AbortSignal.timeout(10000)});
   if(!res.ok)throw Error('Notification storage unavailable');return res.json();
  }
  let id;
  try{
   const raw=await request.text();if(raw.length>200)return Response.json({error:'Request too large'},{status:413,headers});
   ({id}=JSON.parse(raw));if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id||''))return Response.json({error:'Invalid inquiry'},{status:400,headers});
   const claimed=await rpc(id,'claim');
   if(!claimed.lead)return Response.json({status:claimed.status||'unavailable'},{status:202,headers});
   const l=claimed.lead;
   // One SMTP message to customer and sales (CC), not two unrelated notifications.
   // The server selects recipients only from the claimed stored lead, never from request JSON.
   const customerEmail=typeof l.email==='string'?l.email.trim().toLowerCase():'';
   const validCustomer=/^[^\\s@<>\\r\\n]+@[^\\s@<>\\r\\n]+\\.[^\\s@<>\\r\\n]+$/.test(customerEmail)&&customerEmail.length<=254&&customerEmail!==sender.toLowerCase();
   const customer=validCustomer?customerEmail:null;
   const subject=`EurasiaGo Freight Inquiry · ${id.slice(0,8).toUpperCase()}`;
   const body=[
     'Thank you for contacting EurasiaGo. We have received your freight inquiry.',
     'Our team will reply to this email thread with the confirmed quotation.',
     '',
     `Inquiry reference: ${id}`,
     `Contact: ${l.contact_name||'-'}`,
     `Route: ${l.origin||'-'} → ${l.destination||'-'}`,
     `Cargo: ${l.cargo_desc||'-'}`,
     `Phone: ${l.phone||'-'}`,
     `Email: ${customer||'-'}`,
     '',
     '请直接回复本邮件，业务人员与客户可在同一邮件会话中继续沟通。',
     '上述询价已收悉，最终运费与服务条款以业务人员正式回复为准。'
   ].join('\\n');
   const transport=createTransport({...smtpOptions(password),connectionTimeout:5000,greetingTimeout:5000,socketTimeout:10000});
   let status='unknown';
   try{
    const info=await transport.sendMail({
      from:{name:'EurasiaGo Freight Team',address:sender},
      to:customer||sender,
      ...(customer?{cc:sender}:{}),
      replyTo:sender,
      subject,text:body,
      messageId:`<inquiry-${id}@eurasiago.com>`,
    });
    // Both recipients must be accepted when customer is included. Partial acceptance
    // is reported unknown to avoid automatic resend and duplicate customer messages.
    const accepted=new Set((info.accepted||[]).map(x=>x.toLowerCase()));
    status=customer?(accepted.has(customer)&&accepted.has(sender.toLowerCase())?'sent':'unknown'):(accepted.has(sender.toLowerCase())?'sent':'failed');
   }catch(e){status=['EAUTH','EENVELOPE','EDNS'].includes(e.code)?'failed':'unknown';}
   finally{transport.close?.();}
   await rpc(id,'finish',status);
   return Response.json({status},{status:status==='sent'?200:202,headers});
  }catch{return Response.json({status:'unconfirmed'},{status:503,headers});}
 };
}
