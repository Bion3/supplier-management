// Public HMRC activity collector. Prints at most 50 enterprises; no credentials required.
import {hmrcOptions,hmrcCSVURL,hmrcEntries} from '../../src/hmrc-model.js';
const options=hmrcOptions({hs:process.argv[2]||'854143',year:process.argv[3]||String(new Date().getUTCFullYear()),page:process.argv[4]||1});
const response=await fetch(hmrcCSVURL(options),{redirect:'error',signal:AbortSignal.timeout(20000),headers:{Accept:'text/csv','User-Agent':'EurasiagoCRM/1.0 (+https://eurasiago.com)'}});
if(!response.ok)throw Error('HMRC returned '+response.status+'; stop without bypassing access restrictions');
const reader=response.body.getReader(),chunks=[];let size=0;try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>2000000){await reader.cancel();throw Error('Result exceeds 2MB; narrow to an 8-digit code');}chunks.push(value);}}finally{reader.releaseLock();}
console.log(JSON.stringify(hmrcEntries(Buffer.concat(chunks).toString('utf8'),options),null,2));
