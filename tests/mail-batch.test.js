import test from 'node:test';import assert from 'node:assert/strict';
import {makeBatchScheduler} from '../server/mail-batch-service.js';
import {draftSendPlan,mailStateMatches} from '../src/mail-drafts.js';
import {makeService} from '../server/mail-service.js';
const id=i=>'12345678-1234-1234-1234-'+String(i).padStart(12,'0');
test('提交并发上限为3且结果保持输入顺序',async()=>{
 let active=0,max=0;const schedule=makeBatchScheduler({service:{authorize:async()=>{},schedule:async(i,date)=>{active++;max=Math.max(max,active);await new Promise(r=>setTimeout(r,5));active--;return {status:'scheduled',scheduled_at:date};}},enqueue:async()=>{}});
 const ids=Array.from({length:10},(_,i)=>id(i));const result=await schedule({ids,mode:'now'},'fixture');assert.equal(max,3);assert.deepEqual(result.results.map(x=>x.id),ids);
});
test('同一批请求只进行一次账号核对，不跨服务实例复用',async()=>{
 let authCalls=0;const rows=new Map(Array.from({length:4},(_,i)=>[id(i),{id:id(i),status:'draft',company_id:'co',contact_id:'ct',recipient:'c@example.com',purpose:'开发客户',subject:'主题',body:'正文'}]));
 const fetcher=async(url,options)=>{const u=new URL(url);if(u.pathname==='/auth/v1/user'){authCalls++;return Response.json({id:'user'});}if(u.pathname.endsWith('/freight_mail_access'))return Response.json([{user_id:'user'}]);if(u.pathname.endsWith('/freight_contacts'))return Response.json(u.searchParams.has('id')?[{id:'ct',company_id:'co',channel:'邮箱',value:'c@example.com',status:'有效',email_allowed:true}]:[]);const row=rows.get(u.searchParams.get('id').slice(3));if(options.method==='PATCH')Object.assign(row,JSON.parse(options.body));return Response.json([row]);};
 const create=()=>makeService({fetcher,password:'fixture',workerSecret:'fixture',createTransport:()=>{throw Error('No SMTP');}}),service=create(),date=new Date(Date.now()+120000).toISOString();await Promise.all([0,1,2].map(i=>service.schedule(id(i),date,'fixture-token',async()=>{})));assert.equal(authCalls,1);await create().schedule(id(3),date,'fixture-token',async()=>{});assert.equal(authCalls,2);
});
test('队列和发送记录入口覆盖已排队及处理中，全部状态不隐藏草稿',()=>{assert.equal(mailStateMatches('scheduled','queue'),true);assert.equal(mailStateMatches('sending','queue'),true);assert.equal(mailStateMatches('draft','queue'),false);assert.equal(mailStateMatches('sent','sent'),true);assert.equal(mailStateMatches('failed','issues'),true);assert.equal(mailStateMatches('unknown','issues'),true);assert.equal(mailStateMatches('draft',''),true);});
test('后台批量提交验证账号，限制请求大小，去重编号并逐项保留失败',async()=>{
 let authorized=0;const scheduled=[];const scheduler=makeBatchScheduler({now:()=>100000,enqueue:async()=>{},service:{authorize:async token=>{assert.equal(token,'fixture');authorized++;},schedule:async(i,date)=>{scheduled.push(i);assert.equal(date,new Date(220000).toISOString());if(i===id(2))throw Error('邮箱尚未核实');return {status:'scheduled',scheduled_at:date};}}});
 const result=await scheduler({ids:[id(1),id(1),id(2),id(3)],mode:'now'},'fixture');assert.equal(authorized,1);assert.deepEqual(scheduled,[id(1),id(2),id(3)]);assert.equal(result.results[0].status,'scheduled');assert.equal(result.results[1].error,'邮箱尚未核实');assert.equal(result.results[2].status,'scheduled');
 await assert.rejects(()=>scheduler({ids:Array.from({length:21},(_,i)=>id(i)),mode:'now'},'fixture'));await assert.rejects(()=>scheduler({ids:['not-a-uuid'],mode:'now'},'fixture'));
});
test('拒绝未授权请求且未来时间会保留为指定的日期',async()=>{
 let calls=0;const scheduler=makeBatchScheduler({now:()=>100000,enqueue:async()=>{},service:{authorize:async()=>{throw Error('未授权');},schedule:async()=>{calls++;}}});await assert.rejects(()=>scheduler({ids:[id(1)],mode:'now'},''));assert.equal(calls,0);
 const future=new Date(200000).toISOString(),good=makeBatchScheduler({now:()=>100000,enqueue:async()=>{},service:{authorize:async()=>{},schedule:async(i,date)=>({status:'scheduled',scheduled_at:date})}});assert.equal((await good({ids:[id(1)],mode:'scheduled',scheduled_at:future},'fixture')).results[0].scheduled_at,future);await assert.rejects(()=>good({ids:[id(1)],mode:'scheduled',scheduled_at:new Date(120000).toISOString()},'fixture'));
});
test('草稿发送计划排除未核实、停止联系、已发送、重复及联系人不匹配',()=>{
 const contacts=[{id:'a',company_id:'c',channel:'邮箱',value:'a@example.com',status:'有效',email_allowed:true},{id:'b',company_id:'c',channel:'邮箱',value:'b@example.com',status:'待核实',email_allowed:true},{id:'x',company_id:'other',channel:'邮箱',value:'A@EXAMPLE.COM',status:'有效',email_allowed:false}];
 const row={id:id(1),company_id:'c',contact_id:'a',recipient:'a@example.com',status:'draft',subject:'主题',body:'正文'};
 assert.equal(draftSendPlan([row],contacts).eligible.length,0);
 const active=contacts.slice(0,2),plan=draftSendPlan([row,{...row,id:id(2)},{...row,id:id(3),status:'sent'},{...row,id:id(4),contact_id:'b',recipient:'b@example.com'},{...row,id:id(5),company_id:'other'}],active);assert.equal(plan.eligible.length,1);assert.equal(plan.skipped.length,4);assert.deepEqual(plan.skipped.map(x=>x.reason),['重复邮箱','不是待发送草稿','邮箱尚未核实','联系人不匹配']);
});
