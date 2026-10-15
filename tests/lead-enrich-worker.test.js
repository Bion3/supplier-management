import test from 'node:test';
import assert from 'node:assert/strict';
import {makeLeadWorker} from '../server/lead-enrich-worker.js';

const ids=Array.from({length:4},(_,i)=>'00000000-0000-4000-8000-'+String(i+1).padStart(12,'0'));
test('worker batches only 3 sites and resumes remaining work',async()=>{
 const events=[],queue=[];
 const fetcher=async(_url,opts)=>{
  const body=JSON.parse(opts.body);events.push({action:body.p_action,id:body.p_job_id,result:body.p_result});
  return {ok:true,json:async()=>body.p_action==='claim'?{website:'https://example.org'}:{finished:true}};
 };
 const worker=makeLeadWorker({fetcher,secret:'test-secret',enqueue:async(topic,message)=>queue.push({topic,message}),
  researcher:async()=>({evidence:[{url:'https://example.org/contact'}],contacts:[{type:'email',value:'info@example.org',source_url:'https://example.org/contact'}],checked_pages:2})});
 await worker({ids});
 assert.equal(events.filter(e=>e.action==='claim').length,3);
 assert.equal(events.filter(e=>e.action==='finish').length,3);
 assert.equal(queue.length,1);
 assert.equal(queue[0].topic,'freight-lead-enrich');
 assert.deepEqual(queue[0].message.ids,[ids[3]]);
});
test('website failure is recorded without stopping subsequent jobs',async()=>{
 const events=[];
 const worker=makeLeadWorker({
  secret:'test-secret',enqueue:async()=>{},
  fetcher:async(_url,opts)=>{const body=JSON.parse(opts.body);events.push(body);return {ok:true,json:async()=>body.p_action==='claim'?{website:'https://example.org'}:{finished:true}};},
  researcher:async()=>{throw Error('site unavailable');}
 });
 await worker({ids:[ids[0]]});
 const finish=events.find(e=>e.p_action==='finish');
 assert.match(finish.p_result.error,/site unavailable/);
});
test('worker rejects invalid job ids',async()=>{
 const worker=makeLeadWorker({secret:'test-secret',fetcher:async()=>{throw Error('should not call');},enqueue:async()=>{}});
 await assert.rejects(()=>worker({ids:['invalid']}),/Invalid lead batch/);
});
