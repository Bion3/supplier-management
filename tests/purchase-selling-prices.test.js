import test from 'node:test';import assert from 'node:assert/strict';
import {saleFields,validSellingFields} from '../src/purchase-selling-prices.js';
test('single selling price for FCL and container logistics is isolated from procurement',()=>{
 for(const kind of ['fcl_rail','trucking','rental']){assert.deepEqual(saleFields(kind),[['price','卖价 / 原计价单位']]);assert.equal(validSellingFields(kind,{price:9000},'USD'),true);}
 assert.throws(()=>validSellingFields('fcl_rail',{price:-5},'USD'),/大于零/);
 assert.throws(()=>validSellingFields('fcl_rail',{price:30},''),/币种/);
});
test('LCL prices distinguish CBM tonne and fixed rules',()=>{
 assert.deepEqual(saleFields('domestic',{quote:{rule:'fixed'}}).map(x=>x[0]),['fixed']);
 assert.deepEqual(saleFields('domestic',{quote:{rule:'max'}}).map(x=>x[0]),['cbm','ton']);
 assert.deepEqual(saleFields('lcl_plan').map(x=>x[0]),['unit']);
});
test('pickup templates can save their tier selling prices separately',()=>{
 const f=saleFields('domestic',{quote:{sharedPickup:true,tiers:[{minVolume:1,maxVolume:5,minWeight:0,maxWeight:2500},{minVolume:6,maxVolume:10,minWeight:2500,maxWeight:5000}]}});
 assert.deepEqual(f.map(x=>x[0]),['tier_0','tier_1']);
 assert.equal(validSellingFields('domestic',{tier_0:90,tier_1:120},'CNY'),true);
 assert.throws(()=>validSellingFields('domestic',{foo:10},'CNY'),/非法/);
});
