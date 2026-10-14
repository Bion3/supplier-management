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


import {initialContacts} from '../src/crm-model.js';
import {companyGroups,companyGroupOptions} from '../src/crm-model.js';
test('采集批次包含没有邮箱的公司，联系方式分组按公司去重统计',()=>{
 const companies=[{id:'a',company_name:'A',source_refs:['EU-20261013','https://example.com'],notes:'采集批次：EU-20261013'},{id:'b',company_name:'B',source_refs:['EU-20261013']},{id:'c',company_name:'C'}];
 const contacts=[{company_id:'a',mail_groups:['EU-20261013','欧洲货代代理']},{company_id:'a',mail_groups:['欧洲货代代理']},{company_id:'c',mail_groups:['重点客户']}];
 assert.deepEqual(companyGroups(companies[0],contacts.filter(c=>c.company_id==='a')),['EU-20261013','欧洲货代代理']);
 const options=companyGroupOptions(companies,contacts);
 assert.deepEqual(options.find(x=>x.name==='EU-20261013'),{name:'EU-20261013',count:2,isBatch:true});
 assert.equal(options.find(x=>x.name==='欧洲货代代理').count,1);
 assert.equal(options.some(x=>x.name==='https://example.com'),false);
 assert.deepEqual(filterCompanies(companies,contacts,[],{group:'EU-20261013'}).map(c=>c.id),['a','b']);
});
test('分组筛选精确匹配并与其他条件组合，未分组不误选批次公司',()=>{
 const companies=[{id:'a',company_name:'A',region:'德国',role:'海外代理',source_refs:['EU-20261013']},{id:'b',company_name:'B',region:'英国',notes:'采集批次：EU-20261013'},{id:'c',company_name:'C',region:'德国'},{id:'d',company_name:'D'}];
 const contacts=[{company_id:'c',channel:'电话',value:'123',mail_groups:['重点客户']}];
 assert.deepEqual(filterCompanies(companies,contacts,[],{group:'EU-20261013',region:'德国',role:'海外代理'}).map(c=>c.id),['a']);
 assert.equal(filterCompanies(companies,contacts,[],{group:'EU-2026101'}).length,0);
 assert.deepEqual(filterCompanies(companies,contacts,[],{group:'__ungrouped'}).map(c=>c.id),['d']);
 assert.deepEqual(filterCompanies(companies,contacts,[],{group:'重点客户'}).map(c=>c.id),['c']);
 assert.equal(filterCompanies(companies,contacts,[],{}).length,4);
});
test('new company contacts support multiple people and channels, without inventing names',()=>{const rows=initialContacts([{name:'张先生',email:'a@example.com',phone:'123',status:'有效'},{wechat:'wx123'},{email:'',phone:''}]);assert.equal(rows.length,3);assert.equal(rows[0].status,'有效');assert.equal(rows[2].status,'待核实');assert.equal(rows[2].name,'');assert.throws(()=>initialContacts([{email:'invalid'}]));assert.throws(()=>initialContacts([{name:'只有姓名'}]));assert.throws(()=>initialContacts([{email:'a@example.com'},{email:'A@example.com'}]));});

