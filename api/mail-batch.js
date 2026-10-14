import {send as enqueue} from '@vercel/queue';
import nodemailer from 'nodemailer';
import {makeService} from '../server/mail-service.js';
import {makeBatchScheduler} from '../server/mail-batch-service.js';
export const maxDuration=300;
export async function POST(request){
 try{
  if(Number(request.headers.get('content-length')||0)>65536)return Response.json({error:'请求过大'},{status:413});
  const body=await request.json(),token=(request.headers.get('authorization')||'').replace(/^Bearer /i,'');
  const schedule=makeBatchScheduler({service:makeService({createTransport:nodemailer.createTransport}),enqueue});
  return Response.json(await schedule(body,token),{headers:{'Cache-Control':'no-store'}});
 }catch(error){console.error('mail_batch_submit_failed');return Response.json({error:error.message||'批量提交失败。'},{status:400,headers:{'Cache-Control':'no-store'}});}
}
