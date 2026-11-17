import test from 'node:test';
import assert from 'node:assert/strict';
import {warehouseQuery,validateWarehouse} from '../src/domestic-warehouses-model.js';
import {taskURL} from '../src/workspace-model.js';
test('warehouse paging and combined filters remain server-side and bounded',()=>{
 const q=new URLSearchParams(warehouseQuery({type:'装箱仓',port:'西安',supplier:'中实',status:'true'},3).split('?')[1]);
 assert.equal(q.get('offset'),'100');assert.equal(q.get('limit'),'51');assert.equal(q.get('warehouse_type'),'eq.装箱仓');assert.equal(q.get('port'),'ilike.*西安*');assert.equal(q.get('supplier'),'ilike.*中实*');assert.equal(q.get('enabled'),'eq.true');
});
test('search special punctuation cannot introduce PostgREST filters',()=>{
 const q=new URLSearchParams(warehouseQuery({search:'x",enabled.eq.false,phone.ilike."%'}).split('?')[1]);
 assert.equal(q.has('enabled'),false);assert.ok(q.get('or').includes('\\"'));assert.ok(q.get('or').includes('\\%'));
});
test('warehouse edits preserve multiple contacts and unknown fields stay out',()=>{
 const r=validateWarehouse({name:'西安仓',warehouse_type:'装箱仓',phone:'13806887756；13957790655',enabled:'true',id:'other',revision:100});
 assert.equal(r.phone,'13806887756；13957790655');assert.equal(r.charges,'');assert.equal(r.enabled,true);assert.equal('id' in r,false);assert.equal('revision' in r,false);
 assert.throws(()=>validateWarehouse({...r,name:''}));assert.throws(()=>validateWarehouse({...r,warehouse_type:'test'}));
 assert.equal(taskURL('/domestic-warehouses.html','https://crm.eurasiago.com'),'/domestic-warehouses.html');
});
