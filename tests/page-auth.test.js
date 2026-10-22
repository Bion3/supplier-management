import test from 'node:test';
import assert from 'node:assert/strict';
import {protectPage} from '../server/page-auth.js';
import {COOKIE,verifySession,readSessionCookie,sessionCookie} from '../server/session-auth.js';
import {loginDestination} from '../src/login-model.js';
const origin='https://app.example.test';
const proceed=options=>new Response('protected-page',{headers:options?.headers});
test('all business entrypoints redirect anonymously before returning page HTML',async()=>{
 for(const path of ['/','/index.html','/hub.html','/pricing.html','/mail.html','/inbox.html','/crm.html','/discovery.html','/cost.html','/rates.html','/rail-rates.html','/pickup-rates.html','/knowledge.html']){
  let called=0;const r=await protectPage(new Request(origin+path),{verify:async()=>{called++;return null;},proceed});
  assert.equal(r.status,303,path);assert.equal(await r.text(),'');assert.ok(r.headers.get('location').startsWith('/login.html?next='));assert.equal(called,0);assert.match(r.headers.get('cache-control'),/no-store/);
 }
});
test('forged, expired, duplicate cookies fail closed; validated session can enter',async()=>{
 const req=value=>new Request(origin+'/hub.html',{headers:{cookie:value}});
 assert.equal((await protectPage(req(COOKIE+'=fake'),{verify:async()=>null,proceed})).status,303);
 assert.equal(readSessionCookie(req(COOKIE+'=a; '+COOKIE+'=b')),'');
 const allowed=await protectPage(req(COOKIE+'=fixture'),{verify:async()=>({id:'approved'}),proceed});assert.equal(await allowed.text(),'protected-page');assert.match(allowed.headers.get('cache-control'),/private, no-store/);
 const unavailable=await protectPage(req(COOKIE+'=fixture'),{verify:async()=>{throw Error('offline');},proceed});assert.equal(unavailable.status,503);assert.ok(!(await unavailable.text()).includes('protected-page'));
});
test('provider verifies identity and existing access allowlist, rather than trusting token metadata',async()=>{
 let calls=0;const provider=async(_url,options)=>{calls++;assert.equal(options.headers.Authorization,'Bearer fixture');return Response.json({id:'2c1dc7d7-ecc4-4992-9bca-301877e9cd66',email:'fixture@example.com'});};
 assert.equal((await verifySession('fixture',provider)).email,'fixture@example.com');assert.equal(calls,1);
 assert.equal(await verifySession('fixture',async()=>Response.json({id:'outsider',user_metadata:{admin:true}})),null);
 assert.equal(await verifySession('fixture',async()=>new Response(null,{status:401})),null);
 assert.equal(await verifySession('',provider),null);
 assert.match(sessionCookie('fixture'),/HttpOnly; Secure; SameSite=Lax/);assert.match(sessionCookie('',0),/Max-Age=0/);
});
test('public login assets and independently authenticated APIs bypass the page gate',async()=>{
 for(const path of ['/login.html','/src/login.js','/src/login.css','/api/mail-queue'])assert.equal((await protectPage(new Request(origin+path),{verify:async()=>{throw Error('should not verify');},proceed})).status,200);
});
test('login return URL accepts only same-origin business pages',()=>{
 assert.equal(loginDestination('/mail.html?group=EU#drafts',origin),'/mail.html?group=EU#drafts');
 for(const url of ['https://evil.example/','//evil.example/','javascript:alert(1)','/api/session','/login.html'])assert.equal(loginDestination(url,origin),'/hub.html');
});
