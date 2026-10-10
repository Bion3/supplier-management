import test from 'node:test';
import assert from 'node:assert/strict';
import {validateSupplier,decodeSuppliers,encodeSuppliers,filterSuppliers} from '../src/suppliers.js';
const supplier = {id:'supplier-1',name:'测试物流',category:'铁路运输',contact:'程先生',phone:'',email:'',routes:'中国—伊朗',notes:'',status:'待评估',createdAt:'2026-10-10T08:00:00Z',updatedAt:'2026-10-10T08:00:00Z'};
test('empty storage and versioned round trip',()=>{assert.deepEqual(decodeSuppliers(null),[]);assert.deepEqual(decodeSuppliers(encodeSuppliers([supplier])),[supplier]);});
test('validates required fields, email and enums',()=>{assert.throws(()=>validateSupplier({...supplier,name:'  '}));assert.throws(()=>validateSupplier({...supplier,email:'bad'}));assert.throws(()=>validateSupplier({...supplier,status:'unknown'}));assert.equal(validateSupplier({...supplier,name:' 测试物流 '}).name,'测试物流');});
test('corrupt or duplicate data is rejected without silently clearing it',()=>{assert.throws(()=>decodeSuppliers('broken'));assert.throws(()=>decodeSuppliers('{"version":2,"suppliers":[]}'));assert.throws(()=>decodeSuppliers(encodeSuppliers([supplier,supplier])));});
test('route search and status filters compose',()=>{assert.equal(filterSuppliers([supplier],'伊朗','待评估').length,1);assert.equal(filterSuppliers([supplier],'伊朗','合作中').length,0);assert.equal(filterSuppliers([supplier],'不存在').length,0);});
