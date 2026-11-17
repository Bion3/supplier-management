import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyWebsiteError,orderUntriedLeads,contactOutcomeLabels} from '../src/lead-enrich-outcomes.js';
test('website failures are categorized and never treated as verified leads',()=>{
 assert.equal(classifyWebsiteError('getaddrinfo EBUSY domain.example'),'dns_error');
 assert.equal(classifyWebsiteError('unable to get local issuer certificate'),'tls_certificate');
 assert.equal(classifyWebsiteError('Hostname/IP does not match certificate altnames'),'tls_certificate');
 assert.equal(classifyWebsiteError('write EPROTO ssl3_read_bytes tlsv1 alert internal error'),'tls_handshake');
 assert.equal(classifyWebsiteError('HTTP 403'),'access_restricted');
 assert.equal(classifyWebsiteError('HTTP 301'),'http_error');
 assert.equal(classifyWebsiteError('页面读取超时'),'timeout');
 assert.equal(classifyWebsiteError('网页超过大小限制'),'page_too_large');
 assert.match(contactOutcomeLabels.no_new_contacts,/无新增/);
});
test('untouched and missing-contact prospects are prioritized before any checked lead',()=>{
 const site='https://example.com';
 const rows=[
  {id:'old',website:site,contacts:[],enrichment_checked_at:'2026-11-16T00:00:00Z'},
  {id:'hasboth',website:site,contacts:[{type:'email',value:'a@e.com'},{type:'phone',value:'1234567'}]},
  {id:'new',website:site,contacts:[],crm_company_id:'linked-crm-id'},
  {id:'one',website:site,contacts:[{type:'phone',value:'1234567'}]},
  {id:'rejected',website:site,review_status:'rejected'},
  {id:'insecure',website:'http://example.com'}
 ];
 assert.deepEqual(orderUntriedLeads(rows).map(x=>x.id),['new','one','hasboth','old']);
 // CRM-linked records can be checked without overwriting CRM contact tables.
});
