import test from 'node:test';
import assert from 'node:assert/strict';

async function shell(stored,caseName){
 globalThis.sessionStorage={getItem:()=>stored,setItem(){},removeItem(){}};
 const elements={
  'login-panel':{hidden:false},workspace:{hidden:true},account:{textContent:''},logout:{hidden:true}
 };
 const classes=new Set();
 globalThis.document={getElementById:id=>elements[id]||null,documentElement:{classList:{add:value=>classes.add(value),toggle:(value,force)=>force?classes.add(value):classes.delete(value)}}};
 const cloud=await import(`../src/cloud.js?${caseName}`);
 return {user:cloud.syncAuthShell(),elements,classes};
}

test('认证界面在本地会话确认后一次性切换，避免登录框闪现',async()=>{
 const active=await shell(JSON.stringify({user:{id:'u1',email:'benjamin@eurasiago.com'}}),'active');
 assert.equal(active.user.email,'benjamin@eurasiago.com');
 assert.equal(active.elements['login-panel'].hidden,true);
 assert.equal(active.elements.workspace.hidden,false);
 assert.equal(active.elements.account.textContent,'benjamin@eurasiago.com');
 assert.equal(active.elements.logout.hidden,false);
 assert.ok(active.classes.has('auth-ready'));
 assert.ok(active.classes.has('auth-user'));

 const anonymous=await shell(null,'anonymous');
 assert.equal(anonymous.user,undefined);
 assert.equal(anonymous.elements['login-panel'].hidden,false);
 assert.equal(anonymous.elements.workspace.hidden,true);
 assert.equal(anonymous.elements.logout.hidden,true);
 assert.ok(anonymous.classes.has('auth-ready'));
 assert.ok(!anonymous.classes.has('auth-user'));
});
