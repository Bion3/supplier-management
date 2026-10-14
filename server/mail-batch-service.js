export function makeBatchScheduler({service,enqueue,now=()=>Date.now()}){
 return async function scheduleBatch(body,token){
  if(!Array.isArray(body.ids)||!body.ids.length||body.ids.length>20||body.ids.some(id=>typeof id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)))throw Error('每次提交需包含1至20个有效草稿编号。');
  if(!['now','scheduled'].includes(body.mode))throw Error('发送方式无效。');
  if(body.mode==='scheduled'&&(!Number.isFinite(new Date(body.scheduled_at).getTime())||new Date(body.scheduled_at).getTime()<now()+60000))throw Error('请选择至少1分钟后的发送时间。');
  await service.authorize(token);
  const ids=[...new Set(body.ids)],results=new Array(ids.length);let next=0;
  async function submit(){
   for(;;){const index=next++;if(index>=ids.length)return;const id=ids[index];
    const date=body.mode==='scheduled'?body.scheduled_at:new Date(now()+120000).toISOString();
    try{const result=await service.schedule(id,date,token,enqueue);results[index]={id,...result};}
    catch(error){results[index]={id,error:error.message||'草稿未能提交。'};}
   }
  }
  await Promise.all(Array.from({length:Math.min(3,ids.length)},submit));
  return {results};
 };
}
