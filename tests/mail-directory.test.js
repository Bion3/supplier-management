import test from 'node:test';
import assert from 'node:assert/strict';
import {loadMailDirectory} from '../src/mail-directory.js';

test('timeout retries the same cursor with a smaller page without dropping recipients',async()=>{
 const calls=[],records=Array.from({length:7},(_,i)=>({id:String(i+1).padStart(2,'0')}));
 const result=await loadMailDirectory('contacts',async(url,options)=>{
  const {p_after,p_limit}=JSON.parse(options.body);calls.push([p_after,p_limit]);
  if(calls.length===2)throw Error('canceling statement due to statement timeout');
  return records.filter(row=>row.id>p_after).slice(0,p_limit);
 },{pageSize:4,minPageSize:2});
 assert.deepEqual(calls,[['',4],['04',4],['04',2],['06',2]]);
 assert.deepEqual(result,records);
});

test('non-timeout errors surface without retrying',async()=>{
 let count=0;
 await assert.rejects(loadMailDirectory('companies',async()=>{count++;throw Error('permission denied');}),/permission denied/);
 assert.equal(count,1);
});
