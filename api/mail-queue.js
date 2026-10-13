import {handleCallback,send} from '@vercel/queue';
import nodemailer from 'nodemailer';
import {makeWorker} from '../server/mail-worker.js';
export const POST=handleCallback(makeWorker({enqueue:send,createTransport:nodemailer.createTransport}),{retry:(error,metadata)=>{afterSeconds:Math.min(3600,60*2**Math.min(metadata.deliveryCount,6))}});
