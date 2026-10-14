import test from 'node:test';import assert from 'node:assert/strict';
import {makeBatchScheduler,batchQueueOptions} from '../server/mail-batch-service.js';
import {makeBatchDispatcher} from '../server/mail-batch-dispatcher.js';
import {draftSendPlan,mailStateMatches} from '../src/mail-drafts.js';
import {makeService} from '../server/mail-service.js';
const id=i=>'12345678-1234-1234-1234-'+String(i).padStart(12,'0');
test('535封仅一次数据库安排及一次后台批次发布，保持逐项结果',async()=>{
 let authorized=0,prepared=0;const published=[];const schedule=makeBatchScheduler({now:()=>100000,enqueue:async(...args)=>published.push(args),service:{authorize:async()=>authorized++,prepareBatch:async(ids,date)=>{prepared++;assert.equal(date,new Date(220000).toISOString());return ids.map((id,i)=>i===1?{id,error:'邮箱尚未核实'}:{id,status:'scheduled',scheduled_at:date});}}});
 const ids=Array.from({length:535},(_,i)=>id(i)),result=await schedule({ids:[...ids,id(0)],mode:'now'},'fixture');assert.equal(authorized,1);assert.equal(prepared,1);assert.equal(published.length,1);assert.equal(published[0][0],'freight-mail-batches');assert.equal(published[0][1].ids.length,534);assert.equal(result.results.length,535);assert.ok(!published[0][1].ids.includes(id(1)));assert.ok(published[0][2].idempotencyKey);
 await assert.rejects(()=>schedule({ids:Array.from({length:1001},(_,i)=>id(i)),mode:'now'},'fixture'));await assert.rejects(()=>schedule({ids:['invalid'],mode:'now'},'fixture'));
});
test('未授权时不安排，指定日期保持不变',async()=>{
 let calls=0;const bad=makeBatchScheduler({service:{authorize:async()=>{throw Error('未授权');},prepareBatch:async()=>calls++},enqueue:async()=>{}});await assert.rejects(()=>bad({ids:[id(1)],mode:'now'},''));assert.equal(calls,0);
 const date=new Date(200000).toISOString(),good=makeBatchScheduler({now:()=>100000,service:{authorize:async()=>{},prepareBatch:async(ids,date)=>ids.map(id=>({id,status:'scheduled',scheduled_at:date}))},enqueue:async()=>{}});assert.equal((await good({ids:[id(1)],mode:'scheduled',scheduled_at:date},'fixture')).results[0].scheduled_at,date);await assert.rejects(()=>good({ids:[id(1)],mode:'scheduled',scheduled_at:new Date(120000).toISOString()},'fixture'));
});
test('发布失败恢复本批次，全部不可发送时不发布',async()=>{
 const restored=[];const schedule=makeBatchScheduler({service:{authorize:async()=>{},prepareBatch:async(ids,date)=>ids.map(id=>({id,status:'scheduled',scheduled_at:date})),restoreBatch:async(...args)=>restored.push(args)},enqueue:async()=>{throw Error('fixture failure');}});await assert.rejects(()=>schedule({ids:[id(1)],mode:'now'},'fixture'),/已恢复为草稿/);assert.deepEqual(restored[0][0],[id(1)]);
 let published=0;const empty=makeBatchScheduler({service:{authorize:async()=>{},prepareBatch:async(ids)=>ids.map(id=>({id,error:'不可发送'}))},enqueue:async()=>published++});await empty({ids:[id(1)],mode:'now'},'fixture');assert.equal(published,0);
});
test('后台分段分发535封，单段至多100封，发布并发至多5',async()=>{
 const jobs=[{ids:Array.from({length:535},(_,i)=>id(i)),scheduled_at:'2026-10-14T10:10:00Z'}],published=[];let active=0,max=0;
 const dispatch=makeBatchDispatcher({enqueue:async(topic,message,options)=>{active++;max=Math.max(max,active);await new Promise(r=>setTimeout(r,1));if(topic==='freight-mail')published.push({id:message.id,key:options.idempotencyKey});else jobs.push(message);active--;}});
 while(jobs.length)await dispatch(jobs.shift());assert.equal(published.length,535);assert.equal(new Set(published.map(x=>x.id)).size,535);assert.ok(max<=5);assert.equal(batchQueueOptions([id(1)],'2026-10-14T10:10:00Z').idempotencyKey,batchQueueOptions([id(1)],'2026-10-14T10:10:00Z').idempotencyKey);
 await assert.rejects(()=>dispatch({ids:['invalid'],scheduled_at:'2026-10-14'}));
});
test('账号核对仅复用于一个服务实例，批次RPC一次传入所有编号',async()=>{
 let auth=0,rpc=0;const fetcher=async(url,o)=>{const u=new URL(url);if(u.pathname==='/auth/v1/user'){auth++;return Response.json({id:'user'});}if(u.pathname.endsWith('/freight_mail_access'))return Response.json([{user_id:'user'}]);rpc++;const body=JSON.parse(o.body);assert.equal(body.p_ids.length,535);return Response.json(body.p_ids.map(id=>({id,status:'scheduled',scheduled_at:body.p_scheduled_at})));};
 const create=()=>makeService({fetcher,password:'fixture',workerSecret:'fixture',createTransport:()=>{throw Error('No SMTP');}}),service=create(),ids=Array.from({length:535},(_,i)=>id(i));await service.authorize('fixture');await service.prepareBatch(ids,new Date(Date.now()+120000).toISOString(),'fixture');assert.equal(auth,1);assert.equal(rpc,1);await create().authorize('fixture');assert.equal(auth,2);
});
test('草稿发送计划排除未核实、停止联系、已发送、重复及联系人不匹配',()=>{
 const contacts=[{id:'a',company_id:'c',channel:'邮箱',value:'a@example.com',status:'有效',email_allowed:true},{id:'b',company_id:'c',channel:'邮箱',value:'b@example.com',status:'待核实',email_allowed:true},{id:'x',company_id:'other',channel:'邮箱',value:'A@EXAMPLE.COM',status:'有效',email_allowed:false}],row={id:id(1),company_id:'c',contact_id:'a',recipient:'a@example.com',status:'draft',subject:'主题',body:'正文'};
 assert.equal(draftSendPlan([row],contacts).eligible.length,0);const plan=draftSendPlan([row,{...row,id:id(2)},{...row,id:id(3),status:'sent'},{...row,id:id(4),contact_id:'b',recipient:'b@example.com'},{...row,id:id(5),company_id:'other'}],contacts.slice(0,2));assert.equal(plan.eligible.length,1);assert.deepEqual(plan.skipped.map(x=>x.reason),['重复邮箱','不是待发送草稿','邮箱尚未核实','联系人不匹配']);
});
test('队列和发送记录快捷筛选完整覆盖状态',()=>{assert.equal(mailStateMatches('scheduled','queue'),true);assert.equal(mailStateMatches('sending','queue'),true);assert.equal(mailStateMatches('draft','queue'),false);assert.equal(mailStateMatches('sent','sent'),true);assert.equal(mailStateMatches('unknown','issues'),true);assert.equal(mailStateMatches('draft',''),true);});
