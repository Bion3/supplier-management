import test from 'node:test';import assert from 'node:assert/strict';
import {eligibleContacts,personalise,validateMail,validEmail} from '../src/mail-model.js';
import {makeService,smtpOptions,sender} from '../server/mail-service.js';
test('email eligibility handles verified status, duplicate addresses and optouts across companies',()=>{const c={id:'1',channel:'邮箱',status:'有效',email_allowed:true,value:'A@example.com'};assert.equal(eligibleContacts([c,{...c,id:'2',value:'a@example.com'}]).length,1);assert.equal(eligibleContacts([c,{...c,id:'2',email_allowed:false,value:'a@example.com'}]).length,0);assert.equal(eligibleContacts([{...c,status:'待核实'}]).length,0);assert.equal(validEmail('a@example.com\r\nBcc: x@y.com'),false);});
test('personalisation never invents names and rejects incomplete previews',()=>{assert.equal(personalise('您好{{name}}，{{company}}', {company_name:'客户公司'},{}),'您好，客户公司');assert.throws(()=>validateMail('标题\nBcc: x@y.com','正文'));assert.throws(()=>validateMail('标题','{{unknown}}'));assert.equal(smtpOptions('test').secure,true);});
function fixture({password='fixture',verified=true,blocked=false,claim=true,error,logFail=false}={}){
 const row={id:'12345678-1234-1234-1234-123456789012',status:'draft',contact_id:'c',company_id:'co',purpose:'维护客户',recipient:'customer@example.com',subject:'测试主题',body:'测试正文'};let sends=0,patches=[];
 const fetcher=async(url,opts)=>{
  let data;
  if(url.endsWith('/auth/v1/user'))data={id:'user'};
  else if(url.includes('freight_mail_access'))data=[{user_id:'user'}];
  else if(url.includes('freight_mail_claim'))data=claim?[{...row,status:'sending'}]:[];
  else if(url.includes('freight_contacts')&&url.includes('email_allowed=eq.false'))data=blocked?[{value:'CUSTOMER@example.com'}]:[];
  else if(url.includes('freight_contacts'))data=[{id:'c',company_id:'co',channel:'邮箱',status:verified?'有效':'待核实',email_allowed:true,value:row.recipient}];
  else if(opts.method==='PATCH'){const patch=JSON.parse(opts.body);patches.push(patch);if(logFail&&patch.status==='sent')return Response.json({}, {status:500});data=[{...row,...patch}];}
  else data=[row];
  return Response.json(data);
 };
 const service=makeService({fetcher,password,workerSecret:'fixture',createTransport:()=>({sendMail:async data=>{sends++;assert.equal(data.from.address,sender);if(error)throw error;return {accepted:[row.recipient],messageId:'mock-id'};},close(){}})});
 return {service,row,sends:()=>sends,patches};
}
test('missing password and unverified or blocked contacts cannot cause SMTP side effects',async()=>{for(const args of [{password:''},{verified:false},{blocked:true},{claim:false}]){const f=fixture(args);await assert.rejects(f.service.send(f.row.id,'fixture-token'));assert.equal(f.sends(),0);}});
test('accepted SMTP mail is recorded once; transport uncertainty is never reported as sent',async()=>{const f=fixture();assert.equal((await f.service.send(f.row.id,'fixture-token')).status,'sent');assert.equal(f.sends(),1);assert.equal(f.patches[0].status,'sent');const uncertain=fixture({error:Object.assign(Error('timeout'),{code:'ETIMEDOUT'})});await assert.rejects(uncertain.service.send(uncertain.row.id,'fixture-token'));assert.equal(uncertain.patches[0].status,'unknown');});
test('logging failure after SMTP acceptance does not retry transport',async()=>{const f=fixture({logFail:true});await assert.rejects(f.service.send(f.row.id,'fixture-token'),/勿重复发送/);assert.equal(f.sends(),1);});


test('schedule queues a future draft and cancel restores draft without SMTP',async()=>{const f=fixture();let queued=0;const date=new Date(Date.now()+3600000).toISOString();assert.equal((await f.service.schedule(f.row.id,date,'fixture',async(topic,payload)=>{assert.equal(topic,'freight-mail');assert.equal(payload.id,f.row.id);queued++;})).status,'scheduled');assert.equal(queued,1);assert.equal(f.sends(),0);assert.equal((await f.service.cancel(f.row.id,'fixture')).status,'draft');assert.equal(f.patches.at(-1).scheduled_at,null);});
test('queue failure restores draft and blocked contacts cannot schedule',async()=>{const f=fixture();await assert.rejects(f.service.schedule(f.row.id,new Date(Date.now()+3600000).toISOString(),'fixture',async()=>{throw Error('queue');}),/队列/);assert.equal(f.patches.at(-1).status,'draft');assert.equal(f.sends(),0);const blocked=fixture({blocked:true});await assert.rejects(blocked.service.schedule(blocked.row.id,new Date(Date.now()+3600000).toISOString(),'fixture',async()=>assert.fail()));});
