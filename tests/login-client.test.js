import test from 'node:test';import assert from 'node:assert/strict';
function storage(initial){let value=initial;return {getItem:()=>value,setItem(_key,v){value=v;},removeItem(){value=null;},value:()=>value};}
function ui(){const classes=new Set();globalThis.document={getElementById:()=>null,documentElement:{classList:{add:v=>classes.add(v),toggle:(v,f)=>f?classes.add(v):classes.delete(v)}}};globalThis.location={replace:value=>{globalThis.redirected=value;}};globalThis.localStorage={setItem(){}};return classes;}
test('login stores no local session until the server accepts the session cookie',async()=>{
 const st=storage(null);globalThis.sessionStorage=st;ui();
 globalThis.fetch=async url=>url.startsWith('/')?Response.json({error:'账号没有访问权限'},{status:401}):Response.json({user:{id:'fixture-user'},access_token:'fixture-token',expires_in:3600});
 const cloud=await import('../src/cloud.js?login-rejected');await assert.rejects(cloud.login('fixture@example.test','fixture-password'),/访问权限/);assert.equal(st.value(),null);assert.equal(cloud.currentUser(),undefined);
});
test('parallel data requests rotate an expired token once and update the page cookie',async()=>{
 globalThis.sessionStorage=storage(JSON.stringify({user:{id:'fixture-user'},access_token:'old-fixture',refresh_token:'refresh-fixture',expires_at:0}));ui();let refreshes=0,cookies=0;
 globalThis.fetch=async(url,opts)=>{if(url.includes('grant_type=refresh_token')){refreshes++;return Response.json({user:{id:'fixture-user'},access_token:'new-fixture',expires_in:3600});}if(url==='/api/session'){cookies++;assert.equal(opts.headers.Authorization,'Bearer new-fixture');return Response.json({user:{id:'fixture-user'}});}assert.equal(opts.headers.Authorization,'Bearer new-fixture');return Response.json([]);};
 const cloud=await import('../src/cloud.js?refresh-once');await Promise.all([cloud.cloudRequest('suppliers'),cloud.cloudRequest('freight_companies')]);assert.equal(refreshes,1);assert.equal(cookies,1);
});
test('logout clears the visible auth shell before network completion and clears the server cookie',async()=>{
 const st=storage(JSON.stringify({user:{id:'fixture-user'},access_token:'fixture-token'}));globalThis.sessionStorage=st;const classes=ui();let expired=false;
 globalThis.fetch=async(url,opts)=>{assert.equal(st.value(),null);assert.ok(!classes.has('auth-user'));if(url==='/api/session'){assert.equal(opts.method,'DELETE');expired=true;}return Response.json({});};
 const cloud=await import('../src/cloud.js?logout');cloud.syncAuthShell();await cloud.logout();assert.ok(expired);assert.equal(globalThis.redirected,'/login.html');
});
