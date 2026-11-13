// Resume from the last confirmed id after a transient database timeout.
export async function loadMailDirectory(kind,request,{pageSize=1000,minPageSize=125}={}){
 const rows=[];
 let size=pageSize;
 for(;;){
  let batch;
  try{
   batch=await request(`rpc/freight_mail_${kind}_after`,{method:'POST',body:JSON.stringify({p_after:rows.at(-1)?.id||'',p_limit:size})});
  }catch(error){
   if(/statement timeout|timed? out/i.test(error.message||'')&&size>minPageSize){size=Math.max(minPageSize,Math.floor(size/2));continue;}
   throw Error(`第 ${Math.floor(rows.length/pageSize)+1} 页：${error.message}`);
  }
  rows.push(...batch);
  if(batch.length<size)return rows;
 }
}
