import test from 'node:test';
import assert from 'node:assert/strict';
import {updateImportedQuote,quoteDisplay,fixedFeeColumns} from '../src/supplier-quote.js';
import {editRailRows,deactivateRailRows} from '../src/rail-bulk.js';
const row={id:'original',origin:'郑州',destination:'汉堡',status:'draft',valid_from:'2026-11-01',valid_until:'2026-11-30',inputs:{mode:'external',selected:0,external:[{rate:180,ratio:null}],importSource:{conditions:'超过30方按1.3系数'},railUnitCost:{unit:180,billingUnit:'CBM',ratio:null,complete:false,pending:['重货规则待确认']}}};
test('fixed ticket fee columns preserve tier boundaries, flat rates and unknowns',()=>{assert.deepEqual(fixedFeeColumns({...row,inputs:{...row.inputs,ticketFeeBands:{upToHalf:50,halfToThree:100,overThree:150}}}),[50,100,150]);assert.deepEqual(fixedFeeColumns({...row,inputs:{railUnitCost:{fees:0}}}),[0,0,0]);assert.deepEqual(fixedFeeColumns(row),[null,null,null]);});
test('supplier rate edits retain conditions, source, dates and draft status',()=>{const result=updateImportedQuote(row,'185');assert.equal(result.inputs.railUnitCost.unit,185);assert.equal(result.status,'draft');assert.equal(result.supersedes_id,'original');assert.deepEqual(result.inputs.importSource,row.inputs.importSource);assert.equal(result.valid_from,row.valid_from);assert.equal(row.inputs.external[0].rate,180);assert.equal(result.inputs.railUnitCost.complete,false);});
test('missing supplier ratios are not displayed as confirmed billing ratios',()=>{assert.deepEqual(quoteDisplay(row),{unit:'CBM',ratio:'待确认',status:'待确认'});});
test('ambiguous supplier quotes cannot be converted by generic batch edits',()=>{assert.throws(()=>editRailRows([row],{rate:'190'}),/特殊计费规则/);assert.equal(deactivateRailRows([row])[0].status,'inactive');});
test('invalid and empty imported rates are rejected',()=>{for(const value of ['',null,-1,'oops'])assert.throws(()=>updateImportedQuote(row,value));});
test('individual fees preserve currency, unknown amounts and source while profit stays separate',()=>{
 const updated=updateImportedQuote(row,180,{bands:{upToHalf:55,halfToThree:110,overThree:''},minimum:0,chargeItems:[{name:'报关费',amount:150,currency:'CNY'},{name:'文件费',amount:'',currency:'USD'}],profitPreset:{mode:'markup',value:15}});
 assert.deepEqual(updated.inputs.ticketFeeBands,{currency:'USD',unit:'票',upToHalf:55,halfToThree:110,overThree:null});
 assert.equal(updated.inputs.chargeItems[0].currency,'CNY');assert.equal(updated.inputs.chargeItems[1].amount,null);
 assert.equal(updated.inputs.railUnitCost.unit,180);assert.equal(updated.inputs.railUnitCost.minimum,0);
 assert.deepEqual(updated.inputs.profitPreset,{mode:'markup',value:15});assert.equal(updated.status,'draft');assert.deepEqual(updated.inputs.importSource,row.inputs.importSource);
 assert.throws(()=>updateImportedQuote(row,180,{profitPreset:{mode:'margin',value:100}}),/毛利率/);
 assert.throws(()=>updateImportedQuote(row,180,{chargeItems:[{name:'报关费',amount:-1,currency:'CNY'}]}),/非负数/);
});
