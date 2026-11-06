import test from 'node:test';
import assert from 'node:assert/strict';
import {assistantIntent,assistantFilters,regionVariants,mailDraft} from '../src/assistant-model.js';
import {findCustomers,taskSummary,mailSummary} from '../src/assistant-data.js';
import {loginDestination} from '../src/login-model.js';
test('customer query identifies country/stage/contact/source without treating missing email as contactable',()=>{
 assert.deepEqual(assistantFilters('查德国 ENF 有邮箱的待开发客户'),{region:'德国',contact:'verified-email',stage:'待开发',directory:'ENF'});
 assert.equal(assistantFilters('没有邮箱的波兰客户').contact,'missing-email');
 assert.equal(assistantFilters('暂不开发的同行客户').stage,'暂缓开发');
 assert.equal(assistantFilters('Turkey 客户').region,undefined);
 assert.equal(regionVariants({region:'德国'})[1].region,'Germany');
 assert.equal(assistantIntent('写邮件给德国客户'),'mail');
 assert.equal(assistantIntent('最近7天采集任务'),'tasks');
 assert.equal(assistantIntent('查询运价'),'cost');
});
test('bounded authenticated customer RPC merges bilingual overlaps without double-counting totals',async()=>{
 const calls=[];const result=await findCustomers(async(path,options)=>{const body=JSON.parse(options.body);calls.push({path,body});return {total:2,companies:[{id:'shared',company_name:'Both'},{id:body.p_filters.region,company_name:'Unique'}]};},{region:'德国',stage:'待开发'});
 assert.equal(calls.length,2);for(const c of calls){assert.equal(c.path,'rpc/freight_crm_page');assert.equal(c.body.p_limit,10);assert.equal(c.body.p_mode,'page');assert.equal(c.body.p_filters.stage,'待开发');}
 assert.equal(result.companies.length,3);assert.deepEqual(result.counts.map(c=>c.total),[2,2]);
});
test('tasks use China calendar boundary, cap output, and preserve failed-source uncertainty',async()=>{
 const paths=[];const result=await taskSummary(async path=>{paths.push(path);if(path.startsWith('lead_enrich_jobs'))throw Error('offline');if(path.startsWith('lead_map_search_jobs'))return Array.from({length:101},()=>({status:'completed',inserted:2,created_at:'2026-11-06T00:00:00Z'}));return [];},'today',new Date('2026-11-05T20:00:00Z'));
 assert.equal(result[0].total,100);assert.equal(result[0].leads,200);assert.equal(result[0].limited,true);assert.equal(result[1].error,true);assert.equal(result[2].total,0);
 for(const path of paths){assert.ok(path.includes(encodeURIComponent('2026-11-05T16:00:00.000Z')));assert.ok(path.endsWith('limit=101'));}
});
test('six fixed mail templates fill entered fields, retain signature and never invent a previous conversation',()=>{
 for(const language of ['en','zh'])for(const type of ['intro','followup','inquiry']){
  const draft=mailDraft({language,type,company:'Example',route:'Ningbo–Hamburg',cargo:'8 CBM / 5000 KG'});
  assert.ok(draft.subject.includes('Ningbo–Hamburg'));assert.ok(draft.body.includes('Example'));assert.ok(draft.body.includes('benjamin@eurasiago.com'));
  if(type==='inquiry')assert.ok(draft.body.includes('8 CBM / 5000 KG'));
  assert.doesNotMatch(draft.body,/following our previous|as agreed|根据之前|上次沟通/i);
 }
});
test('assistant login returns to protected assistant page while rejecting external redirects',()=>{
 assert.equal(loginDestination('/assistant.html','https://crm.eurasiago.com'),'/assistant.html');
 assert.equal(loginDestination('https://evil.example/assistant.html','https://crm.eurasiago.com'),'/hub.html');
});

test('mail overview reads bounded queues and matched replies without sending or reading bodies',async()=>{
 const paths=[];
 const result=await mailSummary(async(path,options)=>{assert.equal(options,undefined);paths.push(path);if(path.includes('status=eq.draft'))throw Error('offline');return Array.from({length:11},(_,id)=>({id}));});
 assert.equal(result[0].rows.length,10);assert.equal(result[0].limited,true);assert.equal(result[1].error,true);assert.equal(result[2].kind,'issues');assert.equal(result[3].kind,'replies');
 for(const path of paths){assert.ok(path.endsWith('&limit=11'));assert.ok(!path.includes('body'));}
 assert.ok(paths[0].includes('status=in.(scheduled,sending)'));assert.ok(paths[2].includes('delivery_status.like.bounce_*'));
 assert.ok(paths[3].includes('mail_kind=eq.normal&reply_message_id=not.is.null'));
 assert.equal(assistantIntent('查看客户回复'),'mail');assert.equal(assistantIntent('待发送邮件任务'),'mail');
});
