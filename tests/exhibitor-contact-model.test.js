import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeExhibitorContacts,exhibitorContactsByType} from '../src/exhibitor-contact-model.js';
test('multi-contact merge preserves prior phones and adds several email, phone and person records',()=>{
 const row={email:'sales@company.example',phone:'+49 40 1234567',contact_name:'Anna',
 contacts:[{type:'email',value:'INFO@company.example',verification:'verified',source_type:'official_website'}]};
 const result=mergeExhibitorContacts(row,{
 emails:'info@company.example\nnew@company.example;third@company.example\nnot-an-email',
 phones:'+49 40 7777777\n+49 40 8888888\n123',
 people:'Erik;Sofia'});
 assert.equal(result.filter(x=>x.type==='email').length,3);
 assert.equal(result.filter(x=>x.type==='phone').length,3);
 assert.equal(result.filter(x=>x.type==='person').length,3);
 assert.equal(result[0].verification,'verified');
 assert.equal(exhibitorContactsByType({contacts:result},'email').length,3);
});
