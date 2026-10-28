import test from 'node:test';
import assert from 'node:assert/strict';
import {createMapDispatcher} from '../server/lead-map-dispatch.js';
const id='11111111-2222-4333-8444-555555555555';
const request=(authorized=true)=>new Request('https://crm.example/api/lead-enrich',{
 method:'POST',headers:{'content-type':'application/json',...(authorized?{authorization:'Bearer user-token'}:{})},
 body:JSON.stringify({action:'start-map-job',job_id:id})});
test('owned queued job can dispatch GitHub Actions immediately',async()=>{
 const calls=[];
 const run=createMapDispatcher({getToken:()=> 'internal-github-token',fetcher:async(url,opt)=>{
  calls.push({url,opt});
  if(url.includes('lead_map_search_jobs'))return {ok:true,json:async()=>[{id,status:'queued'}]};
  return {status:204};
 }});
 const response=await run(request());const data=await response.json();
 assert.equal(response.status,200);
 assert.equal(data.triggered,true);
 assert.equal(calls.length,2);
 assert.equal(calls[0].opt.headers.Authorization,'Bearer user-token');
 assert.equal(calls[1].opt.headers.Authorization,'Bearer internal-github-token');
});
test('missing login, invisible jobs and missing server token never dispatch',async()=>{
 let calls=0;
 const fetcher=async()=>{calls++;return {ok:true,json:async()=>[]};};
 const run=createMapDispatcher({fetcher,getToken:()=> 'secret'});
 assert.equal((await run(request(false))).status,401);
 assert.equal((await run(request())).status,403);
 assert.equal(calls,1);
 const fallback=createMapDispatcher({getToken:()=>'',fetcher:async()=>({ok:true,json:async()=>[{id,status:'queued'}]})});
 assert.equal((await (await fallback(request())).json()).scheduled,true);
});
