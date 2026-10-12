import nodemailer from 'nodemailer';
import {makeService,sender} from '../server/mail-service.js';
export async function GET(request){try{const service=makeService({createTransport:nodemailer.createTransport});await service.authorize((request.headers.get('authorization')||'').replace(/^Bearer /i,''));return Response.json({configured:service.configured,sender,host:'smtp.feishu.cn',daily_limit:50},{headers:{'Cache-Control':'no-store'}});}catch{ return Response.json({error:'请使用已授权账号登录。'},{status:401});}}
export async function POST(request){
 try{if(Number(request.headers.get('content-length')||0)>10000)return Response.json({error:'请求过大'},{status:413});const body=await request.json();if(!/^[0-9a-f-]{36}$/i.test(body.id||''))return Response.json({error:'邮件编号无效'},{status:400});const service=makeService({createTransport:nodemailer.createTransport});return Response.json(await service.send(body.id,(request.headers.get('authorization')||'').replace(/^Bearer /i,'')),{headers:{'Cache-Control':'no-store'}});}
 catch(e){console.error('mail_send_failed');return Response.json({error:e.message||'发送失败'},{status:400});}
}
