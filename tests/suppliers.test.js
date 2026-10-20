import test from 'node:test';
import assert from 'node:assert/strict';
import {validateSupplier,decodeSuppliers,encodeSuppliers,filterSuppliers} from '../src/suppliers.js';
const supplier = {id:'supplier-1',name:'测试物流',category:'铁路运输',contact:'程先生',phone:'',email:'',routes:'中国—伊朗',notes:'',status:'待评估',country:'',region:'',city:'',createdAt:'2026-10-10T08:00:00Z',updatedAt:'2026-10-10T08:00:00Z'};
test('empty storage and versioned round trip',()=>{assert.deepEqual(decodeSuppliers(null),[]);assert.deepEqual(decodeSuppliers(encodeSuppliers([supplier])),[supplier]);});
test('validates required fields, email and enums',()=>{assert.throws(()=>validateSupplier({...supplier,name:'  '}));assert.throws(()=>validateSupplier({...supplier,email:'bad'}));assert.throws(()=>validateSupplier({...supplier,status:'unknown'}));assert.equal(validateSupplier({...supplier,name:' 测试物流 '}).name,'测试物流');});
test('corrupt or duplicate data is rejected without silently clearing it',()=>{assert.throws(()=>decodeSuppliers('broken'));assert.throws(()=>decodeSuppliers('{"version":2,"suppliers":[]}'));assert.throws(()=>decodeSuppliers(encodeSuppliers([supplier,supplier])));});
test('route search and status filters compose',()=>{assert.equal(filterSuppliers([supplier],'伊朗','待评估').length,1);assert.equal(filterSuppliers([supplier],'伊朗','合作中').length,0);assert.equal(filterSuppliers([supplier],'不存在').length,0);});

test('country aliases normalize, region defaults and combined filters preserve contact data',()=>{
 const pl=validateSupplier({...supplier,country:'波兰',city:'Biała Podlaska',phone:'+48 601 540 280',email:'operations@goglob.eu'});
 assert.equal(filterSuppliers([pl],'波兰').length,1);
 assert.equal(pl.country,'Poland');assert.equal(pl.region,'欧洲');assert.equal(pl.phone,'+48 601 540 280');assert.equal(pl.email,'operations@goglob.eu');
 const cn=validateSupplier({...supplier,country:'CN'});assert.equal(cn.region,'东亚');
 assert.equal(filterSuppliers([pl,cn],'','待评估',{region:'欧洲',country:'PL'}).length,1);
 assert.equal(filterSuppliers([pl,cn],'','',{region:'东亚',country:'Poland'}).length,0);
 assert.equal(filterSuppliers([pl],'Biała').length,1);
 assert.throws(()=>validateSupplier({...supplier,region:'invalid'}));
});
