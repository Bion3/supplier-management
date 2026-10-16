import test from 'node:test';
import assert from 'node:assert/strict';
import {assessLead} from '../src/lead-quality.js';
test('same-origin pages do not create independent corroboration',()=>{
 const lead={company_name:'Test Logistics',country:'DE',city:'Hamburg',website:'https://test-logistics.example',
 contacts:[{type:'email',value:'info@test-logistics.example',source_type:'official_website',source_url:'https://test-logistics.example/contact'}],
 source_evidence:[{url:'https://test-logistics.example/impressum'},{url:'https://test-logistics.example/contact'}]};
 const q=assessLead(lead);assert.equal(q.source_count,1);assert.equal(q.score,75);assert.equal(q.level,'high');
});
test('independent external evidence receives a corroboration bonus',()=>{
 const lead={company_name:'Example',country:'Germany',city:'Berlin',website:'https://example.org',
 contacts:[{type:'email',value:'sales@example.org',source_type:'official_website',source_url:'https://example.org/contact'}],
 source_evidence:[{url:'https://openstreetmap.org/node/1'}]};
 const result=assessLead(lead);assert.equal(result.source_count,2);assert.equal(result.score,90);
});
test('contact without credible source and free-mail domain remains low priority',()=>{
 const q=assessLead({company_name:'Unknown',contacts:[{type:'email',value:'someone@gmail.com',source_url:'https://public-list.example'}]});
 assert.equal(q.level,'low');assert.equal(q.score,0);
 assert.match(q.note,/不代表/);
});
test('invalid email syntax is not considered valid',()=>{
 const q=assessLead({company_name:'A',website:'https://example.org',contacts:[{type:'email',value:'bad@@example.org',source_url:'https://example.org'}]});
 assert.equal(q.email_count,0);
});
