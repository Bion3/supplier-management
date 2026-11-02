// Source timestamps are local clock values; time zones are not supplied by operators.
export const DAY=86400000;
export function workbookSheets(wb,XLSX){return wb.SheetNames.map(name=>{const ws=wb.Sheets[name],end=XLSX.utils.decode_range(ws['!ref']||'A1').e;return {name,rows:XLSX.utils.sheet_to_json(ws,{header:1,defval:null,raw:true,range:{s:{r:0,c:0},e:end}})};});}
const str=v=>v==null?'':String(v).trim();
export function dateValue(v){
 if(v instanceof Date)return v.toISOString().slice(0,19);
 if(typeof v==='number'&&v>40000&&v<60000)return new Date(Math.round((v-25569)*DAY)).toISOString().slice(0,19);
 const s=str(v),m=s.match(/^(20\d{2})[-/](\d{1,2})[-/](\d{1,2})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
 if(!m)return null;
 const [,y,mo,d,h='00',mi='00',se='00']=m,dt=new Date(Date.UTC(+y,+mo-1,+d,+h,+mi,+se));
 if(dt.getUTCMonth()!==+mo-1||dt.getUTCDate()!==+d||+h>23||+mi>59||+se>59)return null;
 return dt.toISOString().slice(0,19);
}
export const ms=v=>v?Date.parse(v+'Z'):NaN;
export const days=(a,b)=>{const n=(ms(b)-ms(a))/DAY;return Number.isFinite(n)&&n>=0&&n<=180?n:null;};
export function trainKey(name){const s=str(name).toUpperCase().replace(/\s+/g,' ');return (s.match(/WBE\d{8}|XIAN-\d+ WB\d{4}|WB\d{4}(?:-\d+)?/)||[])[0]||s;}
// User confirmed the worksheet service date as the Xi'an dispatch date.
// Preserve actual timestamps separately; a label supplies day precision only.
export function departureInfo(t){return t.departure?{value:t.departure,precision:'time',basis:t.departureBasis||'实际西安发车记录'}:t.planned?{value:t.planned.slice(0,10),precision:'day',basis:'工作表班次标签发运日期（用户确认）'}:{value:null,precision:null,basis:'缺发运日期'};}
export function fromXianDays(t,end){const d=departureInfo(t);if(!d.value||!end||t.asOf&&end.slice(0,10)>t.asOf)return null;return d.precision==='day'?days(d.value+'T00:00:00',end.slice(0,10)+'T00:00:00'):days(d.value,end);}
export function destination(v){const s=str(v);if(/^(dui|duis|duisburg)$/i.test(s))return 'Duisburg';if(/^(hh|ham|hamburg)$/i.test(s))return 'Hamburg';if(/^(mala|malaszewicze)$/i.test(s))return 'Malaszewicze';return s||'未注明';}
function embedded(text,label){const m=text.match(new RegExp(label+'\\s+(20\\d{2}[/-]\\d{1,2}[/-]\\d{1,2}(?:\\s+\\d{1,2}:\\d{2}(?::\\d{2})?)?)','i'));return m?dateValue(m[1]):null;}
export function parseSheets(sheets,{operator,filename,asOf}){
 const trains=[],incidents=[],domestic=[],warnings=[];
 for(const sheet of sheets){
  const rows=sheet.rows||[],first=rows[0]||[];
  if(str(first[0]).toLowerCase()==='train'&&/cntr/i.test(str(first[1]))){
   let context=null;
   for(let i=1;i<rows.length;i++){
    const r=rows[i],newCase=!!str(r[1]);
    if(newCase){context={train:str(r[0])||context?.train||'',container:str(r[1]),dest:destination(r[2]),problem:str(r[3]),finished:str(r[6]),events:[],row:i+1};incidents.push(context);}
    if(!context)continue;
    if(str(r[6]))context.finished=str(r[6]);
    if(str(r[3]))context.problem=str(r[3]);
    if(str(r[5])||dateValue(r[4]))context.events.push({at:dateValue(r[4]),text:str(r[5]),row:i+1});
   }
   continue;
  }
  if(str(first[0]).includes('班次号')){
   const events=rows.slice(2).map((r,i)=>({station:str(r[1]),at:dateValue(r[2]),remark:str(r[3]),row:i+3})).filter(x=>x.at);
   const departure=events.find(x=>/西安国际港/.test(x.station))?.at||null;
   domestic.push({name:sheet.name,train:str(first[1]),operator:str(first[3]),departure,events});continue;
  }
  const header=rows.findIndex(r=>r.some(v=>str(v).toLowerCase()==='container')&&r.some(v=>str(v)==='ATA DEST'));
  if(header<0)continue;
  const h=rows[header].map(v=>str(v).toLowerCase()),col=(r,n)=>r[h.indexOf(n.toLowerCase())];
  const top=rows.slice(0,header),events=[];let lastDate=null;
  for(let i=2;i<top.length;i++){
   const r=top[i],at=dateValue(r[1]);if(at)lastDate=at;
   if(lastDate&&str(r[2])&&!/EU part|All lastest/i.test(str(r[1])))events.push({at:lastDate,location:str(r[2]),km:Number.isFinite(+r[3])&&str(r[3])!==''?+r[3]:null,remark:str(r[6]),row:i+1});
  }
  const remarks=top.map(r=>str(r[6])).join(' '),brestHeader=top.findIndex(r=>/Latest ATA Brest/i.test(str(r[4]))),getTop=c=>top.slice(2,brestHeader<0?top.length:brestHeader).map(r=>dateValue(r[c])).find(Boolean)||null;
  const latest={};
  for(let i=0;i<top.length;i++)if(/latest (ata|atd)/i.test(str(top[i][13])))latest[str(top[i][13])]=dateValue(top[i+1]?.[13]);
  const containers=[];
  for(let i=header+1;i<rows.length;i++){
   const r=rows[i],number=str(col(r,'Container')).replace(/\s/g,'').toUpperCase();if(!/^[A-Z]{4}\d{7}$/.test(number))continue;
   containers.push({number,part:str(col(r,'Part')),remark:str(col(r,'remark')),size:str(col(r,'Size')),dest:destination(col(r,'Destination')),mala:dateValue(col(r,'ATA Mala')),etd:dateValue(col(r,'ETD  Mala')||col(r,'ETD Mala')),euDeparture:dateValue(col(r,'ATD Mala')),eta:dateValue(col(r,'ETA DEST')),arrival:dateValue(col(r,'ATA DEST')),terminal:str(col(r,'Destination terminal')),row:i+1});
  }
  if(!containers.length)continue;
  const key=trainKey(sheet.name),code=key.match(/^WBE(\d{2})(\d{2})(\d{2})/);
  // `planned` is retained for storage compatibility: the label date is a user-confirmed
  // dispatch date at day precision, and must not become a fabricated midnight ATD.
  let planned=code?dateValue(`20${code[1]}-${code[2]}-${code[3]}`):null;
  const departure=embedded(remarks,'ATD XIAN'),borderArrival=getTop(4)||embedded(remarks,'ATA (?:Dostyk|Altynkol)'),borderDeparture=getTop(5)||embedded(remarks,'ATD (?:Dostyk|Altynkol)');
  const legacy=key.match(/WB(\d{2})(\d{2})(?:-|$)/);if(!planned&&legacy){const year=(departure||borderArrival||lastDate||asOf||'').slice(0,4);planned=dateValue(`${year}-${legacy[1]}-${legacy[2]}`);}
  const labelDate=(label,c)=>{const i=top.findIndex(r=>new RegExp(label,'i').test(str(r[c])));return i>=0?dateValue(top[i+1]?.[c]):null;};
  const t={key,name:sheet.name,operator,filename,asOf,departure,departureBasis:departure?'运营商 ATD XIAN':null,planned,borderArrival,borderDeparture,brestArrival:labelDate('Latest ATA Brest',4),brestDeparture:labelDate('Latest ATD Brest',5),latest,events,containers};
  trains.push(t);
 }
 const merged=new Map();for(const x of incidents){const id=trainKey(x.train)+'|'+x.container+'|'+x.problem.toLowerCase();if(merged.has(id)){const p=merged.get(id);p.events.push(...x.events);p.finished=x.finished||p.finished;}else merged.set(id,x);}
 incidents.splice(0,incidents.length,...merged.values());
 for(const x of incidents){x.events.sort((a,b)=>(a.at||'').localeCompare(b.at||''));x.key=trainKey(x.train);x.operator=operator;x.filename=filename;x.asOf=asOf;x.open=!/^y(es)?$/i.test(x.finished);}
 if(!trains.length&&!incidents.length&&!domestic.length)warnings.push('未识别到支持的运踪模板');
 return {trains,incidents,domestic,warnings};
}
export function attachDomestic(trains,domestic,universe=trains){
 for(const t of trains){
  if(t.departure)continue;
  const m=t.key.match(/WB(\d{4})/),year=(t.borderArrival||t.asOf||'').slice(0,4);
  if(!m)continue;
  if(universe.filter(p=>p.operator===t.operator&&p.key.match(/WB(\d{4})/)?.[1]===m[1]&&(p.borderArrival||p.asOf||'').slice(0,4)===year).length!==1)continue;
  const matches=domestic.filter(d=>d.name.startsWith('WB'+m[1]+'-')&&d.operator.toUpperCase().trim()===t.operator&&d.departure?.startsWith(year));
  if(matches.length===1){t.departure=matches[0].departure;t.departureBasis='国内运踪唯一匹配（运营商＋班次月日＋年份）';t.domesticTrain=matches[0].train;t.domesticEvents=matches[0].events;}
 }
 return trains;
}
export function stage(c,t){
 if(c.arrival)return '已到达';if(c.euDeparture)return '欧洲段';if(c.mala)return '马拉待转';
 const last=(t.events||[]).map(e=>e.at).sort().at(-1),locations=(t.events||[]).filter(e=>e.at===last).map(e=>e.location);
 if(locations.length&&locations.every(l=>/Brest/i.test(l)))return '布列斯特（位置记录）';
 if(locations.some(l=>/Dostyk|Altynkol/i.test(l))&&locations.some(l=>!/Dostyk|Altynkol/i.test(l)))return '分批在途';
 if(!t.borderDeparture&&locations.length&&locations.every(l=>!/Dostyk|Altynkol/i.test(l)))return '独联体段（ATD缺失）';
 if(t.brestArrival)return '布列斯特';if(t.borderDeparture)return '独联体段';if(t.borderArrival)return '口岸待转';if(t.departure)return '国内段';return '待确认';
}
export function summarize(t){
 const dests=[...new Set(t.containers.map(c=>c.dest))].map(dest=>{
  const cs=t.containers.filter(c=>c.dest===dest),arrived=cs.filter(c=>c.arrival),last=arrived.map(c=>c.arrival).sort().at(-1)||null;
  const malas=cs.map(c=>c.mala).filter(Boolean).sort(),eus=cs.map(c=>c.euDeparture).filter(Boolean).sort();
  const stages={};for(const c of cs){const k=stage(c,t);stages[k]=(stages[k]||0)+1;}
  return {dest,total:cs.length,arrived:arrived.length,arrival:last,complete:arrived.length===cs.length,totalDays:arrived.length===cs.length?fromXianDays(t,last):null,dateBased:!t.departure&&!!t.planned,malaDays:malas.length===cs.length?days(t.borderDeparture,malas.at(-1)):null,euDays:arrived.length===cs.length&&eus.length===cs.length?days(eus[0],last):null,stages};
 });
 const stages={};for(const c of t.containers){const k=stage(c,t);stages[k]=(stages[k]||0)+1;}
 const last=t.events.map(e=>e.at).filter(Boolean).sort().at(-1)||null;
 const dispatch=departureInfo(t),mala=Object.entries(t.latest||{}).find(([k])=>/^Latest ATA Mala$/i.test(k))?.[1];
 return {key:t.key,name:t.name,operator:t.operator,filename:t.filename,asOf:t.asOf,origin:'西安',dispatchDate:dispatch.value,dispatchPrecision:dispatch.precision,dispatchBasis:dispatch.basis,xianBorderDays:fromXianDays(t,t.borderArrival),xianBrestDays:fromXianDays(t,t.brestArrival),xianMalaDays:fromXianDays(t,mala),departure:t.departure,departureBasis:t.departureBasis,planned:t.planned,borderArrival:t.borderArrival,borderDeparture:t.borderDeparture,borderDays:days(t.borderArrival,t.borderDeparture),dests,stages,total:t.containers.length,arrived:t.containers.filter(c=>c.arrival).length,lastUpdate:last,locations:t.events.filter(e=>e.at===last),remarks:t.containers.filter(c=>c.remark).length,containerNos:t.containers.map(c=>c.number)};
}
export function stats(values){const a=values.filter(v=>v!==null&&Number.isFinite(v)).sort((a,b)=>a-b);return {n:a.length,mean:a.length?a.reduce((s,v)=>s+v,0)/a.length:null,median:a.length?(a[Math.floor((a.length-1)/2)]+a[Math.ceil((a.length-1)/2)])/2:null,p90:a.length?a[Math.ceil(a.length*.9)-1]:null};}
export function recent(t,start,end){const d=t.departure||t.planned;return !!d&&d.slice(0,10)>=start&&d.slice(0,10)<=end;}
