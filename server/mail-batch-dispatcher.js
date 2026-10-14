import {queueOptions} from '../src/mail-rules.js';
import {batchQueueOptions} from './mail-batch-service.js';
export function makeBatchDispatcher({enqueue}){
 return async function dispatch(message){
  if(!Array.isArray(message.ids)||!message.ids.length||message.ids.length>1000||!Number.isFinite(new Date(message.scheduled_at).getTime())||message.ids.some(id=>typeof id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)))throw Error('Invalid mail batch');
  const ids=[...new Set(message.ids)],current=ids.slice(0,100),remaining=ids.slice(100);let next=0;
  async function publish(){for(;;){const index=next++;if(index>=current.length)return;const id=current[index];await enqueue('freight-mail',{id},queueOptions(id,message.scheduled_at));}}
  await Promise.all(Array.from({length:Math.min(5,current.length)},publish));
  if(remaining.length)await enqueue('freight-mail-batches',{ids:remaining,scheduled_at:message.scheduled_at},batchQueueOptions(remaining,message.scheduled_at));
 };
}
