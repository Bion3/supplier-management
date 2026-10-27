import test from 'node:test';
import assert from 'node:assert/strict';
import {estimateFcl,diagnoseFclMatches} from '../src/cost-unified-model.js';
const source=(valid=true,price=8400)=>({id:'rail-1',origin:'西安',destination:'汉堡',supplier_id:'supplier-1',status:'confirmed',quote:{container:'40HQ',equipment:'COC',scope:'站到站',unit:'柜',price,currency:'USD',fees:[],validFrom:valid?'2026-10-01':'',validUntil:valid?'2026-11-30':''}});
const input={transport:'fcl',station:'西安',origin:'西安',destination:'汉堡',date:'2026-10-25',quantity:2,box:'40HQ',equipment:'COC',truck:false,rent:false,fx:7,eurFx:null,profitMode:'markup',profit:10,termsReviewed:true};
test('confirmed valid FCL rail rate is calculated per container',()=>{
 const r=estimateFcl(input,{fcl:[source()]});
 assert.equal(r.result.cost,16800);
 assert.equal(r.result.price,18480);
 assert.equal(r.result.complete,true);
});
test('confirmed undated FCL procurement is used with a visible date warning',()=>{
 const r=estimateFcl(input,{fcl:[source(false)]});
 assert.equal(r.result.cost,16800);
 assert.equal(r.result.complete,true);
 assert.equal(r.result.validity[0].status,'日期未完整');
});
test('zero-amount procurement must not generate a publishable complete price',()=>{
 const r=estimateFcl(input,{fcl:[source(true,0)]});
 assert.equal(r.result.complete,false);
 assert.match(r.result.pending.join(';'),/零/);
});
test('missing required trucking cost must remain incomplete',()=>{
 const r=estimateFcl({...input,truck:true},{fcl:[source()],trucks:[]});
 assert.equal(r.result.complete,false);
 assert.match(r.result.pending.join(';'),/国内拖车/);
});
test('November procurement remains available for October estimate with future-date notice',()=>{
 const r=source(false);r.quote.validUntil='2026-11-30';r.quote.source={quotationPeriod:'2026年11月'};
 const oct=estimateFcl(input,{fcl:[r]});
 assert.equal(oct.result.complete,true);
 assert.equal(oct.result.cost,16800);
 assert.equal(oct.result.validity[0].status,'尚未生效');
 const nov=estimateFcl({...input,date:'2026-11-10'}, {fcl:[r]});
 assert.equal(nov.result.complete,true);
 assert.equal(nov.result.cost,16800);
});
test('explicit validFrom takes priority over source month',()=>{
 const r=source(true);r.quote.source={quotationPeriod:'2026年11月'};
 const oct=estimateFcl(input,{fcl:[r]});
 assert.equal(oct.result.complete,true);
});

test('live Zhengzhou to Hamburg 20GP COC rail surcharge is not silently excluded',()=>{
 const quoted={...source(false,6550),origin:'郑州',quote:{...source(false,6550).quote,container:'20尺',equipment:'COC',validUntil:'2026-11-30',source:{quotationPeriod:'2026年11月'},notes:'COC提还箱平衡费：根据提还箱地单询。'}};
 const nov={...input,station:'郑州',box:'20GP',date:'2026-11-10',termsReviewed:true,quantity:1};
 const result=estimateFcl(nov,{fcl:[quoted]});
 assert.equal(result.result.cost,6550);
 assert.equal(result.result.complete,false);
 assert.match(result.result.pending.join(';'),/平衡费/);
 const completed=estimateFcl({...nov,extraFees:[{name:'COC提还箱平衡费',amount:200,currency:'USD',unit:'柜'}]},{fcl:[quoted]});
 assert.equal(completed.result.cost,6750);
 assert.equal(completed.result.complete,true);
});

test('default station rail scope can produce complete quote without unwanted trucking and rental',()=>{
 const result=estimateFcl({...input,equipment:'COC',truck:false,rent:false}, {fcl:[source()]});
 assert.equal(result.result.complete,true);
 assert.equal(result.result.pending.length,0);
});
test('matching diagnostics no longer exclude November rate on October date',()=>{
 const r=source(false);r.quote.validUntil='2026-11-30';r.quote.source={quotationPeriod:'2026年11月'};
 const october=diagnoseFclMatches(input,{fcl:[r]});
 assert.equal(october.confirmedApplicable,1);
 assert.equal(october.reasons.length,0);
 const november=diagnoseFclMatches({...input,date:'2026-11-10'}, {fcl:[r]});
 assert.equal(november.confirmedApplicable,1);
 assert.equal(november.reasons.length,0);
});
test('match diagnosis distinguishes a box-type mismatch from missing station',()=>{
 const wrongBox={...source(),quote:{...source().quote,container:'20尺'}};
 assert.match(diagnoseFclMatches(input,{fcl:[wrongBox]}).reasons.join(';'),/箱型/);
 const wrongStation={...source(),origin:'郑州'};
 assert.match(diagnoseFclMatches(input,{fcl:[wrongStation]}).reasons.join(';'),/起运站/);
});

test('expired confirmed rail and rental rates remain costed and identified',()=>{
 const old={...source(),quote:{...source().quote,validFrom:'2026-01-01',validUntil:'2026-09-30'}};
 const result=estimateFcl(input,{fcl:[old]});
 assert.equal(result.result.complete,true);
 assert.equal(result.result.cost,16800);
 assert.equal(result.result.validity[0].status,'已过期');
 assert.equal(result.result.validity[0].until,'2026-09-30');
});
