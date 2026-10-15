// Free OSM discovery for small city areas. Public endpoints are best-effort, not bulk infrastructure.
const BASE='https://hcorkkudgicarsmexnqf.supabase.co';
const PUB='sb_publishable_nB2eShVqNNkND-zOSHYSnQ_Pf2xtBgp';
const out=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
const timeout=ms=>AbortSignal.timeout(ms);
const clean=x=>String(x||'').trim().slice(0,100);
const categories={
 'freight forwarder':['freight','forward','spedition','logistic','transport','cargo'],
 'logistics company':['logistic','transport','warehouse','spedition','freight'],
 'import export company':['import','export','wholesal','trade','handel'],
 'wholesale distributor':['wholesal','distribut','grosshandel','großhandel','trade']
};
const qescape=x=>x.replace(/[\\\[\]().*+?^$|{}]/g,'\\$&');
export async function POST(request){
 try{
  if(Number(request.headers.get('content-length')||0)>2048)return out({error:'请求太大'},413);
  const token=(request.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
  if(!token)return out({error:'请登录 CRM'},401);
  const {task_id}=await request.json();
  if(!/^[a-f0-9-]{36}$/i.test(task_id||''))return out({error:'任务 ID 无效'},400);
  const res=await fetch(BASE+'/rest/v1/lead_discovery_tasks?select=id,country,city,keywords&id=eq.'+encodeURIComponent(task_id),{headers:{apikey:PUB,Authorization:'Bearer '+token},signal:timeout(9000)});
  if(!res.ok)return out({error:'没有权限或任务表不可用'},403);
  const rows=await res.json(),task=rows[0];if(!task)return out({error:'找不到任务'},404);
  if(!clean(task.city)||!clean(task.country))return out({error:'请填写城市和国家'},400);
  // Public Nominatim use: one server-side geocoding request per button click, with clear user agent.
  const geo=await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&city='+encodeURIComponent(clean(task.city))+'&country='+encodeURIComponent(clean(task.country)),{headers:{'User-Agent':'EurasiagoLeadDiscovery/1.0 (contact: benjamin@eurasiago.com)','Accept':'application/json'},signal:timeout(10000)});
  if(!geo.ok)return out({error:'城市地理编码服务暂不可用'},503);
  const places=await geo.json();if(!places.length)return out({error:'未识别城市，请使用标准城市名称'},404);
  let [south,north,west,east]=(places[0].boundingbox||[]).map(Number);
  if([south,north,west,east].some(x=>!Number.isFinite(x)))return out({error:'地区边界不可用'},502);
  const lat=(north+south)/2,lon=(west+east)/2;
  // Avoid excessive public Overpass requests for an entire country or megaregion.
  const maxHalf=0.12;south=Math.max(south,lat-maxHalf);north=Math.min(north,lat+maxHalf);west=Math.max(west,lon-maxHalf);east=Math.min(east,lon+maxHalf);
  const keywords=Array.isArray(task.keywords)?task.keywords.slice(0,4).map(clean):[];
  const terms=[...new Set(keywords.flatMap(k=>categories[k.toLowerCase()]||k.toLowerCase().split(/\s+/).filter(w=>w.length>=4)).filter(x=>x.length>=3&&x.length<=30))].slice(0,12);
  if(!terms.length)return out({error:'未填写有效行业关键词'},400);
  const pattern=terms.map(qescape).join('|'),bounds=[south,west,north,east].join(',');
  const query='[out:json][timeout:20];(nwr["name"~"'+pattern+'",i]('+bounds+');nwr["office"~"^(logistics|company|transport|freight)$",i]('+bounds+');nwr["industrial"~"^(warehouse|logistics)$",i]('+bounds+'););out center 80;';
  const over=await fetch('https://overpass.kumi.systems/api/interpreter',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','User-Agent':'EurasiagoLeadDiscovery/1.0 (contact: benjamin@eurasiago.com)'},body:new URLSearchParams({data:query}),signal:timeout(26000)});
  if(!over.ok)return out({error:'公共 OSM 查询繁忙或超出配额，请稍后重试'},503);
  const data=await over.json(),seen=new Set(),results=[];
  for(const p of data.elements||[]){
   const tags=p.tags||{},name=tags.name||tags['name:en'];if(!name)continue;
   const dedupe=(tags.website||tags['contact:website']||name).toLowerCase().replace(/\W/g,'');
   if(seen.has(dedupe))continue;seen.add(dedupe);
   const point=p.center||p;
   results.push({place_id:p.type+'/'+p.id,name,address:[tags['addr:street'],tags['addr:housenumber'],tags['addr:city']].filter(Boolean).join(' '),website:tags.website||tags['contact:website']||'',phone:tags.phone||tags['contact:phone']||'',email:tags.email||tags['contact:email']||'',maps_url:'https://www.openstreetmap.org/'+p.type+'/'+p.id,lat:point.lat,lon:point.lon,source:'openstreetmap'});
  }
  return out({results,keyword_count:keywords.length,notice:'© OpenStreetMap contributors · ODbL；公共服务仅供低频、小区域交互搜索。未自动保存。',bounded:true});
 }catch(e){return out({error:e?.name==='TimeoutError'?'地图服务超时，请缩小区域再试':'免费地图搜索失败'},500);}
}
