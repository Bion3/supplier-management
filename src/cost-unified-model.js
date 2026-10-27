import {matchCosts,placeMatches} from './cost-matching.js';
import {calculate} from './cost-model.js';
export const currentLeaves=rows=>{const old=new Set(rows.map(r=>r.supersedes_id).filter(Boolean));return rows.filter(r=>!old.has(r.id));};
const box=s=>String(s||'').toUpperCase().replace(/40HC/g,'40HQ').replace(/20尺/g,'20GP').replace(/45尺/g,'45HQ');
const sourceMonthStart=r=>{const m=String(r.quote?.source?.quotationPeriod||'').match(/^(\d{4})年(\d{1,2})月$/);return m?`${m[1]}-${m[2].padStart(2,'0')}-01`:null;};
const dateOK=(r,d)=>{const start=r.quote.validFrom||sourceMonthStart(r);return !start||start<=d;};
const usable=(rows,i)=>currentLeaves(rows).filter(r=>r.status==='confirmed'||i.preview&&r.status==='draft');
export function procurementValidity(row,date){
 const from=row.quote?.validFrom||sourceMonthStart(row)||row.valid_from||'';
 const until=row.quote?.validUntil||row.valid_until||'';
 const status=from&&date<from?'尚未生效':until&&date>until?'已过期':!from||!until?'日期未完整':'有效期内';
 return {from,until,status,needsReview:status!=='有效期内'};
}
export function loadingMatches(quoted,requested){const tokens=String(requested||'').split(/[,，/]/).map(x=>x.trim()).filter(Boolean);return tokens.length>0&&placeMatches(quoted,tokens.at(-1));}
function normalizeFclInput(input,data){
 const i={...input,box:input.box||'40HQ',equipment:input.equipment||'SOC',quantity:input.quantity===null||input.quantity===''||input.quantity===undefined?1:input.quantity};
 if(i.station?.trim())return i;
 const rail=usable(data.fcl||[],i).filter(r=>placeMatches(r.destination,i.destination)&&r.quote.scope==='站到站'&&r.quote.equipment===i.equipment&&(box(r.quote.container)===box(i.box)||(box(i.box)==='40HQ'&&r.quote.container==='40尺'))&&(r.quote.unit==='柜'||box(r.quote.unit)===box(i.box)));
 const trucks=usable(data.trucks||[],i);
 const stationWithTruck=rail.find(r=>trucks.some(t=>loadingMatches(t.quote.loadingPlace,i.origin)&&placeMatches(t.destination,r.origin)&&(!i.pickupPlace?.trim()||placeMatches(t.origin,i.pickupPlace))&&box(t.quote.container)===box(i.box)));
 i.station=(stationWithTruck||rail[0])?.origin||'';
 return i;
}
export function candidates(i,data){
 const matchesBox=r=>box(r.quote.container)===box(i.box)||(box(i.box)==='40HQ'&&r.quote.container==='40尺');
 return {
  rail:usable(data.fcl||[],i).filter(r=>placeMatches(r.origin,i.station)&&placeMatches(r.destination,i.destination)&&r.quote.scope==='站到站'&&r.quote.equipment===i.equipment&&matchesBox(r)&&(r.quote.unit==='柜'||box(r.quote.unit)===box(i.box))),
  truck:i.truck?usable(data.trucks||[],i).filter(r=>(!i.pickupPlace?.trim()||placeMatches(r.origin,i.pickupPlace))&&loadingMatches(r.quote.loadingPlace,i.origin)&&placeMatches(r.destination,i.station)&&box(r.quote.container)===box(i.box)):[],
  rent:i.rent&&i.equipment==='SOC'?usable(data.rentals||[],i).filter(r=>placeMatches(r.origin,i.station)&&placeMatches(r.destination,i.destination)&&box(r.quote.container)===box(i.box)&&(!r.quote.service||r.quote.service==='整柜')):[]
 };
}
export function validateInput(i){
 if(!['lcl','fcl'].includes(i.transport))throw Error('请选择运输方式');
 if(!i.destination?.trim())throw Error('请填写境外目的站');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(i.date))throw Error('请选择报价适用日期');
 if(!Number.isFinite(i.fx)||i.fx<=0)throw Error('人民币兑美元汇率须大于0');
 if(!Number.isFinite(i.profit)||i.profit<0||!['markup','margin','fixed'].includes(i.profitMode)||i.profitMode==='margin'&&i.profit>=100)throw Error('请检查利润设置，毛利率须低于100%');
 if(i.transport==='fcl'){
  if(!i.station?.trim())throw Error('请填写国内起运站');
  if(!Number.isInteger(i.quantity)||i.quantity<=0)throw Error('柜量须为正整数');
  if(!['SOC','COC'].includes(i.equipment)||!i.box)throw Error('请确认箱型及SOC/COC');
  if(i.truck&&!i.origin?.trim())throw Error('包含拖车时请填写始发地 / 装箱地');
 }else{
  if((!i.origin?.trim()&&i.scope!=='station')||(i.scope==='station'&&!i.station?.trim()))throw Error('请填写始发地或国内起运站');
  if(!Number.isInteger(i.pieces)||i.pieces<=0||!Number.isFinite(i.weight)||i.weight<=0||!Number.isFinite(i.volume)||i.volume<=0)throw Error('请填写有效的件数、毛重和体积');
 }
 return i;
}
export function finish(lines,pending,i){
 const cost=lines.reduce((sum,l)=>sum+l.value,0);let price;
 if(i.profitMode==='margin')price=cost/(1-i.profit/100);else if(i.profitMode==='fixed')price=cost+i.profit;else price=cost*(1+i.profit/100);
 return {cost,price,profit:price-cost,lines,pending:[...new Set(pending)],complete:pending.length===0};
}
export function estimateFcl(input,data,choices={}){
 const i=validateInput(normalizeFclInput(input,data)),available=candidates(i,data),lines=[],pending=[],sources={},validity=[];
 const usd=(value,currency,label)=>{if(value===null||value===''||!Number.isFinite(value)||value<0){pending.push(label+'：金额待确认');return null;}if(currency==='USD')return value;if(currency==='CNY')return value/i.fx;if(currency==='EUR'&&Number.isFinite(i.eurFx)&&i.eurFx>0)return value*i.eurFx;pending.push(label+'：币种或EUR汇率待确认');return null;};
 function segment(key,label){
  const list=available[key],r=choices[key]?list.find(x=>x.id===choices[key]):list[0];if(!r){pending.push(label+'：未匹配适用报价');return;}
  sources[key]=structuredClone(r);const q=r.quote;if(!r.supplier_id)pending.push(label+'：供应商待确认');
  if(r.status!=='confirmed')pending.push(label+'：待确认参考报价');
  validity.push({name:label,quoteId:r.id,...procurementValidity(r,i.date)});
  if(q.price===0)pending.push(label+'：采购金额为零，需人工确认');
  if(key==='rail'&&box(q.container)!==box(i.box))pending.push(label+'：原价仅注明40尺，需确认适用40HQ');
  if(key==='truck'&&q.priceBasis!=='采购价')pending.push(label+'：采购价口径待确认');
  if(key==='rail'&&q.equipment==='COC'&&/平衡费.{0,80}(单询|另询|待询)/s.test(q.notes||'')&&!([...(q.fees||[]),...(i.extraFees||[])].some(f=>/平衡费/.test(f.name||'')&&Number.isFinite(f.amount)&&f.amount>=0)))pending.push(label+'：COC提还箱平衡费单询，未录入金额');
  const unitOK=key==='truck'?q.unit==='柜'||box(q.unit)===box(i.box):q.unit==='柜'||box(q.unit)===box(i.box);
  if(!unitOK){pending.push(label+'：计价单位未确认或不支持，未计金额');return;}
  const value=usd(q.price,q.currency,label);if(value!==null)lines.push({name:label,value:value*i.quantity,basis:`${q.currency} ${q.price} / ${q.unit} × ${i.quantity}柜`,quoteId:r.id,supplier_id:r.supplier_id});
  for(const f of q.fees||[]){const labelFee=label+' / '+f.name;if(f.unit!=='柜'&&f.unit!=='票'&&box(f.unit)!==box(i.box)){pending.push(labelFee+'：计费条件需人工核对');continue;}const fee=usd(f.amount,f.currency,labelFee);if(fee!==null)lines.push({name:labelFee,value:fee*(f.unit==='票'?1:i.quantity),basis:`${f.currency} ${f.amount} / ${f.unit}`,quoteId:r.id,supplier_id:r.supplier_id});}
  if(!i.termsReviewed&&(q.notes||q.source?.rawRemarks))pending.push(label+'：请核对原报价操作条款及另计费用');
 }
 if(i.truck)segment('truck','国内拖车');segment('rail','整箱铁路');if(i.equipment==='SOC'&&i.rent)segment('rent','租箱基础费（不含超期）');
 for(const f of i.extraFees||[]){if(!f.name?.trim())throw Error('请填写补充费用名称');const n=usd(f.amount,f.currency,f.name);if(n!==null)lines.push({name:f.name,value:n*(f.unit==='柜'?i.quantity:1),basis:'本次手工补充 '+f.currency+' '+f.amount+' / '+f.unit});}
 return {id:'fcl',label:`${i.station} → ${i.destination} · ${i.quantity}×${i.box} · ${i.equipment}`,inputs:{...structuredClone(i),route:[i.truck?i.origin:null,i.station,i.destination].filter(Boolean).join(' → '),sources},result:{...finish(lines,pending,i),validity},available};
}
export function estimateLcl(i,data){
 validateInput(i);
 const plans=(data.plans||[]).filter(p=>!i.station||placeMatches(p.origin,i.station));
 const options=matchCosts({...i,origin:i.scope==='station'?i.station:i.origin},data.domestic||[],plans);
 for(const m of options){const s=m.inputs;s.fx=i.fx;s.profitMode=i.profitMode;s.profit=i.profit;s.transport='lcl';s.scope=i.scope;s.date=i.date;s.station=i.station;s.eurFx=i.eurFx;
  if(i.scope==='station')for(const key of ['pickupQuote','linehaulQuote'])s[key]={status:'confirmed',rule:'fixed',fixed:0,minimum:0,deliveryIncluded:true,currency:'USD',source:'本次仅核算站到站，不含国内运输'};
  m.result=calculate(s);
  const dates=[];
  for(const [name,q] of [['国内提货',s.pickupQuote],['国内干线',s.linehaulQuote]]){
   if(!q?.quoteId)continue;
   const from=q.validFrom||'',until=q.validUntil||'';
   const status=from&&i.date<from?'尚未生效':until&&i.date>until?'已过期':!from||!until?'日期未完整':'有效期内';
   dates.push({name,from,until,status,needsReview:status!=='有效期内'});
  }
  const p=(data.plans||[]).find(row=>row.id===s.railPlanId);
  if(p){
   const from=p.valid_from||p.inputs?.validFrom||'',until=p.valid_until||p.inputs?.validUntil||'';
   const status=from&&i.date<from?'尚未生效':until&&i.date>until?'已过期':!from||!until?'日期未完整':'有效期内';
   dates.push({name:'拼箱铁路运费',from,until,status,needsReview:status!=='有效期内'});
  }
  m.result.validity=dates;
 }
 return options;
}

