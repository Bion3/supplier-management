import test from 'node:test';
import assert from 'node:assert/strict';
import {estimateFcl} from '../src/cost-unified-model.js';
const source=(valid=true,price=8400)=>({id:'rail-1',origin:'西安',destination:'汉堡',supplier_id:'supplier-1',status:'confirmed',quote:{container:'40HQ',equipment:'COC',scope:'站到站',unit:'柜',price,currency:'USD',fees:[],validFrom:valid?'2026-10-01':'',validUntil:valid?'2026-11-30':''}});
const input={transport:'fcl',station:'西安',origin:'西安',destination:'汉堡',date:'2026-10-25',quantity:2,box:'40HQ',equipment:'COC',truck:false,rent:false,fx:7,eurFx:null,profitMode:'markup',profit:10,termsReviewed:true};
test('confirmed valid FCL rail rate is calculated per container',()=>{
 const r=estimateFcl(input,{fcl:[source()]});
 assert.equal(r.result.cost,16800);
 assert.equal(r.result.price,18480);
 assert.equal(r.result.complete,true);
});
test('confirmed but undated FCL procurement must not be considered quote-ready',()=>{
 const r=estimateFcl(input,{fcl:[source(false)]});
 assert.equal(r.result.cost,16800);
 assert.equal(r.result.complete,false);
 assert.match(r.result.pending.join(';'),'有效期');
});
test('zero-amount procurement must not generate a publishable complete price',()=>{
 const r=estimateFcl(input,{fcl:[source(true,0)]});
 assert.equal(r.result.complete,false);
 assert.match(r.result.pending.join(';'),'零');
});
test('missing required trucking cost must remain incomplete',()=>{
 const r=estimateFcl({...input,truck:true},{fcl:[source()],trucks:[]});
 assert.equal(r.result.complete,false);
 assert.match(r.result.pending.join(';'),'国内拖车');
});