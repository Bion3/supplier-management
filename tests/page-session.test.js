import test from 'node:test';import assert from 'node:assert/strict';
import {POST,DELETE,GET} from '../server/session-handler.js';
const origin='https://app.example.test';
test('session endpoint enforces origin, verified token, private cookie and logout expiry',async()=>{
 const original=globalThis.fetch;globalThis.fetch=async()=>Response.json({id:'2c1dc7d7-ecc4-4992-9bca-301877e9cd66',email:'fixture@example.com'});
 try{
  const denied=await POST(new Request(origin+'/api/session',{method:'POST',headers:{Origin:'https://evil.example',Authorization:'Bearer fixture'}}));assert.equal(denied.status,403);
  const missing=await POST(new Request(origin+'/api/session',{method:'POST',headers:{Origin:origin}}));assert.equal(missing.status,401);
  const accepted=await POST(new Request(origin+'/api/session',{method:'POST',headers:{Origin:origin,Authorization:'Bearer fixture'}}));assert.equal(accepted.status,200);assert.match(accepted.headers.get('set-cookie'),/HttpOnly; Secure; SameSite=Lax/);assert.ok(!JSON.stringify(await accepted.json()).includes('fixture;'));
  const revoked=await DELETE(new Request(origin+'/api/session',{method:'DELETE',headers:{Origin:origin}}));assert.match(revoked.headers.get('set-cookie'),/Max-Age=0/);
  assert.equal((await GET(new Request(origin+'/api/session'))).status,401);
 }finally{globalThis.fetch=original;}
});
test('mail entrypoint delegates session requests before any mail operation',async()=>{
 const {GET:mailGET,POST:mailPOST,DELETE:mailDELETE}=await import('../api/mail.js');
 const request=(method)=>new Request(origin+'/api/mail?_session=1',{method,headers:{Origin:origin}});
 assert.equal((await mailGET(request('GET'))).status,401);
 assert.equal((await mailPOST(request('POST'))).status,401);
 assert.match((await mailDELETE(request('DELETE'))).headers.get('set-cookie'),/Max-Age=0/);
});
