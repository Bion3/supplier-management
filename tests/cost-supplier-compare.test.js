import test from 'node:test';
import assert from 'node:assert/strict';
import {compareFclSuppliers,compareLclPlans} from '../src/cost-supplier-compare.js';
import {estimateFcl} from '../src/cost-unified-model.js';
const input={transport:'fcl',station:'西安',origin:'西安',destination:'汉堡',date:'2026-10-27',quantity:2,box:'40HQ',equipment:'COC',truck:false,rent:false,fx:7,eurFx:null,profitMode:'markup',profit:15,termsReviewed:true};
const rail=(id,supplier,price,currency='USD',fees=[])=>({id,origin:'西安',destination:'汉堡',supplier_id:supplier,status:'confirmed',quote:{container:'40HQ',equipment:'COC',scope:'站到站',unit:'柜',price,currency,fees,validFrom:'2026-11-01',validUntil:'2026-11-30'}});
test('multiple suppliers compared on same cargo with currency conversion and quote fees',()=>{
 const rates=[
  rail('a','supplier-A',9000),
  rail('b','supplier-B',56000,'CNY'),
  rail('c','supplier-C',7600,'USD',[{name:'THC',amount:600,currency:'USD',unit:'柜'}])
 ];
 const groups=compareFclSuppliers(input,{fcl:rates});
 assert.equal(groups.length,1);
 assert.equal(groups[0].quotes.length,3);
 assert.deepEqual(groups[0].quotes.map(q=>q.id),['b','c','a']);
 assert.deepEqual(groups[0].quotes.map(q=>q.amount),[16000,16400,18000]);
 assert.equal(groups[0].quotes[0].validity.status,'尚未生效');
 assert.equal(groups[0].quotes.filter(q=>q.selected).length,1);
 assert.equal(groups[0].quotes.find(q=>q.selected).id,'a');
 const switched=estimateFcl(input,{fcl:rates},{rail:'b'});
 assert.equal(switched.result.cost,16000);
 assert.equal(switched.inputs.sources.rail.id,'b');
});
test('unconfirmed, incomplete or missing cost never sorts ahead of complete supplier rate',()=>{
 const data={fcl:[rail('complete','s1',10000),rail('missing','s2',null),{...rail('draft','s3',3000),status:'draft'}]};
 const groups=compareFclSuppliers({...input,preview:true},data);
 assert.equal(groups[0].quotes[0].id,'complete');
 assert.equal(groups[0].quotes.at(-1).id,'missing');
 assert.equal(groups[0].quotes.find(q=>q.id==='missing').amount,null);
 assert.equal(groups[0].quotes.find(q=>q.id==='draft').complete,false);
});
test('LCL alternative supplier plans sorted by completed cost first',()=>{
 const plans=compareLclPlans([
 {id:'a',label:'A',result:{cost:250,complete:true,pending:[]}},
 {id:'b',label:'B',result:{cost:200,complete:false,pending:['运输费待补']}},
 {id:'c',label:'C',result:{cost:230,complete:true,pending:[]}}
 ]);
 assert.deepEqual(plans.map(p=>p.id),['c','a','b']);
});