export function diagnoseFclMatches(input,data){
 const rail=currentLeaves(data.fcl||[]);
 const boxWanted=box(input.box),equipment=input.equipment||'SOC';
 const destination=rail.filter(r=>placeMatches(r.destination,input.destination));
 const station=input.station?destination.filter(r=>placeMatches(r.origin,input.station)):destination;
 const equipmentMatches=station.filter(r=>r.quote.equipment===equipment);
 const compatible=equipmentMatches.filter(r=>box(r.quote.container)===boxWanted||(boxWanted==='40HQ'&&r.quote.container==='40尺'));
 const applicable=compatible.filter(r=>r.status==='confirmed');
 const reasons=[];
 if(!rail.length)reasons.push('铁路采购价格库暂无记录');
 else if(!destination.length)reasons.push('未找到该境外目的站的铁路报价');
 else if(input.station&&!station.length)reasons.push('当前国内起运站与目的站没有匹配线路');
 else if(!equipmentMatches.length)reasons.push('没有匹配'+equipment+'用箱方式的铁路运价');
 else if(!compatible.length)reasons.push('箱型不匹配；请核对40尺、40HQ或20尺的采购报价');
 else if(!applicable.length){
  if(compatible.some(r=>r.status==='draft'))reasons.push('该线路存在待确认采购报价，可勾选“使用待确认参考价”暂估');
 }
 return {railTotal:rail.length,destinationCount:destination.length,routeCount:station.length,compatibleCount:compatible.length,confirmedApplicable:applicable.length,reasons};
}
