import {handleCallback,send as enqueue} from '@vercel/queue';
import {makeBatchDispatcher} from '../server/mail-batch-dispatcher.js';
export const maxDuration=300;
export const POST=handleCallback(makeBatchDispatcher({enqueue}));
