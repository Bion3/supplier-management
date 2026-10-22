import test from 'node:test';
import assert from 'node:assert/strict';
import {createContactDrain} from '../server/lead-contact-drain.js';
const job='11111111-2222-4333-8444-555555555555';
const lead='22222222-2222-4333-8444-555555555555';
const req=ids=>new Request('https://app.example/api/lead-contact-drain',{method:'POST',headers:{authorization:'Bearer token','content-type':'application/json'},body:JSON.stringify({ids})});
test('direct fallback uses RLS-scoped jobs then processes allowed website with source contacts',async()=>{
 const calls=[];
 const fetcher=async(url,options)=>{
  calls.push({url,options});
  if(url.includes('lead_enrich_jobs?'))return {ok:true,json:async()=>[{id:job,lead_id:lead,status:'queued'}]};
  const args=JSON.parse(options.body);
  return {ok:true,json:async()=>args.p_action==='claim'?{website:'https://company.example'}:{finished:true,added:1}};
 };
 const handle=createContactDrain({fetcher,getSecret:()=> 'test-private-secret',researcher:async()=>({contacts:[{type:'email',value:'contact@company.example',source_url:'https://company.example/kontakt'}],evidence:[{url:'https://company.example/kontakt'}],checked_pages:1})});
 const response=await handle(req([job]));const data=await response.json();
 assert.equal(response.status,200);assert.equal(data.completed,1);assert.equal(data.added,1);
 assert.match(calls[0].options.headers.Authorization,/Bearer token/);
 assert.equal(calls.filter(x=>x.url.includes('rpc/lead_enrich_worker')).length,2);
});
test('direct fallback refuses invisible or unowned jobs before worker RPC',async()=>{
 let calls=0;
 const handle=createContactDrain({getSecret:()=> 'secret',fetcher:async()=>{calls++;return {ok:true,json:async()=>[]};}});
 const response=await handle(req([job]));
 assert.equal(response.status,403);assert.equal(calls,1);
});
test('direct fallback has a strict limit of two jobs and requires authentication',async()=>{
 const handle=createContactDrain({getSecret:()=> 'secret',fetcher:async()=>{throw Error('should not fetch');}});
 const bad=await handle(req([job,lead,'33333333-2222-4333-8444-555555555555']));
 assert.equal(bad.status,400);
 const missing=await handle(new Request('https://app.example',{method:'POST',body:JSON.stringify({ids:[job]})}));
 assert.equal(missing.status,401);
});
