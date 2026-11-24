import test from 'node:test';
import assert from 'node:assert/strict';
import {templatePool,templateLanguage} from '../src/mail-templates.js';
import {appendSignature} from '../src/mail-signature.js';
import {packRich,mailContent} from '../src/mail-content.js';
import {contactGap} from '../src/crm-development.js';
test('language selection never mixes reference languages and preserves saved templates',()=>{
 for(const language of ['zh','en']) for(const purpose of ['开发客户','维护客户']){
  const pool=templatePool([],purpose,language);assert.ok(pool.length);assert.ok(pool.every(t=>templateLanguage(t)===language));
 }
 assert.equal(templateLanguage({name:'[EN] Custom',subject:'Hello'}),'en');
});
test('signature is appended once to generated rich content and escaped by renderer',()=>{
 const original=packRich([{tag:'p',children:['Hello']}]);
 const content=mailContent(appendSignature(original,'Ben\n<script>unsafe</script>'));
 assert.ok(content.text.includes('Ben'));assert.ok(content.html.includes('&lt;script&gt;'));assert.ok(!content.html.includes('<script>'));
 assert.equal(appendSignature('Hello',''),'Hello');assert.equal(appendSignature('Hello','Ben'),'Hello\n\nBen');
});
test('blank and invalidated contacts do not satisfy the completion requirement',()=>{
 assert.deepEqual(contactGap({id:'c'},[{company_id:'c',channel:'邮箱',value:'  '},{company_id:'c',channel:'电话',value:'123',status:'失效'}]),{email:true,phone:true});
});
