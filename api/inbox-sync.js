import {send as enqueue} from '@vercel/queue';
import {makeInboxService} from '../server/inbox-service.js';
import {makeService} from '../server/mail-service.js';
export const maxDuration=150;
export async function GET(request){const token=(request.headers.get('authorization')||'').replace(/^Bearer /i,'');const service=makeInboxService({enqueue});try{if(process.env.FEISHU_SYNC_SECRET&&token===process.env.FEISHU_SYNC_SECRET)return Response.json(await service.sync(),{headers:{'Cache-Control':'no-store'}});await makeService().authorize(token);return Response.json(await service.status(),{headers:{'Cache-Control':'no-store'}});}catch(e){return Response.json({error:e.message},{status:400});}}
export async function POST(request){try{await makeService().authorize((request.headers.get('authorization')||'').replace(/^Bearer /i,''));return Response.json(await makeInboxService({enqueue}).sync(),{headers:{'Cache-Control':'no-store'}});}catch(e){return Response.json({error:e.message},{status:400});}}
