import test from 'node:test';
import assert from 'node:assert/strict';
import {costGaps,repairCost} from '../src/cost-gaps-model.js';
import {blankFcl} from '../src/fcl-rail-model.js';
import {blankRate} from '../src/domestic-model.js';
const row=()=>({id:'r1',origin:'西安',destination:'汉堡',supplier_id:'s1',status:'confirmed',quote:{...blankFcl(),container:'40HQ',equipment:'SOC',price:8400,validFrom:'2020-01-01',validUntil:'2020-02-01'}});
test('dates are reminders and complete rate is not marked blocked',()=>{const issues=costGaps(row(),'fcl','2026-10-28');assert.equal(issues.filter(i=>i.level==='block').length,0);assert.ok(issues.some(i=>i.key==='validity'));});
test('confirmed rows still show missing fields and additional charges',()=>{const r=row();r.quote.price=null;r.quote.equipment='待确认';r.quote.fees=[{name:'THC',amount:null,currency:'USD'}];const keys=costGaps(r,'fcl').map(i=>i.key);for(const k of ['price','equipment','additionalFees'])assert.ok(keys.includes(k));});
test('linehaul identifies light and heavy missing rates independently',()=>{const r={...row(),kind:'linehaul',quote:{...blankRate(),cbm:0,ton:null,deliveryIncluded:true}};const keys=costGaps(r,'domestic').map(i=>i.key);assert.ok(keys.includes('ton'));assert.ok(!keys.includes('cbm'));});
test('repair creates draft version and preserves original and unrelated prices',()=>{const r=row(),copy=structuredClone(r),result=repairCost(r,'fcl','price','8500');assert.deepEqual(r,copy);assert.equal(result.supersedes_id,'r1');assert.equal(result.status,'draft');assert.equal(result.quote.price,8500);assert.equal(result.quote.equipment,'SOC');});
test('numeric edits reject invalid and empty input; zero remains explicit',()=>{for(const v of ['','-1','NaN'])assert.throws(()=>repairCost(row(),'fcl','price',v));assert.equal(repairCost(row(),'fcl','price','0').quote.price,0);});
test('external railway edit invalidates stale cached unit price',()=>{const r={id:'rail',origin:'西安',destination:'汉堡',status:'confirmed',inputs:{mode:'external',selected:0,external:[{rate:100,ratio:500,minimum:0,fees:0}],railUnitCost:{unit:100}}};const result=repairCost(r,'rail','rate','120');assert.equal(result.inputs.external[0].rate,120);assert.equal(result.inputs.railUnitCost,undefined);assert.equal(r.inputs.railUnitCost.unit,100);});

test('draft status is not missing data and inactive prices do not demand repair',()=>{const r=row();r.status='draft';assert.equal(costGaps(r,'fcl').filter(i=>i.level==='block').length,0);r.status='inactive';r.quote.price=null;assert.equal(costGaps(r,'fcl').length,0);});
test('specific missing fields do not also produce a duplicate validation summary',()=>{const r=row();r.quote.price=null;r.supplier_id=null;assert.ok(!costGaps(r,'fcl').some(i=>i.key==='validation'));});
