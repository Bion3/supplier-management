export const priceLibraryLinks={
 '国内提货':'/pickup-rates.html','提货':'/pickup-rates.html',
 '国内干线':'/rates.html','干线':'/rates.html',
 '拼箱铁路':'/rail-rates.html','铁路拼箱':'/rail-rates.html',
 '国内拖车':'/trucking.html','拖车':'/trucking.html',
 '整箱铁路':'/fcl-rail.html','铁路整箱':'/fcl-rail.html',
 '租箱':'/container-rental.html'
};
export function segmentLink(name,transport='lcl'){
 const s=String(name||'');
 for(const [word,link] of Object.entries(priceLibraryLinks))if(s.includes(word))return link;
 if(s.includes('铁路'))return transport==='fcl'?'/fcl-rail.html':'/rail-rates.html';
 return '/pricing.html';
}
export function quoteAuditRows(selected){
 const input=selected?.inputs||{},result=selected?.result||{},lines=result.lines||[];
 const fcl=input.transport==='fcl';
 const segments=fcl?[
  ...(input.truck?[['国内拖车','truck']]:[]),['整箱铁路','rail'],
  ...(input.rent&&input.equipment==='SOC'?[['租箱基础费（不含超期）','rent']]:[])
 ]:[
  ...(input.scope==='station'?[]:[['国内提货','pickup'],['国内干线','linehaul']]),
  ['拼箱铁路运费','rail']
 ];
 const pending=result.pending||[],out=[];
 for(const [label,key] of segments){
  const matched=lines.filter(l=>String(l.name||'').includes(label)||(!fcl&&key==='rail'&&/铁路/.test(l.name||''))||(!fcl&&key==='pickup'&&/提货费|国内提货/.test(l.name||'')));
  const issues=pending.filter(x=>String(x).includes(label)||key==='rail'&&/拼箱铁路|铁路运费/.test(String(x))||key==='pickup'&&/提货费|国内提货/.test(String(x)));
  const source=fcl?input.sources?.[key]:key==='pickup'?input.pickupQuote:key==='linehaul'?input.linehaulQuote:null;
  const amount=matched.reduce((n,l)=>n+Number(l.value||0),0);
  let status=!matched.length?'missing':issues.length?'review':'ok';
  if(source?.status==='draft'&&matched.length)status='review';
  out.push({label,key,amount:matched.length?amount:null,source:source?.supplier_id||source?.supplierId||null,issues,status,link:segmentLink(label,input.transport),basis:matched.map(l=>l.basis).filter(Boolean).join('；'),lineCount:matched.length});
 }
 for(const line of lines){
  if(out.some(s=>String(line.name||'').includes(s.label)))continue;
  if(!fcl&&/铁路/.test(line.name||''))continue;
  out.push({label:line.name||'其他费用',key:'other',amount:Number(line.value||0),source:line.supplier_id||null,issues:[],status:'ok',link:'/pricing.html',basis:line.basis||'',lineCount:1});
 }
 const unmatched=pending.filter(x=>!out.some(r=>r.issues.includes(x)));
 return {segments:out,unmatched,missing:out.filter(s=>s.status==='missing').length,review:out.filter(s=>s.status==='review').length,complete:result.complete===true};
}
