import test from 'node:test';import assert from 'node:assert/strict';
import {assignTemplates,templatePool,referenceTemplates} from '../src/mail-templates.js';
import {personalise,validateMail} from '../src/mail-model.js';
import {personaliseBody} from '../src/mail-content.js';
test('random templates are allocated per email including two contacts at one company',()=>{
 const recipients=[{id:'a',company_id:'same'},{id:'b',company_id:'same'}],pool=referenceTemplates.slice(0,2);let n=0;
 const rows=assignTemplates(recipients,pool,()=>n++===0?0:.999);
 assert.deepEqual(rows.map(r=>r.template.id),pool.map(t=>t.id));assert.deepEqual(rows.map(r=>r.contact.id),['a','b']);assert.throws(()=>assignTemplates(recipients,[]),/至少/);
});
test('saved templates are reusable and purpose limits the random pool',()=>{
 const saved={id:'saved',name:'My template',purpose:'开发客户',subject:'Hello',body:'Hi'};
 assert.equal(templatePool([saved],'开发客户')[0],saved);assert.ok(templatePool([saved],'维护客户').every(t=>t.purpose==='维护客户'));
});
test('reference templates have valid personalised content',()=>{
 for(const t of referenceTemplates){const company={company_name:'Example Ltd'},contact={name:'Alex'};const mail=validateMail(personalise(t.subject,company,contact),personaliseBody(t.body,company,contact));assert.ok(mail.body.includes('Alex'));}
});
