import test from 'node:test';
import assert from 'node:assert/strict';
import {draftableStationRail,needsBalanceFee,prepareStationRailQuote,stationRailSalesDraft} from '../src/sales-quote-generator.js';
const source={
 id:'11111111-1111-4111-8111-111111111111',origin:'郑州',destination:'汉堡',status:'confirmed',supplier_id:'supplier-1',supersedes_id:null,
 quote:{scope:'站到站',equipment:'COC',container:'20尺',unit:'柜',currency:'USD',price:6550,fees:[],validFrom:'',validUntil:'2026-11-30',source:{quotationPeriod:'2026年11月'},notes:'COC提还箱平衡费：根据提还箱地单询。'}
};
test('only current unambiguous procurement can enter the source draft pool',()=>{
 assert.equal(draftableStationRail([source],'2026-11-01').length,1);
 assert.equal(draftableStationRail([source],'2026-10-25').length,0);
 assert.equal(draftableStationRail([{...source,quote:{...source.quote,container:'40尺'}}],'2026-11-01').length,0);
 assert.equal(draftableStationRail([{...source,status:'draft'}],'2026-11-01').length,0);
 const newer={...source,id:'new-version',supersedes_id:source.id};
 assert.deepEqual(draftableStationRail([source,newer],'2026-11-01').map(x=>x.id),['new-version']);
});
test('COC requires explicit balance fee and origin terms review',()=>{
 assert.equal(needsBalanceFee(source),true);
 assert.throws(()=>prepareStationRailQuote(source,{date:'2026-11-01',reviewed:false,balanceFee:200}),/核实/);
 assert.throws(()=>prepareStationRailQuote(source,{date:'2026-11-01',reviewed:true}),/平衡费/);
});
test('reviewed November COC generates immutable, unpublished sales draft',()=>{
 const cost=prepareStationRailQuote(source,{date:'2026-11-01',reviewed:true,balanceFee:200,otherFee:100,profitMode:'markup',profit:10,fx:7});
 assert.equal(cost.result.complete,true);
 assert.equal(cost.result.cost,6850);
 assert.equal(cost.result.price,7535);
 const draft=stationRailSalesDraft(cost,'33333333-3333-4333-8333-333333333333');
 assert.equal(draft.status,'draft');
 assert.equal(draft.service_scope,'port_to_port');
 assert.equal(draft.container,'20GP');
 assert.equal(draft.valid_from,'2026-11-01');
 assert.equal(draft.valid_until,'2026-11-30');
 assert.equal(draft.pricing_meta.sourceRailId,source.id);
 assert.equal(draft.pricing_meta.cost,6850);
 assert.equal(draft.unit_price_low,7158.25);
 assert.equal(draft.unit_price_high,7911.75);
});
