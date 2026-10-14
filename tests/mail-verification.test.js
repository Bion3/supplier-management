import test from 'node:test';
import assert from 'node:assert/strict';
import {verificationPlan} from '../src/mail-verification.js';
test('批量核实跨页并跳过无效格式和全局停止联系的重复邮箱',()=>{
 const rows=Array.from({length:215},(_,i)=>({id:'c'+i,channel:'邮箱',value:'c'+i+'@example.com',status:'待核实',email_allowed:true}));
 rows.push({id:'invalid',channel:'邮箱',value:'invalid',status:'待核实'},rows[0],{id:'phone',channel:'电话',value:'123'});
 const blocked={id:'blocked',channel:'邮箱',value:' C5@EXAMPLE.COM ',status:'失效',email_allowed:false};
 const plan=verificationPlan(rows,[...rows,blocked],'有效');
 assert.equal(plan.emails.length,216);assert.equal(plan.updates.length,214);assert.deepEqual(plan.skipped.map(c=>c.id),['c5','invalid']);
 assert.equal(plan.updates.some(c=>c.id==='blocked'),false);assert.equal(rows[0].status,'待核实');
});
test('保留已核实状态，支持批量恢复待核实及标为失效，不修改联系许可',()=>{
 const rows=[{id:'a',channel:'邮箱',value:'a@example.com',status:'有效',email_allowed:true},{id:'b',channel:'邮箱',value:'b@example.com',status:'失效',email_allowed:false}];
 assert.equal(verificationPlan(rows,rows,'有效').unchanged,1);assert.equal(verificationPlan(rows,rows,'有效').skipped.length,1);
 assert.equal(verificationPlan(rows,rows,'待核实').updates.length,2);assert.equal(verificationPlan(rows,rows,'失效').updates.length,1);
 assert.equal(rows[1].email_allowed,false);assert.throws(()=>verificationPlan(rows,rows,'未知状态'));
});
