// Workbook expansion lives only in this disposable worker, never in the page heap.
importScripts('/src/vendor/xlsx.full.min.js');
let resume;
self.onmessage=async({data})=>{
 if(data.ack){resume?.();return;}
 try{
  const {parseSheets,attachDomestic,summarize,workbookSheets}=await import('./tracking-model.js');
  const {file,operator,asOf,mode,domestic=[],universe=[]}=data;let bytes=await file.arrayBuffer();
  const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');
  const wb=XLSX.read(bytes,{type:'array',dense:true,cellDates:false});bytes=null;
  const counts={trains:0,containers:0,incidents:0,domestic:0},index=[];let batch={trains:[],cases:[],domestic:[]},batchCount=0;
  const send=async()=>{if(!batchCount)return;const waiting=new Promise(resolve=>resume=resolve);self.postMessage({type:'batch',batch});await waiting;batch={trains:[],cases:[],domestic:[]};batchCount=0;};
  for(let i=0;i<wb.SheetNames.length;i++){
   const name=wb.SheetNames[i],sheets=workbookSheets({SheetNames:[name],Sheets:{[name]:wb.Sheets[name]}},XLSX),p=parseSheets(sheets,{operator,filename:file.name,asOf});
   delete wb.Sheets[name];
   if((operator==='CN'&&p.trains.length)||(operator!=='CN'&&p.domestic.length))throw Error('来源选择与模板不一致，请检查运营商 / CN');
   counts.trains+=p.trains.length;counts.containers+=p.trains.reduce((s,t)=>s+t.containers.length,0);counts.incidents+=p.incidents.length;counts.domestic+=p.domestic.length;
   if(mode==='preview')for(const t of p.trains)index.push({key:t.key,operator:t.operator,asOf:t.asOf,borderArrival:t.borderArrival});
   else{
    attachDomestic(p.trains,domestic,universe);
    batch.trains.push(...p.trains.map(detail=>({key:detail.key,summary:summarize(detail),detail})));
    batch.cases.push(...p.incidents);
    batch.domestic.push(...p.domestic.map(detail=>({key:detail.operator+':'+(detail.train||detail.name),summary:{kind:'domestic',name:detail.name},detail})));
    batchCount+=p.trains.length+p.incidents.length+p.domestic.length;
    // An abnormal sheet may have hundreds of cases; split it before sending.
    while(batch.cases.length>80){const part={trains:[],cases:batch.cases.splice(0,80),domestic:[]};batchCount-=80;const waiting=new Promise(resolve=>resume=resolve);self.postMessage({type:'batch',batch:part});await waiting;}
    if(batchCount>=6)await send();
   }
   if(i%20===0||i===wb.SheetNames.length-1)self.postMessage({type:'progress',done:i+1,total:wb.SheetNames.length});
  }
  if(mode!=='preview')await send();
  self.postMessage({type:'done',counts,hash,index});
 }catch(e){self.postMessage({type:'error',message:e.message});}
};
