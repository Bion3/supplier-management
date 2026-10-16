import {handleCallback,send} from '@vercel/queue';
import {makeLeadWorker} from '../server/lead-enrich-worker.js';
export const maxDuration=300;
export const POST=handleCallback(makeLeadWorker({enqueue:send}));
