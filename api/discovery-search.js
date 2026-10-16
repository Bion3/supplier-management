// On-demand Google Places Text Search (New). Google content is returned transiently, not stored.
const BASE='https://hcorkkudgicarsmexnqf.supabase.co';
const PUB='sb_publishable_nB2eShVqNNkND-zOSHYSnQ_Pf2xtBgp';
const headers={ 'Cache-Control':'no-store' };
function reply(payload,status=200){return Response.json(payload,{status,headers});}
export async function POST(request){
 try{
  if(Number(request.headers.get('content-length')||0)>2048)return reply({error:'请求过大'},413);
  const token=(request.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
  if(!token)return reply({error:'请先登录'},401);
  const body=await request.json();
  const id=String(body.task_id||'');
  if(!/^[a-f0-9-]{36}$/i.test(id))return reply({error:'任务编号无效'},400);
  const authHeaders={apikey:PUB,Authorization:'Bearer '+token};
  // Query is subject to the same CRM RLS as the logged-in user.
  const taskRes=await fetch(BASE+'/rest/v1/lead_discovery_tasks?id=eq.'+encodeURIComponent(id)+'&select=id,country,city,keywords,status&limit=1',{headers:authHeaders,signal:AbortSignal.timeout(8000)});
  if(!taskRes.ok)return reply({error:'任务读取失败，请确认数据表和权限'},403);
  const tasks=await taskRes.json(),t=tasks[0];
  if(!t)return reply({error:'任务不存在或没有访问权限'},404);
  if(t.status==='running')return reply({error:'任务正在执行，请稍后再试'},409);
  const key=process.env.GOOGLE_MAPS_API_KEY;
  if(!key)return reply({error:'尚未在 Vercel 配置 GOOGLE_MAPS_API_KEY'},503);
  // One interactive request executes at most 2 keywords, 20 results each, to bound API cost.
  const keywords=Array.isArray(t.keywords)?t.keywords.filter(x=>typeof x==='string'&&x.length<=100).slice(0,2):[];
  if(!keywords.length)return reply({error:'任务缺少有效关键词'},400);
  const results=[],seen=new Set(),errors=[];
  for(const keyword of keywords){
   const resp=await fetch('https://places.googleapis.com/v1/places:searchText',{method:'POST',headers:{'Content-Type':'application/json','X-Goog-Api-Key':key,'X-Goog-FieldMask':'places.id,places.displayName,places.formattedAddress,places.websiteUri,places.googleMapsUri,places.nationalPhoneNumber'},body:JSON.stringify({textQuery:[keyword,t.city,t.country].filter(Boolean).join(' '),pageSize:20}),signal:AbortSignal.timeout(12000)});
   const payload=await resp.json().catch(()=>({}));
   if(!resp.ok){errors.push(keyword+': '+(payload.error?.message||'Places API 请求失败'));continue;}
   for(const place of payload.places||[]){
    if(!place.id||seen.has(place.id))continue;seen.add(place.id);
    results.push({place_id:place.id,name:place.displayName?.text||'',address:place.formattedAddress||'',website:place.websiteUri||'',maps_url:place.googleMapsUri||'',phone:place.nationalPhoneNumber||'',keyword});
   }
  }
  if(!results.length&&errors.length)return reply({error:errors.join('；')},502);
  return reply({results,errors,keyword_count:keywords.length,notice:'Google 搜索结果仅供实时查看，不自动持久化；独立核实后才能录入 CRM。'});
 }catch(e){return reply({error:e.name==='TimeoutError'?'搜索超时': '搜索失败，请检查配置及任务状态'},500);}
}
