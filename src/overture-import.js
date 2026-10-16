// Accept downloaded Overture Places GeoJSON, FeatureCollection, or NDJSON.
// Import is bounded and requires the operator to choose a specific Overture search task.
const clean=x=>typeof x==='string'?x.trim():'';
const first=x=>Array.isArray(x)?x.find(v=>typeof v==='string'&&v.trim())||'':'';
export function normalizeOverturePlace(raw){
 const x=raw?.type==='Feature'?raw.properties||{}:raw||{};
 const id=clean(x.id||raw?.id),name=clean(x.names?.primary||x.name||x.primary_name);
 if(!/^[0-9a-f-]{36}$/i.test(id)||!name)return null;
 const category=clean(x.taxonomy?.primary||x.basic_category||x.category||x.categories?.primary||'');
 const address=clean(x.addresses?.[0]?.freeform||x.address||'');
 const website=first(x.websites)||clean(x.website);
 const emails=Array.isArray(x.emails)?x.emails.filter(v=>typeof v==='string').slice(0,10):[];
 const phones=Array.isArray(x.phones)?x.phones.filter(v=>typeof v==='string').slice(0,10):[];
 const sources=Array.isArray(x.sources)?x.sources.slice(0,8).map(v=>({dataset:clean(v.dataset),license:clean(v.license),provider:clean(v.provider),resource:clean(v.resource)})):[];
 return {id,name:name.slice(0,240),category:category.slice(0,120),address:address.slice(0,500),website:website.slice(0,500),emails,phones,sources};
}
export function parseOvertureText(input,filename=''){
 if(typeof input!=='string'||input.length>12*1024*1024)throw Error('文件过大，单次最多12MB；请按城市拆分导入。');
 let raw;
 const name=filename.toLowerCase();
 if(name.endsWith('.geojson')||name.endsWith('.json')){const parsed=JSON.parse(input);raw=Array.isArray(parsed)?parsed:parsed.type==='FeatureCollection'?parsed.features:null;if(!raw)throw Error('JSON 必须是企业数组或 GeoJSON FeatureCollection');}
 else if(name.endsWith('.ndjson')||name.endsWith('.geojsonl')||name.endsWith('.jsonl')){raw=input.split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line));}
 else throw Error('仅支持 .geojson、.json、.ndjson、.geojsonl、.jsonl');
 if(raw.length>5000)throw Error('单文件最多5000条，请拆分文件。');
 const dedup=new Map();let invalid=0;
 for(const item of raw){const record=normalizeOverturePlace(item);if(!record){invalid++;continue;}if(!dedup.has(record.id))dedup.set(record.id,record);}
 return {rows:[...dedup.values()],invalid,duplicate:raw.length-invalid-dedup.size,original:raw.length};
}
