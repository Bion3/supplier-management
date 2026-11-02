import {verifySession} from './session-auth.js';
import {hmrcOptions,hmrcCSVURL,hmrcEntries} from '../src/hmrc-model.js';
export function createHmrcSearch({verify=verifySession,fetcher=fetch}={}){return async function(request,body){
 const reply=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
 try{
  const token=(request.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');if(!await verify(token))return reply({error:'请先使用获准账号登录'},401);
  let options;try{options=hmrcOptions(body);}catch(e){return reply({error:e.message},400);}
  const response=await fetcher(hmrcCSVURL(options),{redirect:'error',headers:{Accept:'text/csv','User-Agent':'EurasiagoCRM/1.0 (+https://eurasiago.com)'},signal:AbortSignal.timeout(20000)});
  if(!response.ok)return reply({error:'HMRC 暂不可查询（'+response.status+'），请稍后重试；不绕过验证码或访问限制。'},502);
  const reader=response.body.getReader(),chunks=[];let size=0;try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>2000000){await reader.cancel();return reply({error:'结果超过2MB，请使用更细的8位商品编码'},422);}chunks.push(value);}}finally{reader.releaseLock();}
  const data=hmrcEntries(Buffer.concat(chunks).toString('utf8'),options);return reply(data);
 }catch(e){return reply({error:e.name==='TimeoutError'?'官方查询超时，请重试':e.message||'查询失败'},502);}
};}
