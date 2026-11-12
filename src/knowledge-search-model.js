import {effectiveStatus} from './knowledge-model.js';
const norm=v=>String(v||'').normalize('NFKC').toLowerCase().replace(/\s+/g,'').trim();
const contains=(text,query)=>norm(text).includes(norm(query));
const synonyms=[['硒鼓','碳粉盒','tonercartridge'],['汉堡','hamburg'],['杜伊斯堡','duisburg'],['西安','新筑','西安国际港'],['武汉','wuhan'],['铁路','班列','rail']];
function matches(text,query){const q=norm(query);return !!q&&(contains(text,q)||synonyms.some(g=>g.includes(q)&&g.some(n=>contains(text,n))));}
function codes(text){return [...String(text||'').matchAll(/(?:\bHS(?:\s*CODE|\s*编码|\s*栏原值|\s*号|\s*码)?|商品编码|商编|税号|海关编码)\s*[:：]?\s*([0-9][0-9.]{1,14})/gi)].map(m=>m[1].replace(/\./g,''));}
function excerpt(entry,terms){const text=String(entry.content||'');const lines=text.split(/\r?\n/).filter(l=>l.trim());const index=lines.findIndex(l=>terms.some(t=>matches(l,t)));const start=index<0?0:index;const selected=lines.slice(start,start+3).join('\n');return selected.length>480?selected.slice(0,480)+'…':selected;}
export function searchKnowledge(input,{entries=[],routes=[],stations=[],sources=[],suppliers=[],topics=[],topicLinks=[]},today){
 const q=Object.fromEntries(Object.entries(input).map(([k,v])=>[k,String(v||'').trim()]));
 const hs=norm(q.hs).replace(/^hscode|^hs/,'').replace(/[.\s]/g,'');
 if(q.hs&&!/^\d{2,12}$/.test(hs))throw Error('请输入2至12位HS编码或编码前缀，如33、3301。');
 const routeMap=new Map(routes.map(r=>[r.id,r])),stationMap=new Map(stations.map(s=>[s.id,s])),sourceMap=new Map(sources.map(s=>[s.id,s])),supplierMap=new Map(suppliers.map(s=>[s.id,s])),topicMap=new Map(topics.map(t=>[t.id,t]));
 const terms=[q.cargo,q.origin,q.destination,q.supplier,hs].filter(Boolean),results=[];
 for(const e of entries){
  const r=routeMap.get(e.route_id)||{},st=stationMap.get(e.station_id)||{},src=sourceMap.get(e.source_id)||{},supplier=supplierMap.get(e.supplier_id)||{};
  const own=[e.title,e.content,e.scope,e.source].join(' '),stationText=[st.name,st.english_name,st.aliases,st.raw_name].join(' '),routeText=[r.name,r.code,r.origin,r.destination,r.nodes].join(' ');
  if(q.cargo&&!matches(own,q.cargo))continue;
  const hsMatches=hs?codes(own).filter(c=>c.startsWith(hs)||hs.startsWith(c)):[];
  if(hs&&!hsMatches.length)continue;
  if(q.route&&!matches(routeText,q.route)&&!matches([e.title,e.scope].join(' '),q.route))continue;
  // Search references as well as structured fields; the result retains its scope rather than claiming applicability.
  if(q.origin&&!matches([r.origin,stationText,own].join(' '),q.origin))continue;
  if(q.destination&&!matches([r.destination,stationText,own].join(' '),q.destination))continue;
  if(q.supplier&&!matches([supplier.name,supplier.company_name,own].join(' '),q.supplier))continue;
  if(q.supplier_id&&q.supplier_id!==e.supplier_id)continue;
  const mode=norm(q.mode),transport=mode.replace(/拼箱|整箱|lcl|fcl/g,'');
  const modeText=[r.category,r.name,e.shipment_type,own].join(' ');
  if(transport&&!matches(modeText,transport))continue;
  if(/拼箱|lcl/.test(mode)&&!/(拼箱|lcl)/i.test(modeText))continue;
  if(/整箱|fcl/.test(mode)&&!/(整箱|fcl)/i.test(modeText))continue;
  let status=effectiveStatus(e,today);
  const sourceStatus=effectiveStatus({...src,status:'已核实'},today);if(sourceStatus!=='已核实')status=sourceStatus;
  if(entries.some(n=>n.supersedes_id===e.id&&n.effective_from&&n.effective_from<=today&&effectiveStatus(n,today)==='已核实'))status='已被替代';
  if(sources.some(n=>n.supersedes_id===src.id&&n.effective_from&&n.effective_from<=today&&(!n.valid_until||n.valid_until>=today)))status='已被替代';
  const score=terms.reduce((sum,t)=>sum+(matches(e.title,t)?8:matches(e.scope,t)?4:0),0)+(hsMatches.includes(hs)?6:0);
  results.push({...e,resultStatus:status,score,excerpt:excerpt(e,terms),station_name:st.name,route_name:r.name,supplier_name:supplier.name||supplier.company_name,source_name:src.file_name,topic_names:topicLinks.filter(l=>l.entry_id===e.id).map(l=>topicMap.get(l.topic_id)?.name).filter(Boolean).join(' · ')});
 }
 return results.sort((a,b)=>b.score-a.score||String(b.updated_at||'').localeCompare(String(a.updated_at||''))||String(a.id).localeCompare(String(b.id)));
}
