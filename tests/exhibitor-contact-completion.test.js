import test from 'node:test';
import assert from 'node:assert/strict';
import {createExhibitorContactCompletion} from '../server/exhibitor-contact-completion.js';
const id='11111111-2222-4333-8444-555555555555';
const req=(withAuth=true)=>new Request('https://app.example/api/lead-enrich',{method:'POST',
 headers:{'content-type':'application/json',...(withAuth?{authorization:'Bearer user-session'}:{})},
 body:JSON.stringify({action:'enrich-exhibitor',exhibitor_id:id})});
test('exhibitor contact enrichment fills missing email only and retains phone',async()=>{
 const patches=[];
 const fetcher=async(url,opt)=>{
  if(opt?.method==='PATCH'){patches.push(JSON.parse(opt.body));return {ok:true,json:async()=>[{id}]};}
  return {ok:true,json:async()=>[{id,company_name:'Test GmbH',website:'https://test.example',email:'',phone:'+49 123456',status:'pending',notes:''}]};
 };
 const fn=createExhibitorContactCompletion({fetcher,researcher:async()=>({
  contacts:[{type:'email',value:'sales@test.example'},{type:'phone',value:'+49 111'}],
  evidence:[{url:'https://test.example/kontakt'}],checked_pages:2})});
 const res=await fn(req());const data=await res.json();
 assert.equal(res.status,200);assert.equal(data.added,2);
 assert.equal(patches[0].contacts.length,3);
 assert.equal(patches[0].contacts.filter(x=>x.type==='phone').length,2);
 assert.equal(patches[0].email,'sales@test.example');
 assert.equal('phone' in patches[0],false);
 assert.match(patches[0].notes,/https:\/\/test.example\/kontakt/);
});
test('exhibitor contact enrichment requires authorization and official HTTPS',async()=>{
 const fn=createExhibitorContactCompletion({fetcher:async()=>({ok:true,json:async()=>[{id,website:'http://test.example',email:'',phone:''}]})});
 assert.equal((await fn(req(false))).status,401);
 assert.equal((await fn(req())).status,422);
});
