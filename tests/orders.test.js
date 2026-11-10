import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createOrderStore} from '../src/orders-store.js';
const compiled=await build({entryPoints:['src/orders-ui/order-model.ts'],bundle:true,platform:'node',format:'esm',write:false,jsx:'automatic'});
const {orderPatch}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
test('booking data and notifications survive cloud create and versioned update',async()=>{
 let row;const paths=[];
 const store=createOrderStore(async(path,options)=>{paths.push(path);if(!options)return [row];const body=JSON.parse(options.body);row={id:body.id||row.id,data:body.data,version:(row?.version||0)+1};return [row]});
 const booking={customer:'客户',reference:'REF',origin:'郑州',destination:'汉堡',departureDate:'',trackingTo:'ops@example.com',cargo:[{quantity:'7',cn:'设备',weight:'',length:'',width:'',height:''}],declaredWeight:'3510',declaredVolume:'14',shipper:{company:'发货公司'},consignee:{company:'收货公司'}};
 const created=await store.save({id:'EGTEST',...orderPatch(booking),status:'待确认',fees:[]},{create:true});
 assert.equal(created.weight,3510);assert.equal(created.volume,14);assert.equal(created.version,1);
 const saved=await store.save({...created,...orderPatch({...booking,trackingTo:'new@example.com',declaredWeight:'3600'})});
 assert.equal(saved.booking.trackingTo,'new@example.com');assert.equal(saved.weight,3600);assert.equal(saved.booking.consignee.company,'收货公司');assert.equal(saved.version,2);assert.match(paths[1],/version=eq.1$/);assert.deepEqual(await store.list(),[saved]);
});
test('stale writes and network failures never report saved',async()=>{
 await assert.rejects(createOrderStore(async()=>[]).save({id:'EGTEST',version:1}),/其他页面修改/);
 await assert.rejects(createOrderStore(async()=>{throw Error('offline')}).save({id:'EGTEST',version:1}),/offline/);
});
test('complete piece weights and dimensions override declared totals',()=>{
 const cargo=[1940,1980,2020,1000].map((w,i)=>({cn:'设备',quantity:'1',weight:String(w),length:'340',width:i===3?'100':'107',height:i===3?'84':'137'}));
 const o=orderPatch({cargo,declaredWeight:'1',declaredVolume:'1'});assert.equal(o.weight,6940);assert.equal(o.volume,17.808);assert.equal(o.pieces,4);
});
