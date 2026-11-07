import test from 'node:test';
import assert from 'node:assert/strict';
import {estimateFcl,estimateFclVariants,estimateLcl,diagnoseFclMatches,loadingMatches} from '../src/cost-unified-model.js';
import {domesticCost} from '../src/domestic-model.js';
import {calculate} from '../src/cost-model.js';
import {classifyQuoteDestination,destinationChoices} from '../src/cost-destination-options.js';
import {readFileSync} from 'node:fs';
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

test('Xi’an local pickup uses only the pickup tier, never a different city linehaul',()=>{
 const shared={id:'pickup-local',kind:'pickup',origin:'通用本地提货',destination:'本地集货仓',status:'confirmed',supplier_id:null,quote:{kind:'pickup',sharedPickup:true,tierMode:'ceil',rule:'tier',ratio:300,currency:'USD',minimum:0,deliveryIncluded:true,tiers:[{minVolume:4,maxVolume:10,minWeight:2500,maxWeight:5000,amount:125,unit:'fixed'}]}};
 const shanghai={id:'linehaul-from-shanghai',kind:'linehaul',origin:'上海,上海市',destination:'西安',status:'confirmed',supplier_id:'other',quote:{kind:'linehaul',rule:'max',cbm:110,ton:410,ratio:300,currency:'CNY',minimum:0,deliveryIncluded:true}};
 const plan={id:'plan-xian-hamburg',origin:'西安',destination:'汉堡',status:'confirmed',inputs:{mode:'own',fx:7,capacity:60,domesticRatio:300,railRatio:500,profitMode:'markup',profit:15,pickup:null,railUnitCost:{unit:197.14285714285717,ratio:500,minimum:0,pending:['THC']}}};
 const input={transport:'lcl',scope:'door',origin:'西安',destination:'汉堡',date:'2026-11-03',pieces:5,weight:5000,volume:10,fx:7,profitMode:'markup',profit:15};
 const local=estimateLcl(input,{domestic:[shared,shanghai],plans:[plan]})[0];
 assert.equal(local.inputs.pickupQuote.quoteId,'pickup-local');
 assert.equal(local.inputs.linehaulQuote.internalNoLinehaul,true);
 assert.equal(local.result.lines.filter(line=>line.name==='国内干线').length,0);
 assert.equal(local.result.lines.find(line=>line.name==='国内提货').value,125);
 assert.ok(Math.abs(local.result.cost-(125+1971.4285714285716))<0.001);
 assert.equal(local.result.complete,false);
 assert.match(local.result.pending.join(';'),/THC/);
 const mismatch=estimateLcl({...input,origin:'天津'},{domestic:[shared,shanghai],plans:[plan]})[0];
 assert.equal(mismatch.inputs.linehaulQuote.quoteId,undefined);
 assert.equal(mismatch.result.lines.some(line=>line.name==='国内干线'),false);
 assert.equal(mismatch.result.lines.some(line=>line.name==='国内提货'),false);
 assert.equal(mismatch.result.complete,false);
 assert.match(mismatch.result.pending.join(';'),/国内干线/);
});

