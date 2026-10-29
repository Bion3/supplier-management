import test from 'node:test';
import assert from 'node:assert/strict';
import {createInquiryNotice} from '../server/inquiry-notice.js';
const id='00000000-0000-4000-8000-000000000001';
const request=(origin='https://www.eurasiago.com',method='POST')=>new Request('https://crm.eurasiago.com/api/mail?_inquiry=1',{method,headers:{origin,'Content-Type':'application/json'},...(method==='POST'?{body:JSON.stringify({id})}:{})});
test('reject foreign origins and missing configuration without sending',async()=>{
 const run=createInquiryNotice();assert.equal((await run(request('https://bad.example'))).status,403);assert.equal((await run(request())).status,503);
});
test('preflight allows only the website',async()=>{assert.equal((await createInquiryNotice()(request(undefined,'OPTIONS'))).status,204);});
test('one shared email to customer and business inbox, with reply headers and status',async()=>{
 let mail,sent=0;const calls=[];
 const run=createInquiryNotice({password:'test',secret:'test',fetcher:async(_url,options)=>{const body=JSON.parse(options.body);calls.push(body);return Response.json(body.p_action==='claim'?{lead:{contact_name:'Test',email:'customer@example.com',origin:'Shanghai',destination:'Hamburg'}}:{});},createTransport:()=>({sendMail:async value=>{mail=value;sent++;return {accepted:['customer@example.com','benjamin@eurasiago.com']};},close(){}})});
 assert.equal((await run(request())).status,200);assert.equal(sent,1);assert.equal(mail.to,'customer@example.com');assert.equal(mail.cc,'benjamin@eurasiago.com');assert.equal(mail.replyTo,'benjamin@eurasiago.com');assert.match(mail.subject,/EurasiaGo Freight Inquiry/);assert.match(mail.text,/Shanghai.*Hamburg/);assert.equal(calls[1].p_status,'sent');assert.equal(mail.html,undefined);
});
test('phone-only inquiry notifies staff without sending to customer',async()=>{
 let mail;const run=createInquiryNotice({password:'test',secret:'test',fetcher:async(_url,options)=>Response.json(JSON.parse(options.body).p_action==='claim'?{lead:{email:null,contact_name:'Phone'}}:{}),createTransport:()=>({sendMail:async value=>{mail=value;return {accepted:['benjamin@eurasiago.com']};},close(){}})});
 assert.equal((await run(request())).status,200);assert.equal(mail.to,'benjamin@eurasiago.com');assert.equal(mail.cc,undefined);
});
test('partial SMTP delivery is reported unknown, no unsafe automatic retry',async()=>{
 const calls=[];const run=createInquiryNotice({password:'test',secret:'test',fetcher:async(_url,options)=>{const body=JSON.parse(options.body);calls.push(body);return Response.json(body.p_action==='claim'?{lead:{email:'customer@example.com'}}:{});},createTransport:()=>({sendMail:async()=>({accepted:['customer@example.com']}),close(){}})});
 assert.equal((await run(request())).status,202);assert.equal(calls[1].p_status,'unknown');
});

test('duplicates do not send',async()=>{
 const run=createInquiryNotice({password:'test',secret:'test',fetcher:async()=>Response.json({status:'sent'}),createTransport:()=>{throw Error('must not send');}});
 assert.equal((await run(request())).status,202);
});
test('ambiguous SMTP failure is not retried',async()=>{
 const calls=[];const run=createInquiryNotice({password:'test',secret:'test',fetcher:async(_u,o)=>{const p=JSON.parse(o.body);calls.push(p);return Response.json(p.p_action==='claim'?{lead:{}}:{});},createTransport:()=>({sendMail:async()=>{throw Error('socket closed');},close(){}})});
 assert.equal((await run(request())).status,202);assert.equal(calls[1].p_status,'unknown');
});
