import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {taskPages,taskURL} from '../src/workspace-model.js';
import {loginDestination} from '../src/login-model.js';

test('task URLs preserve business context and exclude foreign, login and recursive shell URLs',()=>{
 const origin='https://crm.example.test';
 assert.equal(taskURL('/index.html',origin),'/');
 assert.equal(taskURL('/crm.html?view=peers#list',origin),'/crm.html?view=peers#list');
 for(const value of ['https://other.test/crm.html','javascript:alert(1)','/workspace.html','/login.html','/api/mail'])assert.equal(taskURL(value,origin),null);
 assert.equal(loginDestination('/workspace.html?page=%2Flead-map.html',origin),'/workspace.html?page=%2Flead-map.html');
 for(const page of taskPages)assert.equal(loginDestination(page,origin),page);
});

test('switching tasks preserves live frames, page state, close cancellation and bounded memory',async()=>{
 class Element{
  constructor(){this.children=[];this.events={};this.attributes={};this.classList={toggle(){}};this.contentWindow={document:{title:'客户资源',addEventListener:(name,fn)=>{this.childEvents??={};this.childEvents[name]=fn;}},location:{pathname:'/crm.html'}};}
  append(...nodes){for(const node of nodes){node.parent=this;this.children.push(node);}}
  setAttribute(k,v){this.attributes[k]=v;}getAttribute(k){return this.attributes[k];}
  addEventListener(name,fn){this.events[name]=fn;}scrollIntoView(){}focus(){}
  remove(){this.parent.children=this.parent.children.filter(node=>node!==this);}
 }
 const nodes=new Map(['task-tabs','task-panels','task-status','new-task'].map(id=>[id,new Element()]));
 const location={origin:'https://crm.example.test',href:'https://crm.example.test/workspace.html',search:'',pathname:'/workspace.html'};
 let confirmed=false;const window={history:{pushState(){}},addEventListener(){}};
 const context=vm.createContext({document:{getElementById:id=>nodes.get(id),querySelectorAll:()=>[],querySelector:()=>null,createElement:()=>new Element(),addEventListener(){},title:''},window,location,URL,URLSearchParams,taskURL,workspaceToken(){},confirm:()=>confirmed});
 const source=(await readFile(new URL('../src/workspace.js',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'');
 vm.runInContext(source,context);
 const api=window.eurasiagoWorkspace,frames=nodes.get('task-panels').children;
 assert.equal(frames.length,1);
 api.open('/crm.html');const crm=frames[1];crm.contentWindow.scratch='draft';crm.srcAssignments=1;
 crm.events.load();crm.childEvents.input();
 api.open('/cost.html');assert.equal(crm.hidden,true);
 api.open('/crm.html');assert.equal(crm.hidden,false);assert.equal(crm.contentWindow.scratch,'draft');assert.equal(frames.length,3);
 let prevented=false;window.onbeforeunload({preventDefault(){prevented=true;}});assert.ok(prevented);
 const close=nodes.get('task-tabs').children[1].children[1];close.events.click();assert.equal(frames.length,3);
 for(const path of ['/mail.html','/exhibitions.html','/lead-map.html','/discovery.html','/inbox.html'])assert.equal(api.open(path),true);
 assert.equal(api.open('/tracking.html'),false);assert.equal(frames.length,8);assert.equal(crm.contentWindow.scratch,'draft');
 confirmed=true;close.events.click();assert.equal(nodes.get('task-panels').children.length,7);
 assert.equal(api.open('/tracking.html'),true);
});

test('mounted tasks delegate session refresh to a single workspace owner',async()=>{
 const source=(await readFile(new URL('../src/cloud.js',import.meta.url),'utf8')).replace(/export /g,'');
 let calls=0;const access=Promise.resolve('shared-access');const parent={eurasiagoWorkspace:{token(){calls++;return access;}}};
 const context=vm.createContext({sessionStorage:{getItem:()=>null},window:{parent},fetch(){throw Error('A child must never refresh independently');}});
 vm.runInContext(source,context);
 const results=await vm.runInContext('Promise.all([workspaceToken(),workspaceToken()])',context);
 assert.deepEqual([...results],['shared-access','shared-access']);assert.equal(calls,2);
});

test('protected business pages redirect to the task shell before booting; child frames stay embedded',async()=>{
 const source=await readFile(new URL('../src/auth-boot.js',import.meta.url),'utf8');
 let redirected='',stopped=false;const top={stop(){stopped=true;},addEventListener(){}};top.parent=top;
 const base={document:{documentElement:{classList:{add(){},remove(){}}}},location:{pathname:'/crm.html',search:'?view=peers',hash:'',replace:url=>{redirected=url;}},window:top,encodeURIComponent};
 vm.runInNewContext(source,base);assert.ok(stopped);assert.equal(redirected,'/workspace.html?page=%2Fcrm.html%3Fview%3Dpeers');
 redirected='';const child={parent:{eurasiagoWorkspace:{}},addEventListener(){}};
 vm.runInNewContext(source,{...base,window:child,sessionStorage:{getItem:()=>JSON.stringify({user:{id:'u'},access_token:'token',expires_at:Date.now()+60000})}});
 assert.equal(redirected,'');
});
