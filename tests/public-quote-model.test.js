import test from 'node:test';
import assert from 'node:assert/strict';
import {websiteQuoteDraft} from '../src/public-quote-model.js';
test('approved costing generates a sales draft, never a live quote',()=>{
 const row=websiteQuoteDraft({
  inputs:{transport:'fcl',scope:'station',station:'西安',origin:'宁波',destination:'汉堡',box:'40HQ',quantity:2,truck:false,profitMode:'markup',profit:15,webRange:5,webMinimum:0,date:'2026-10-23',webValidUntil:'2026-11-23'},
  result:{complete:true,cost:16000,price:18400}
 },'11111111-1111-4111-8111-111111111111');
 assert.equal(row.status,'draft');assert.equal(row.origin,'西安');assert.equal(row.service_scope,'port_to_port');assert.equal(row.pricing_meta.quantity,2);assert.equal(row.unit_price_low,8740);assert.equal(row.unit_price_high,9660);
});
test('no public draft without complete cost',()=>{
 assert.throws(()=>websiteQuoteDraft({inputs:{transport:'fcl'},result:{complete:false}},null),/费用未完整/);
});
