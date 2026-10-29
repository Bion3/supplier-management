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
   const validCustomer=/^[^\s@<>\r\n]+@[^\s@<>\r\n]+\.[^\s@<>\r\n]+$/.test(customerEmail)&&customerEmail.length<=254&&customerEmail!==sender.toLowerCase();
   const customer=validCustomer?customerEmail:null;
   const subject=`EurasiaGo Freight Inquiry [${id.slice(0,8).toUpperCase()}]`;
   // A website lead's 'message' is structured JSON. Do not print raw JSON,
   // escaped Unicode, or the complete form payload into customer email.
   let details={};
   try{const value=JSON.parse(l.message||'{}');if(value&&typeof value==='object'&&!Array.isArray(value))details=value;}catch{}
   const safe=(value,max=180)=>String(value??'-').replace(/[\\r\\n\\t]+/g,' ').trim().slice(0,max)||'-';
   const scope=safe(details.scope||'-',50);
   const shipment=safe(details.service||'-',20);
   const quantity=safe(details.quantity||'-',20);
   const cargo=safe(l.cargo_desc||'-',180);
   const memo=safe(details.notes||'',500);
   const lineItems=[
     ['Inquiry ID',id],
     ['Name',safe(l.contact_name,90)],
     ['Route',safe(l.origin,90)+' → '+safe(l.destination,90)],
     ['Mode',shipment],
     ['Service scope',scope],
     ['Quantity',quantity],
     ['Volume (CBM)',safe(l.volume_cbm||'-',20)],
     ['Weight (KG)',safe(l.weight_kg||'-',20)],
     ['Cargo',cargo],
     ...(memo?[['Remarks',memo]]:[])
   ];
   const text=[
     'Thank you for contacting EurasiaGo. Your freight inquiry has been received.',
     'Our team will respond in this email conversation. Use Reply All to keep everyone in the discussion.',
     '',
     ...lineItems.map(([label,value])=>`${label}: ${value}`),
     '',
     'This is an inquiry acknowledgment, not a final freight quotation.',
     '请使用“回复全部”继续沟通，正式运价和服务条款以业务人员回复为准。',
   ].join('\n');
   const escapeHtml=value=>String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
   const html=`<!doctype html><html><head><meta charset="UTF-8"></head><body style="font-family:Arial,'Microsoft YaHei',sans-serif;color:#243044;line-height:1.6;max-width:640px;margin:24px auto">
   <h2 style="color:#116b72">EurasiaGo · Freight inquiry received</h2>
   <p>Thank you for contacting us. Our team will reply in this email thread.</p>
   <p style="padding:10px;background:#f0f7f8"><strong>To continue the conversation, please use Reply All.</strong><br>请点击“回复全部”，客户和业务人员便可在同一邮件中沟通。</p>
   <table role="presentation" style="border-collapse:collapse;width:100%">${lineItems.map(([label,value])=>`<tr><th style="text-align:left;padding:9px;border-bottom:1px solid #e5e7eb;width:140px">${escapeHtml(label)}</th><td style="padding:9px;border-bottom:1px solid #e5e7eb">${escapeHtml(value)}</td></tr>`).join('')}</table>
   <p style="font-size:12px;color:#64748b">Indicative information only. Final freight and terms are subject to confirmation.</p>
   </body></html>`;
   const transport=createTransport({...smtpOptions(password),connectionTimeout:5000,greetingTimeout:5000,socketTimeout:10000});
   let status='unknown';
   try{
    const info=await transport.sendMail({
      from:{name:'EurasiaGo Freight Team',address:sender},
      to:customer||sender,
      ...(customer?{cc:sender}:{}),
      replyTo:sender,
      subject,text,html,
      textEncoding:'base64',
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
