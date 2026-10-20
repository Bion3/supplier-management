import test from 'node:test';
import assert from 'node:assert/strict';
import {matchesListFilters,contactColumns} from '../src/list-filters.js';
test('组合筛选在分页前限定结果，日期边界包含当天且排除空日期',()=>{
 const fields=[{id:'company',get:r=>r.name},{id:'channel',type:'select',get:r=>r.channels},{id:'from',type:'from',get:r=>r.date},{id:'until',type:'until',get:r=>r.date}];
 const rows=[{name:'Poland Agent',channels:['email','phone'],date:'2026-10-20'},{name:'Other Agent',channels:['phone'],date:'2026-10-20'},{name:'Poland Old',channels:['email'],date:'2026-10-19'},{name:'Poland Missing',channels:['email'],date:null}];
 const values={company:'POLAND',channel:'email',from:'2026-10-20',until:'2026-10-20'};
 assert.deepEqual(rows.filter(r=>matchesListFilters(r,values,fields)),[rows[0]]);
 assert.equal(rows.filter(r=>matchesListFilters(r,{},fields)).length,4);
 assert.equal(matchesListFilters(rows[0],{channel:'mail'},fields),false);
});
test('客户联系人和联系方式完整分列，去重且不把电话当邮箱',()=>{
 const rows=[{name:'Wiktor',channel:'电话',value:'+48 601 540 280'},{name:'Wiktor',channel:'邮箱',value:'operations@goglob.eu'},{name:'Anna',channel:'邮箱',value:'anna@example.org'},{name:'Wiktor',channel:'电话',value:'+48 601 540 280'}];
 const result=contactColumns(rows);
 assert.equal(result.names,'Wiktor\nAnna');assert.equal(result.phone,'+48 601 540 280');assert.equal(result.email,'operations@goglob.eu\nanna@example.org');assert.equal(result.wechat,'');
});
