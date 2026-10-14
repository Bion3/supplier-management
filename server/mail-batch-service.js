import {createHash} from 'node:crypto';
export function batchQueueOptions(ids,date){return {retentionSeconds:7*86400,idempotencyKey:'mail-batch-'+createHash('sha256').update(ids.join(',')+'|'+date).digest('hex')};}
export function makeBatchScheduler({service,enqueue,now=()=>Date.now()}){
 return async function scheduleBatch(body,token){
  if(!Array.isArray(body.ids)||!body.ids.length||body.ids.length>1000||body.ids.some(id=>typeof id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)))throw Error('一次可提交1至1000个有效草稿编号。');
  if(!['now','scheduled'].includes(body.mode))throw Error('发送方式无效。');
  if(body.mode==='scheduled'&&(!Number.isFinite(new Date(body.scheduled_at).getTime())||new Date(body.scheduled_at).getTime()<now()+60000))throw Error('请选择至少1分钟后的发送时间。');
  await service.authorize(token);
  const ids=[...new Set(body.ids)],date=body.mode==='scheduled'?new Date(body.scheduled_at).toISOString():new Date(now()+120000).toISOString();
  const results=await service.prepareBatch(ids,date,token),prepared=results.filter(r=>r.status==='scheduled'&&!r.error).map(r=>r.id);
  if(prepared.length){
   try{await enqueue('freight-mail-batches',{ids:prepared,scheduled_at:date},batchQueueOptions(prepared,date));}
   catch{
    try{await service.restoreBatch(prepared,date,token);}catch{throw Error('批次队列未确认，发送状态恢复失败；请刷新队列核对，不要重复提交。');}
    throw Error('后台批次未能提交，已恢复为草稿，请重试。');
   }
  }
  return {results};
 };
}
