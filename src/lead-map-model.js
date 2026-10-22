const uuid=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
export function distance(lat1,lon1,lat2,lon2){
 const toRad=Math.PI/180;
 const dLat=(lat2-lat1)*toRad,dLon=(lon2-lon1)*toRad;
 const a=Math.sin(dLat/2)**2+Math.cos(lat1*toRad)*Math.cos(lat2*toRad)*Math.sin(dLon/2)**2;
 return 6371.0088*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}
export function classify(row){
 const cat=(row.category||'').toLowerCase(),name=(row.name||'').toLowerCase();
 if(/freight|forward|spedition|logisti|transport|shipping|cargo|container|customs|zoll|trucking/.test(cat+' '+name))return 'freight';
 if(/import|export|trading|handel/.test(cat+' '+name))return 'trade';
 if(/wholesale|wholesaler|distribut|großhandel|grosshandel/.test(cat+' '+name))return 'wholesale';
 return 'other';
}
export function normalize(raw,source){
 const x=raw?.type==='Feature'?raw.properties||{}:raw||{};
 const coords=raw?.geometry?.type==='Point'?raw.geometry.coordinates:null;
 let lat=Number(x.lat??x.map_lat??(coords?.[1])),lng=Number(x.lng??x.map_lng??(coords?.[0]));
 // Missing positions must never default to (0,0).
 if((x.lat==null&&x.map_lat==null&&!coords)||(x.lng==null&&x.map_lng==null&&!coords))return null;
 if(!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180)return null;
 const id=String(x.id||raw?.id||'').trim(),name=String(x.name||x.company_name||x.names?.primary||'').trim();
 if(!name||!uuid.test(id))return null;
 const website=String(x.website||x.websites?.[0]||'').trim();
 const item={id,name,dbId:x.dbId||null,contacts:Array.isArray(x.contacts)?x.contacts:[],verificationStatus:x.verification_status||'unverified',category:String(x.category||x.map_category||x.taxonomy?.primary||x.basic_category||''),lat,lng,website,address:String(x.address||x.addresses?.[0]?.freeform||''),sources:x.sources||[],source,reviewStatus:x.review_status||'pending',quality:x.quality_score||null};
 item.type=classify(item);return item;
}
export function parseGeoText(text,filename){
 if(text.length>12*1024*1024)throw Error('文件超过12MB，请拆分');
 let data;
 if(/\.geojson$|\.json$/i.test(filename)){
  const obj=JSON.parse(text);data=Array.isArray(obj)?obj:obj?.type==='FeatureCollection'?obj.features:null;
  if(!data)throw Error('JSON 必须是数组或 FeatureCollection');
 }else{
  data=text.split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line.trim().replace(/^\x1e/,'')));
 }
 if(data.length>5000)throw Error('单个文件最多5000条');
 const valid=new Map();let missing=0;
 for(const x of data){const row=normalize(x,'file');if(row)valid.set(row.id,row);else missing++;}
 return {rows:[...valid.values()],missing,original:data.length};
}

export function contactChannels(row){
 const contacts=Array.isArray(row?.contacts)?row.contacts:[];
 const emails=contacts.filter(c=>['email','邮箱'].includes(c?.type)&&typeof c?.value==='string'&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.value)).map(c=>c.value.trim());
 const phones=contacts.filter(c=>['phone','电话'].includes(c?.type)&&typeof c?.value==='string'&&c.value.replace(/\D/g,'').length>=6).map(c=>c.value.trim());
 return {emails:[...new Set(emails)],phones:[...new Set(phones)],email:emails.length>0,phone:phones.length>0};
}
export function contactFilterMatches(row,filter='any'){
 const c=contactChannels(row);
 if(filter==='has_contact')return c.email||c.phone;
 if(filter==='email')return c.email;
 if(filter==='phone')return c.phone;
 if(filter==='both')return c.email&&c.phone;
 if(filter==='none')return !c.email&&!c.phone;
 return true;
}
export function contactPriority(row){
 const c=contactChannels(row);
 return (c.email?2:0)+(c.phone?1:0);
}
