import test from 'node:test';import assert from 'node:assert/strict';import {checkEmail,checkEmails} from '../server/email-check.js';
const err=code=>Object.assign(Error(code),{code});
test('reject malformed addresses without DNS',async()=>{assert.equal((await checkEmail('bad',()=>{throw Error('must not query');})).status,'invalid');});
test('MX proves domain only, never mailbox existence',async()=>{assert.equal((await checkEmail('a@example.com',async()=>[{exchange:'mx.example.com'}])).status,'domain_ok');});
test('Null MX and nonexistent domain are invalid',async()=>{assert.equal((await checkEmail('a@example.com',async()=>[{exchange:'.'}])).status,'invalid');assert.equal((await checkEmail('a@example.com',async()=>{throw err('ENOTFOUND');})).status,'invalid');});
test('temporary lookup errors stay unknown',async()=>{assert.equal((await checkEmail('a@example.com',async()=>{throw err('ETIMEOUT');})).status,'unknown');});
test('no MX uses implicit A or AAAA; absence is invalid',async()=>{const lookup=async(d,t)=>{if(t==='A')return ['192.0.2.1'];throw err('ENODATA');};assert.equal((await checkEmail('a@example.com',lookup)).status,'domain_ok');assert.equal((await checkEmail('a@example.com',async()=>{throw err('ENODATA');})).status,'invalid');});
test('temporary address lookup failures do not mark invalid',async()=>{assert.equal((await checkEmail('a@example.com',async(d,t)=>{throw err(t==='MX'?'ENODATA':'ESERVFAIL');})).status,'unknown');});
