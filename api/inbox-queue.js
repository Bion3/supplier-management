import {handleCallback,send as enqueue} from '@vercel/queue';
import {makeInboxService} from '../server/inbox-service.js';
export const maxDuration=150;
export const POST=handleCallback(async()=>{await makeInboxService({enqueue}).sync();});
