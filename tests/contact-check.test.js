import test from 'node:test';
import assert from 'node:assert/strict';
import {contactClueKey,contactCheckMarker,contactAlreadyChecked} from '../server/contact-check.js';
test('completed checks skip until input clues change; contact output never invalidates',()=>{
 const row={website:'https://example.com',source_url:'https://fair.test/1',source_evidence:[{url:'https://directory.test/1'}]};
 assert.equal(contactAlreadyChecked(row),false);
 const saved={...row,notes:contactCheckMarker(row),email:'new@example.com'};
 assert.equal(contactAlreadyChecked(saved),true);
 assert.equal(contactAlreadyChecked({...saved,website:'https://other.test'}),false);
 assert.equal(contactAlreadyChecked({...saved,source_url:'https://fair.test/2'}),false);
 const lead={...row,source_evidence:[...row.source_evidence,{url:'https://example.com/contact',checked_at:'now'},{contact_check:contactClueKey(row),checked_at:'now'}]};
 assert.equal(contactAlreadyChecked(lead),true);
 assert.equal(contactAlreadyChecked({...lead,source_evidence:[...lead.source_evidence,{url:'https://new-source.test'}]}),false);
});
