import {send as enqueue} from '@vercel/queue';
import {queueOptions} from '../src/mail-rules.js';

const url='https://hcorkkudgicarsmexnqf.supabase.co/rest/v1/rpc/freight_mail_daily_prepare';
const key='sb_publishable_nB2eShVqNNkND-zOSHYSnQ_Pf2xtBgp';

export function createDailyHandler({fetcher=fetch,send=enqueue,env=process.env,now=()=>Date.now()}={}){
  return async function GET(request){
    if(!env.CRON_SECRET||!env.MAIL_WORKER_SECRET||request.headers.get('authorization')!==`Bearer ${env.CRON_SECRET}`)
      return Response.json({error:'Unauthorized'},{status:401});
    try{
      const response=await fetcher(url,{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},
        body:JSON.stringify({p_secret:env.MAIL_WORKER_SECRET,p_preview:false}),signal:AbortSignal.timeout(20000)});
      if(!response.ok)throw Error('Daily preparation failed');
      const rows=await response.json();
      if(!Array.isArray(rows)||rows.length>10)throw Error('Invalid daily result');
      let queued=0;
      for(const row of rows){
        if(row.status!=='scheduled')continue;
        if(!/^[0-9a-f-]{36}$/i.test(row.id||''))throw Error('Invalid mail id');
        await send('freight-mail',{id:row.id},queueOptions(row.id,row.scheduled_at,now()));
        queued++;
      }
      return Response.json({prepared:rows.length,queued},{headers:{'Cache-Control':'no-store'}});
    }catch(e){console.error('mail_daily_failed',e.message);return Response.json({error:'Daily outreach failed'},{status:500});}
  };
}

export const GET=createDailyHandler();
