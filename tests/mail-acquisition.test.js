import test from 'node:test';
import assert from 'node:assert/strict';
import {outreachPlan,handoffContacts} from '../src/mail-acquisition-model.js';
import {filterRecipients} from '../src/mail-model.js';
const now=Date.parse('2026-10-29T08:00:00Z');
const contact=(id,company_id=id,extra={})=>({id,company_id,channel:'邮箱',value:id+'@example.com',status:'有效',email_allowed:true,...extra});
test('outreach independently skips blocked, unverified, duplicate and other company mailboxes',()=>{
 const chosen=[contact('a'),contact('b','a'),contact('dup','x',{value:' A@EXAMPLE.COM '}),contact('c','c',{status:'待核实'}),contact('d')];
 const result=outreachPlan(chosen,[...chosen,contact('ban','z',{value:'D@example.com',email_allowed:false})],[],{now,onePerCompany:true});
 assert.deepEqual(result.rows.map(c=>c.id),['a']);assert.deepEqual(result.skipped.map(x=>x.reason),['同公司其他邮箱','重复邮箱','邮箱待核实或已失效','停止联系或未允许联系']);
 assert.equal(outreachPlan(chosen,chosen,[],{onePerCompany:false,now}).rows.length,3);
});
test('recent sends may be explicitly followed up but queued and uncertain emails always skip',()=>{
 const contacts=['a','b','c','d','e'].map(id=>contact(id));
 const messages=[{recipient:'a@example.com',status:'sent',sent_at:new Date(now-86400000).toISOString()},{recipient:'b@example.com',status:'scheduled'},{recipient:'c@example.com',status:'unknown'},{recipient:'d@example.com',status:'sent',sent_at:new Date(now-31*86400000).toISOString()}];
 assert.deepEqual(outreachPlan(contacts,contacts,messages,{now}).rows.map(c=>c.id),['d','e']);
 assert.deepEqual(outreachPlan(contacts,contacts,messages,{now,recentDays:0}).rows.map(c=>c.id),['a','d','e']);
});
test('handoff only reads the same account and expires after thirty minutes',()=>{
 const h={userId:'u',createdAt:now,companyIds:['a']},contacts=[contact('a'),contact('b')];
 assert.deepEqual(handoffContacts(h,'u',contacts,now).map(c=>c.id),['a']);
 assert.equal(handoffContacts(h,'other',contacts,now),null);assert.equal(handoffContacts(h,'u',contacts,now+1800001),null);
 assert.equal(handoffContacts({...h,createdAt:now+1},'u',contacts,now),null);
});
test('mail filters use CRM stage, source, focus and company-level acquisition groups',()=>{
 const companies=[{id:'a',development_stage:'有意向',is_key_customer:true,source_refs:[{source:'exhibition'},'EU-20261013']},{id:'b',development_stage:'待开发'}];
 assert.deepEqual(filterRecipients([contact('a'),contact('b')],companies,{stage:'有意向',focus:'key',source:'展会展商',group:'EU-20261013'}).map(c=>c.id),['a']);
 assert.equal(filterRecipients([contact('a')],companies,{stage:'待开发'}).length,0);
});

test('multiple emails per company are allowed by default; identical addresses still deduplicate',()=>{
 const rows=[contact('a','same'),contact('b','same'),contact('copy','other',{value:'A@example.com'})];
 assert.deepEqual(outreachPlan(rows,rows,[],{now}).rows.map(c=>c.id),['a','b']);
});
