import test from 'node:test';import assert from 'node:assert/strict';
import {companyContactPriority,prioritySources} from '../src/contact-priority.js';
import {contactClueKey,contactCheckMarker} from '../src/contact-check.js';
test('checked unchanged sources move to secondary; new clues and failed attempts stay priority',()=>{
 const lead={id:'1',website:'https://example.com',source_evidence:[]};
 const c={source_refs:[{lead_id:'1'}]};
 assert.equal(companyContactPriority(c,prioritySources([lead],[])),false);
 lead.source_evidence.push({contact_check:contactClueKey(lead),checked_at:'today'});
 assert.equal(companyContactPriority(c,prioritySources([lead],[])),true);
 lead.website='https://new.example.com';
 assert.equal(companyContactPriority(c,prioritySources([lead],[])),false);
});
test('all linked sources must be checked; unknown and newly added sources remain priority',()=>{
 const e={id:'e',website:'https://example.com',source_url:'https://fair.com'};e.notes=contactCheckMarker(e);
 const sources=prioritySources([],[e]);
 assert.equal(companyContactPriority({source_refs:[{exhibitor_id:'e'}]},sources),true);
 assert.equal(companyContactPriority({source_refs:[{exhibitor_id:'e'},{lead_id:'new'}]},sources),false);
 assert.equal(companyContactPriority({source_refs:[]},sources),false);
});
