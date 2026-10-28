import test from 'node:test';
import assert from 'node:assert/strict';
import {quoteAuditRows,segmentLink} from '../src/cost-quote-audit.js';
test('FCL audit shows missing rail and links to its procurement price library',()=>{
 const a=quoteAuditRows({inputs:{transport:'fcl',truck:true,rent:true,equipment:'SOC'},result:{lines:[{name:'国内拖车',value:200,basis:'CNY 1400'},{name:'租箱基础费（不含超期）',value:600,basis:'USD 600'}],pending:['整箱铁路：未匹配适用报价'],complete:false}});
 assert.equal(a.segments.length,3);assert.equal(a.missing,1);
 assert.equal(a.segments.find(x=>x.key==='rail').link,'/fcl-rail.html');
 assert.equal(a.segments.find(x=>x.key==='rail').status,'review');
});
test('FCL audit lists present railway costs and unmatched conditions',()=>{
 const a=quoteAuditRows({inputs:{transport:'fcl',equipment:'COC',sources:{rail:{supplier_id:'abc'}}},result:{lines:[{name:'整箱铁路',value:8400,basis:'USD 8400/柜'}],pending:['整箱铁路：请核对条款','COC平衡费另询'],complete:false}});
 assert.equal(a.segments[0].amount,8400);
 assert.equal(a.segments[0].source,'abc');
 assert.equal(a.review,1);
 assert.deepEqual(a.unmatched,['COC平衡费另询']);
});
test('LCL audit preserves missing domestic pickup and linehaul',()=>{
 const a=quoteAuditRows({inputs:{transport:'lcl',scope:'door'},result:{lines:[{name:'拼箱铁路运费',value:180,basis:'180 USD/RT'}],pending:[],complete:false}});
 assert.equal(a.segments.length,3);assert.equal(a.missing,2);
 assert.equal(segmentLink('国内提货'),'/pickup-rates.html');
 assert.equal(segmentLink('国内干线'),'/rates.html');
});
test('LCL station audit excludes unrequested domestic pickup',()=>{
 const a=quoteAuditRows({inputs:{transport:'lcl',scope:'station'},result:{lines:[],pending:['拼箱铁路运费：缺少数据'],complete:false}});
 assert.equal(a.segments.length,1);
 assert.equal(a.segments[0].link,'/rail-rates.html');
});
