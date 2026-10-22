import test from 'node:test';
import assert from 'node:assert/strict';
import {websiteQuoteDraft} from '../src/public-quote-model.js';

test('website quote publishes only sales range while keeping profit in private metadata', () => {
  const selected = {
    inputs: {transport:'lcl',origin:'上海',station:'西安',destination:'汉堡',scope:'door',date:'2026-10-22',webValidUntil:'2026-11-30',webRange:5,webMinimum:300,profitMode:'markup',profit:15,railUnitCost:{ratio:500}},
    result: {complete:true,cost:1000,price:1150,profit:150,railQty:10},
  };
  const row = websiteQuoteDraft(selected, 'snapshot');
  assert.equal(row.unit_price_low, 109.25);
  assert.equal(row.unit_price_high, 120.75);
  assert.equal(row.minimum_charge, 300);
  assert.equal(row.ratio, 500);
  assert.equal(row.source_snapshot_id, 'snapshot');
  assert.equal(row.pricing_meta.cost, 1000);
});

test('incomplete costs cannot be published', () => {
  assert.throws(() => websiteQuoteDraft({inputs:{},result:{complete:false}}));
});
