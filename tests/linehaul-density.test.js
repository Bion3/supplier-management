import test from 'node:test';
import assert from 'node:assert/strict';
import {blankRate,domesticCost} from '../src/domestic-model.js';
const q=()=>({...blankRate(),status:'confirmed',cbm:200,ton:300,ratio:500,deliveryIncluded:true});
test('density determines price even when the other tariff produces a larger charge',()=>{
 for(const rule of ['cbm','ton','max','billable']){
  const rate={...q(),rule};
  assert.equal(domesticCost(rate,8,2500,7).original,1600);
  assert.equal(domesticCost(rate,8,5000,7).original,1500);
  assert.equal(domesticCost(rate,8,4000,7).original,1200);
  assert.equal(domesticCost(rate,8,3999,7).original,1600);
 }
});
test('selected missing tariff never falls back to the other tariff',()=>{
 assert.equal(domesticCost({...q(),ton:null},8,5000,7).complete,false);
 assert.equal(domesticCost({...q(),cbm:null},8,2500,7).complete,false);
 assert.equal(domesticCost({...q(),ton:null},8,2500,7).complete,true);
 assert.equal(domesticCost({...q(),ton:0},8,5000,7).original,0);
});
test('minimum, delivery and conversion apply after tariff selection',()=>{
 const r=domesticCost({...q(),minimum:1800,delivery:100,deliveryIncluded:false},8,5000,7);
 assert.equal(r.original,1900);assert.equal(r.usd,1900/7);
});
test('pickup and fixed linehaul retain their explicit rules',()=>{
 assert.equal(domesticCost({...q(),kind:'pickup'},8,5000,7).original,2000);
 assert.equal(domesticCost({...q(),rule:'fixed',fixed:90},8,5000,7).original,90);
});
