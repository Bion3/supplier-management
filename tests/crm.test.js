import test from 'node:test';
import assert from 'node:assert/strict';
import {filterCompanies,latestFollowups,chinaDate,validateContact,validateCompany} from '../src/crm-model.js';
test('latest contact result replaces earlier due dates',()=>{
 const companies=[{id:'a',company_name:'客户A',status:'待核实',historical_routes:['上海 → 汉堡']},{id:'b',company_name:'客户B',status:'潜在',historical_routes:[]}];
 const logs=[{company_id:'a',created_at:'2026-10-01',next_date:'2026-10-02'},{company_id:'a',created_at:'2026-10-09',next_date:'2026-10-20'},{company_id:'b',created_at:'2026-10-09',next_date:'2026-10-10'}];
 assert.equal(latestFollowups(logs).get('a').next_date,'2026-10-20');
 assert.deepEqual(filterCompanies(companies,[],logs,{due:'due',today:'2026-10-10'}).map(x=>x.id),['b']);
 assert.equal(filterCompanies(companies,[{company_id:'a',value:'contact@example.com',name:''}],logs,{query:'contact@example.com'}).length,1);
 assert.equal(filterCompanies(companies,[],logs,{query:'汉堡'}).length,1);
 assert.equal(chinaDate(new Date('2026-10-09T17:00:00Z')),'2026-10-10');
});
test('unknown contacts remain unnamed and invalid email is rejected',()=>{
 assert.throws(()=>validateContact({channel:'邮箱',value:'invalid',status:'待核实'}));
 assert.equal(validateContact({channel:'电话',value:'12345',status:'待核实'}).name,'');
 assert.throws(()=>validateCompany({company_name:' ',status:'待核实'}));
 assert.deepEqual(validateCompany({company_name:'客户',status:'待核实',addresses:'地址1\n地址2'}).addresses,['地址1','地址2']);
});
