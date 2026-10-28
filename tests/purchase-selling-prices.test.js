import test from 'node:test';
import assert from 'node:assert/strict';
import {purchaseFields,sellingPrice,operationFeeTotal,changeOperationFee,compatibleFeeBatch} from '../src/purchase-selling-prices.js';

test('purchase cost plus per-unit operations fee determines selling price',()=>{
 assert.equal(sellingPrice(8400,600),9000);
 assert.equal(sellingPrice(100,0),100);
 assert.equal(sellingPrice(null,600),null);
 assert.equal(sellingPrice(99.99,0.01),100);
 assert.throws(()=>sellingPrice(100,-1),/非负/);
});
test('batch fees can be set, increased or decreased without becoming negative',()=>{
 assert.equal(changeOperationFee(100,'set',80),80);
 assert.equal(changeOperationFee(100,'add',25),125);
 assert.equal(changeOperationFee(100,'subtract',25),75);
 assert.throws(()=>changeOperationFee(30,'subtract',40),/不能超过/);
 assert.throws(()=>changeOperationFee(0,'add',-10),/非负/);
});
test('FCL rail, trucking and rental have their own one-unit purchase and selling costs',()=>{
 for(const kind of ['fcl_rail','trucking','rental']){
  const row={quote:{currency:'USD',price:8400,unit:'柜'}};
  assert.deepEqual(purchaseFields(kind,row),[{key:'price',label:'每柜',purchase:8400,unit:'柜'}]);
  assert.equal(compatibleFeeBatch(kind,[row], 'price'),true);
 }
});
test('domestic LCL separate CBM and tonne fees and fixed amount',()=>{
 const row={quote:{currency:'CNY',rule:'max',cbm:110,ton:410}};
 assert.deepEqual(purchaseFields('domestic',row).map(f=>f.key),['cbm','ton']);
 assert.equal(sellingPrice(purchaseFields('domestic',row)[0].purchase,20),130);
 assert.equal(sellingPrice(purchaseFields('domestic',row)[1].purchase,50),460);
 assert.deepEqual(purchaseFields('domestic',{quote:{rule:'fixed',fixed:80}}).map(f=>f.key),['fixed']);
});
test('tiered pickup fees match the same range before batch change',()=>{
 const one={quote:{currency:'USD',sharedPickup:true,tiers:[{minVolume:1,maxVolume:5,minWeight:0,maxWeight:2500,unit:'fixed',amount:80}]}};
 const same={quote:{currency:'USD',sharedPickup:true,tiers:[{minVolume:1,maxVolume:5,minWeight:0,maxWeight:2500,unit:'fixed',amount:90}]}};
 const other={quote:{currency:'USD',sharedPickup:true,tiers:[{minVolume:1,maxVolume:10,minWeight:0,maxWeight:5000,unit:'fixed',amount:90}]}};
 assert.equal(compatibleFeeBatch('domestic',[one,same],'tier_0'),true);
 assert.throws(()=>compatibleFeeBatch('domestic',[one,other],'tier_0'),/不一致/);
});
test('batch price adjustments reject mixed currency, units and missing purchase cost',()=>{
 const usd={quote:{currency:'USD',price:100,unit:'柜'}};
 const cny={quote:{currency:'CNY',price:100,unit:'柜'}};
 const ton={quote:{currency:'USD',price:100,unit:'吨'}};
 const missing={quote:{currency:'USD',price:null,unit:'柜'}};
 assert.throws(()=>compatibleFeeBatch('fcl_rail',[usd,cny],'price'),/不一致/);
 assert.throws(()=>compatibleFeeBatch('fcl_rail',[usd,ton],'price'),/不一致/);
 assert.throws(()=>compatibleFeeBatch('fcl_rail',[usd,missing],'price'),/缺少/);
});
test('LCL rail external plan uses USD unit procurement rate',()=>{
 const row={inputs:{mode:'external',selected:0,external:[{supplierId:'x',rate:190,ratio:500,minimum:0,fees:10}]}};
 const [field]=purchaseFields('lcl_plan',row);
 assert.equal(field.purchase,190);
 assert.equal(field.unit,'计费方');
 assert.equal(sellingPrice(field.purchase,30),220);
});

test('percentage and fixed operation fee combine against purchase price',()=>{
 assert.equal(operationFeeTotal(8400,200,10),1040);
 assert.equal(sellingPrice(8400,operationFeeTotal(8400,200,10)),9440);
 assert.equal(operationFeeTotal(9000,0,15),1350);
 assert.equal(changeOperationFee(10,'add',5),15);
 assert.equal(changeOperationFee(15,'subtract',5),10);
 assert.throws(()=>changeOperationFee(10,'subtract',11),/不能超过/);
 assert.equal(operationFeeTotal(null,200,10),null);
 assert.throws(()=>operationFeeTotal(100,20,-5),/非负/);
});
