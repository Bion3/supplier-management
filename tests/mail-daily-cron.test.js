import test from 'node:test';
import assert from 'node:assert/strict';
import {createDailyHandler} from '../server/mail-daily.js';

const env={CRON_SECRET:'cron-token',MAIL_WORKER_SECRET:'worker-token'};
const request=token=>new Request('https://crm.eurasiago.com/api/mail-daily',{headers:{authorization:token}});

test('daily cron rejects missing authorization without database access',async()=>{
  const handler=createDailyHandler({env,fetcher:()=>{throw Error('unexpected fetch');}});
  assert.equal((await handler(request('Bearer wrong'))).status,401);
});

test('daily cron queues only scheduled rows and passes worker secret to preparation',async()=>{
  const ids=['a2c6a76e-c610-41ee-b4ae-341e1b16e793','766956f3-f630-4bb0-b060-1779660bba62'];
  const calls=[];
  const handler=createDailyHandler({env,now:()=>Date.parse('2026-11-17T01:00:00Z'),
    fetcher:async(_url,options)=>{
      assert.equal(JSON.parse(options.body).p_secret,'worker-token');
      return Response.json([{id:ids[0],status:'scheduled',scheduled_at:'2026-11-17T01:00:00Z'},
        {id:ids[1],status:'sent',scheduled_at:'2026-11-17T01:06:00Z'}]);
    },send:async(topic,payload)=>calls.push([topic,payload])});
  assert.deepEqual(await (await handler(request('Bearer cron-token'))).json(),{prepared:2,queued:1});
  assert.deepEqual(calls,[['freight-mail',{id:ids[0]}]]);
});

test('daily cron fails visibly when queuing fails so a retry can repair it',async()=>{
  const handler=createDailyHandler({env,fetcher:async()=>Response.json([{id:'a2c6a76e-c610-41ee-b4ae-341e1b16e793',status:'scheduled',scheduled_at:'2026-11-17T01:00:00Z'}]),send:async()=>{throw Error('queue unavailable');}});
  assert.equal((await handler(request('Bearer cron-token'))).status,500);
});
