import test from 'node:test';
import assert from 'node:assert/strict';
import {POST} from '../api/discovery-osm.js';
const task='11111111-1111-4111-8111-111111111111';
const auth={authorization:'Bearer test-token'};
function response(body,status=200){return Response.json(body,{status});}
async function mockRun(overpass){
 const original=globalThis.fetch;const calls=[];
 globalThis.fetch=async url=>{
  const target=String(url);calls.push(target);
  if(target.includes('supabase.co'))return response([{id:task,country:'Germany',city:'Hamburg',keywords:['Freight forwarder']}]);
  if(target.includes('nominatim'))return response([{boundingbox:['53.5','53.6','9.9','10.1']}]);
  return overpass(target,calls);
 };
 try{return {result:await POST(new Request('https://example.test/api/discovery-osm',{method:'POST',headers:{...auth,'Content-Type':'application/json'},body:JSON.stringify({task_id:task})})),calls};}
 finally{globalThis.fetch=original;}
}
test('transient Overpass 503 falls back once',async()=>{
 const x=await mockRun((u,c)=>u.includes('overpass-api.de')?response({},503):response({elements:[{type:'node',id:15,tags:{name:'Hamburg Logistics',website:'https://example.org'}}]}));
 assert.equal(x.result.status,200);const data=await x.result.json();assert.equal(data.results.length,1);assert.equal(x.calls.filter(x=>x.includes('interpreter')).length,2);
});
test('rate limit 429 does not bypass quota using another node',async()=>{
 const x=await mockRun(()=>response({},429));
 assert.equal(x.result.status,429);assert.equal(x.calls.filter(x=>x.includes('interpreter')).length,1);
 assert.match((await x.result.json()).error,/配额/);
});
test('both public servers unavailable returns actionable message',async()=>{
 const x=await mockRun(()=>response({},503));assert.equal(x.result.status,503);
 assert.match((await x.result.json()).error,/Overture/);
});