test('domestic linehaul 1:300 selects volume price for light goods, not maximum billed amount',()=>{
 const q={kind:'linehaul',rule:'max',ratio:300,cbm:100,ton:550,currency:'USD',minimum:0,deliveryIncluded:true,status:'confirmed'};
 const light=domesticCost(q,10,2000,7,'2026-11-03');
 assert.equal(light.usd,1000);assert.match(light.basis,/轻货.*10CBM × 100/);
 const heavy=domesticCost(q,10,5000,7,'2026-11-03');
 assert.equal(heavy.usd,2750);assert.match(heavy.basis,/重货.*5吨 × 550/);
 const boundary=domesticCost(q,10,3000,7,'2026-11-03');
 assert.equal(boundary.usd,1650);assert.match(boundary.basis,/重货/);
});
test('railway heavy bills KG/500 times recorded per-chargeable-CBM rate; fixed fee only once',()=>{
 const input={fx:7,capacity:60,domesticRatio:300,railRatio:500,volume:8,weight:5000,pickup:0,
  linehaulQuote:{internalNoLinehaul:true},
  pickupQuote:{status:'confirmed',rule:'fixed',fixed:0,minimum:0,currency:'USD',deliveryIncluded:true},
  railUnitCost:{unit:175,ratio:500,minimum:0,fees:150,pending:[]},
  mode:'external',profitMode:'markup',profit:10};
 const r=calculate(input);
 assert.equal(r.railQty,10);
 assert.equal(r.lines.find(x=>x.name==='铁路运费').value,1750);
 assert.equal(r.lines.find(x=>x.name==='外配杂费').value,150);
 assert.equal(r.cost,1900);
 const light=calculate({...input,weight:2000});
 assert.equal(light.railQty,8);
 assert.equal(light.lines.find(x=>x.name==='铁路运费').value,1400);
});
test('missing own-plan rail unit cannot silently use container-pool conversion',()=>{
 const p={id:'own-no-unit',origin:'西安',destination:'汉堡',status:'confirmed',inputs:{
  mode:'own',fx:7,capacity:60,domesticRatio:300,railRatio:500,pickup:null,profitMode:'markup',profit:10,
  own:[{name:'整柜铁路',selected:0,alternatives:[{amount:8400,currency:'USD'}]}]
 }};
 const v=estimateLcl({transport:'lcl',scope:'station',station:'西安',origin:'西安',destination:'汉堡',date:'2026-11-03',pieces:1,weight:5000,volume:8,fx:7,profitMode:'markup',profit:10},{domestic:[],plans:[p]})[0];
 assert.equal(v.result.lines.some(x=>x.name==='铁路运费'),false);
 assert.match(v.result.pending.join(';'),/铁路计费方单价未录入/);
 assert.equal(v.result.complete,false);
});

test('large or special LCL cargo remains pending and cannot produce publishable quote',()=>{
 const base={fx:7,capacity:60,domesticRatio:300,railRatio:500,volume:10,weight:5000,pickup:0,
 linehaulQuote:{internalNoLinehaul:true},
 pickupQuote:{status:'confirmed',rule:'fixed',fixed:0,minimum:0,currency:'USD',deliveryIncluded:true},
 railUnitCost:{unit:175,ratio:500,minimum:0,fees:150,pending:[]},
 mode:'external',profitMode:'markup',profit:10};
 const normal=calculate(base);assert.equal(normal.complete,true);
 for(const change of [{volume:26},{weight:7001},{pieceLength:3.1},{pieceWidth:1.6},{pieceHeight:1.6},{pieceWeight:3001},{cargoRisk:'restricted'},{cargoRisk:'special'}]){
   const result=calculate({...base,...change});
   assert.equal(result.complete,false,JSON.stringify(change));
   assert.ok(result.pending.length,JSON.stringify(change));
 }
 const exact=calculate({...base,volume:25,weight:7000,pieceLength:3,pieceWidth:1.5,pieceHeight:1.5,pieceWeight:3000});
 assert.equal(exact.complete,true);
});

