import test from 'node:test';
import assert from 'node:assert/strict';
import {dailyOutreachPlan} from '../src/mail-daily.js';

const now=Date.parse('2026-11-13T02:00:00Z');
const companies=Array.from({length:15},(_,i)=>({id:'c'+i,company_name:'Company '+i,role:i===14?'同行':'直客',region:i===13?'浙江':'德国',development_stage:i===12?'暂不开发':'待开发'}));
const contacts=companies.map((c,i)=>({id:'e'+i,company_id:c.id,channel:'邮箱',value:`info${i}@example.com`,status:'有效',email_allowed:true}));

test('daily preparation caps at ten companies and excludes historical or unsuitable recipients',()=>{
 const messages=[{company_id:'c0',recipient:'info0@example.com',purpose:'开发客户',status:'sent',created_at:'2026-11-12T02:00:00Z'},
  {company_id:'c1',recipient:'info1@example.com',purpose:'开发客户',status:'unknown',created_at:'2026-11-13T01:00:00Z'}];
 const plan=dailyOutreachPlan(contacts,contacts,companies,messages,{now});
 assert.equal(plan.used,1);assert.equal(plan.remaining,9);assert.equal(plan.rows.length,9);
 assert.ok(plan.rows.every(c=>!['e0','e1','e12','e13','e14'].includes(c.id)));
});

test('daily preparation respects stop-contact duplicates and the daily cap',()=>{
 const rows=[contacts[2],{...contacts[2],id:'duplicate',value:'INFO2@example.com'},contacts[3]];
 const stopped={...contacts[2],id:'blocked',email_allowed:false};
 const messages=Array.from({length:10},(_,i)=>({company_id:'other'+i,recipient:`old${i}@example.com`,purpose:'开发客户',status:'sent',created_at:'2026-11-13T01:00:00Z'}));
 assert.equal(dailyOutreachPlan(rows,[...contacts,stopped],companies,[],{now}).rows.map(c=>c.id).join(','),'e3');
 assert.equal(dailyOutreachPlan(rows,contacts,companies,messages,{now}).rows.length,0);
});

test('the agent audience stays separate from direct customers',()=>{
 const agent={id:'agent',company_name:'Partner',role:'海外代理',region:'Poland',development_stage:'待开发'};
 const contact={id:'agent-mail',company_id:agent.id,channel:'邮箱',value:'team@partner.example',status:'有效',email_allowed:true};
 const plan=dailyOutreachPlan([...contacts,contact],[...contacts,contact],[...companies,agent],[],{now,audience:'海外代理'});
 assert.deepEqual(plan.rows.map(c=>c.id),['agent-mail']);
});