test('internal FCL and LCL destination lists filter by country/region and discard old versions',()=>{
 const rows=[
  {id:'fcl-1',destination:'莫斯科',status:'confirmed'},
  {id:'fcl-2',destination:'汉堡（快线）',status:'confirmed'},
  {id:'fcl-3',destination:'马拉',status:'confirmed'},
  {id:'fcl-4',destination:'布达佩斯',status:'confirmed'},
  {id:'fcl-5',destination:'旧报价站',status:'confirmed'},
  {id:'fcl-6',destination:'未录价',status:'draft'},
  {id:'fcl-7',destination:'莫斯科',status:'confirmed',supersedes_id:'fcl-5'},
 ];
 assert.deepEqual(classifyQuoteDestination('莫斯科'),{region:'俄罗斯及独联体',country:'俄罗斯'});
 assert.deepEqual(classifyQuoteDestination('马拉'),{region:'欧洲',country:'波兰'});
 assert.deepEqual(classifyQuoteDestination('不明站'),{region:'未分类',country:'待核实'});
 assert.deepEqual(destinationChoices(rows,'fcl',{region:'欧洲',country:'德国'}),['汉堡（快线）']);
 assert.deepEqual(destinationChoices(rows,'fcl',{region:'欧洲',country:'波兰'}),['马拉']);
 assert.deepEqual(destinationChoices(rows,'fcl',{region:'俄罗斯及独联体'}),['莫斯科']);
 assert.equal(destinationChoices(rows,'fcl').includes('旧报价站'),false);
 assert.equal(destinationChoices(rows,'fcl').includes('未录价'),false);
});
test('internal quote page uses FCL/LCL tabs and one searchable grouped destination picker',()=>{
 const html=readFileSync(new URL('../cost.html',import.meta.url),'utf8');
 const code=readFileSync(new URL('../src/cost-auto.js',import.meta.url),'utf8');
 for(const key of ['data-cost-mode="fcl"','data-cost-mode="lcl"','id="destination"','id="cost-destination-panel"','id="cost-destination-groups"','id="cost-destination-toggle"'])assert.ok(html.includes(key),key);
 for(const retired of ['id="destination-region"','id="destination-country"','id="cost-destination-list"'])assert.equal(html.includes(retired),false,retired);
 assert.match(code,/function renderDestinationGroups\(/);
 assert.match(code,/grouped\.get\(region\)\.get\(country\)\.push\(name\)/);
 assert.match(code,/destinationChoices\(pricedDestinations\[kind\]/);
 assert.match(code,/data-choose-destination/);
 assert.match(code,/function toggleDestinationPanel\(/);
 assert.match(code,/async function loadDestinationChoices\(/);
 assert.match(code,/\$\('destination'\)\.value=''/);
 assert.match(code,/e\.key==='Escape'/);
 assert.match(code,/e\.key==='ArrowDown'/);
});

test('confirmed procurement with ordinary notes no longer requires manual terms acknowledgment',()=>{
 const r=source(true,8400);
 r.quote.notes='普通站到站运输操作须知；按报价条件执行。';
 const result=estimateFcl({...input,termsReviewed:false},{fcl:[r]});
 assert.equal(result.result.complete,true);
 assert.equal(result.result.cost,16800);
});
test('all entered confirmed supplier prices are treated as procurement for internal comparisons',()=>{
 const r=source(true,8400);
 r.quote.notes='客户版售价，采购成交价待确认';
 const result=estimateFcl({...input,termsReviewed:true},{fcl:[r]});
 assert.equal(result.result.complete,true);
 assert.equal(result.result.price,18480);
});

test('factory district and generic city match correct trucking tariff loading place, not empty-pickup city',()=>{
 assert.equal(loadingMatches('上海市,浦东新区','上海'),true);
 assert.equal(loadingMatches('上海市,浦东新区','上海市,浦东新区'),true);
 assert.equal(loadingMatches('江苏省,苏州市,吴中区','上海'),false);
 assert.equal(loadingMatches('江苏省,苏州市,吴中区','吴中区'),true);
});
test('auto-compare FCL uses pickup, rail and container rental segments and ranks by complete known cost',()=>{
 const railSoc={...source(),id:'rail-soc',quote:{...source().quote,equipment:'SOC',price:8100}};
 const railCoc={...source(),id:'rail-coc',quote:{...source().quote,equipment:'COC',price:9800}};
 const truck={id:'truck-sh',origin:'上海',destination:'西安',supplier_id:'supplier-t',status:'confirmed',quote:{price:7350,currency:'CNY',unit:'40HQ',container:'40HQ',loadingPlace:'上海市,浦东新区',validUntil:'2026-11-30',fees:[],priceBasis:'采购价'}};
 const rent={id:'rental',origin:'西安',destination:'汉堡',supplier_id:'supplier-r',status:'confirmed',quote:{price:1800,currency:'USD',unit:'柜',container:'40HQ',service:'整柜',fees:[],validUntil:'2026-11-30'}};
 const query={...input,station:'',origin:'上海',equipment:'',quantity:1,date:'2026-11-10'};
 const result=estimateFclVariants(query,{fcl:[railSoc,railCoc],trucks:[truck],rentals:[rent]});
 assert.equal(result.length,2);
 assert.equal(result[0].result.complete,true);
 assert.equal(result[0].result.cost,1050+8100+1800);
 assert.equal(result[0].result.price,(1050+8100+1800)*1.1);
 assert.match(result[0].label,/上海 → 西安 → 汉堡/);
 assert.equal(result[0].inputs.truck,true);
 assert.equal(result[0].inputs.rent,true);
 assert.notEqual(result[0].id,result[1].id);
});
test('missing optional route segment is visibly partial, never silently counted as zero-cost complete',()=>{
 const railSoc={...source(),id:'rail-soc',quote:{...source().quote,equipment:'SOC',price:8100}};
 const query={...input,station:'',origin:'上海',equipment:'',quantity:1,date:'2026-11-10'};
 const result=estimateFclVariants(query,{fcl:[railSoc],trucks:[],rentals:[]});
 assert.equal(result.length,1);
 assert.equal(result[0].result.complete,false);
 assert.match(result[0].result.pending.join(';'),/国内拖车|租箱/);
 assert.equal(result[0].result.cost,8100);
});
