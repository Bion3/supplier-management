import {domesticCost,blankRate} from './domestic-model.js';
import {calculate} from './cost-model.js';
import {railUnit} from './rail-unit.js';
const norm=s=>String(s||'').trim().toLowerCase().replace(/[\s’']/g,'').replace(/市$/,'').replace(/^hamburg$/,'汉堡').replace(/^xian$/,'西安');
export const placeMatches=(a,b)=>!!norm(a)&&!!norm(b)&&String(a).split(/[,，/]/).some(x=>String(b).split(/[,，/]/).some(y=>norm(x)===norm(y)));
export function currentRates(rows,date=new Date().toISOString().slice(0,10)){
 const superseded=new Set(rows.map(r=>r.supersedes_id).filter(Boolean));return rows.filter(r=>!superseded.has(r.id)&&r.status==='confirmed');
}
const snapshot=r=>({...structuredClone(r.quote),status:r.status,origin:r.origin,destination:r.destination,supplier_id:r.supplier_id,quoteId:r.id});
const missing=(name)=>({...blankRate(),status:'draft',rule:'unknown',source:name,minimum:null,delivery:null});
export function matchCosts(input,rates,plans){
 if(!input.origin.trim()||!input.destination.trim())return [];
 if(!Number.isInteger(input.pieces)||input.pieces<=0)throw Error('件数必须是正整数');
 const valid=currentRates(rates,input.date),replaced=new Set(plans.map(p=>p.supersedes_id).filter(Boolean));const result=[];
 for(const plan of plans.filter(p=>!replaced.has(p.id)&&p.status==='confirmed'&&(!p.inputs.importSource||p.inputs.railUnitCost?.complete===true)&&placeMatches(p.destination,input.destination))){
  const config=structuredClone(plan.inputs),volume=input.volume,weight=input.weight,fx=config.fx;
  // A confirmed rail unit tariff is the source of truth. Do not silently
  // manufacture a per-RT price by dividing an own-train container cost pool.
  config.railUnitCost=config.railUnitCost||(
    config.mode==='own'
      ? {unit:null,currency:'USD',ratio:500,minimum:0,fees:0,components:[],
         pending:['铁路计费方单价未录入，不能按整柜成本自动推导'],complete:false}
      : railUnit(config)
  );
  // Freight linehaul is valid only for the requested origin and this rail plan's hub.
  // Previously every linehaul ending at the hub was paired with the generic pickup
  // template, even when its starting city was unrelated to the shipment.
  const local=placeMatches(input.origin,plan.origin);
  const lines=local?[]:valid.filter(r=>r.kind==='linehaul'&&
    placeMatches(r.origin,input.origin)&&placeMatches(r.destination,plan.origin));
  const combos=[];
  const shared=valid.filter(p=>p.kind==='pickup'&&p.quote.sharedPickup&&
    (!p.quote.areas?.length||p.quote.areas.some(a=>placeMatches(a,input.origin))));
  const stationPickups=valid.filter(p=>p.kind==='pickup'&&!p.quote.sharedPickup&&
    placeMatches(p.origin,input.origin)&&placeMatches(p.destination,plan.origin));
  if(local){
    // Within the departure hub, there is no intercity linehaul. Charge only the
    // actual pickup tier; a zero-length linehaul is never a quoted supplier cost.
    for(const p of [...stationPickups,...shared])combos.push({p,l:null,directPickup:true});
    if(!combos.length)combos.push({p:null,l:null,directPickup:true});
  }else if(lines.length){
    for(const l of lines){
      const pickups=valid.filter(p=>p.kind==='pickup'&&!p.quote.sharedPickup&&
        placeMatches(p.origin,input.origin)&&placeMatches(p.destination,l.origin));
      for(const p of [...pickups,...shared])combos.push({l,p});
      if(!pickups.length&&!shared.length)combos.push({l,p:null});
    }
  }else{
    // An unknown intercity trunk must stay missing, not be invented as 0 or
    // substituted with freight from another origin city.
    combos.push({p:null,l:null,missingLinehaul:true});
  }
  const scored=combos.map(c=>{try{let score=0,price=0;for(const q of [c.p,c.l])if(q){const r=domesticCost(snapshot(q),volume,weight,fx,input.date);score+=r.complete?1:0;price+=r.usd;}return {...c,score,price};}catch{return {...c,score:-1,price:Infinity};}}).sort((a,b)=>Number(!!b.p&&!!(b.l||b.directPickup)&&b.score===1+Number(!!b.l))-Number(!!a.p&&!!(a.l||a.directPickup)&&a.score===1+Number(!!a.l))||Number(!!b.p&&!b.p.quote.sharedPickup)-Number(!!a.p&&!a.p.quote.sharedPickup)||b.score-a.score||a.price-b.price);
  let chosen=scored[0];if(input.pickupQuoteId){const specific=scored.find(c=>c.p?.id===input.pickupQuoteId);if(specific)chosen=specific;}
  config.volume=volume;config.weight=weight;config.pieces=input.pieces;config.origin=input.origin;config.destination=input.destination;config.route=input.origin+' → '+input.destination;config.railPlanId=plan.id;config.pickupQuote=chosen.p?snapshot(chosen.p):missing('未匹配提货采购价');config.linehaulQuote=chosen.l?snapshot(chosen.l):chosen.directPickup?{...blankRate(),status:'confirmed',rule:'fixed',fixed:0,minimum:0,deliveryIncluded:true,currency:'USD',source:'本地提货直达集货仓，无国内干线',internalNoLinehaul:true}:missing('未匹配对应提货城市的国内干线采购价');
  if(input.pickupOverride){const o=input.pickupOverride;if(!Number.isFinite(o.amount)||o.amount<0||!['USD','CNY'].includes(o.currency)||!o.reason?.trim())throw Error('临时提货费须填写非负金额、币种和原因');config.pickupQuote={...blankRate(),status:'confirmed',rule:'fixed',fixed:o.amount,minimum:0,deliveryIncluded:true,currency:o.currency,source:'本票临时提货费：'+o.reason,notes:o.reason};}config.pickupChoices=scored.filter(c=>c.p).map(c=>({id:c.p.id,quote:snapshot(c.p),linehaul:c.l?snapshot(c.l):null,directPickup:!!c.directPickup,complete:c.score===Number(!!c.p)+Number(!!c.l)}));const calculation=calculate(config);result.push({id:plan.id,label:`${plan.origin} → ${plan.destination} · ${config.mode==='own'?'自营':'外配'}`,inputs:config,result:calculation});
 }
 return result.sort((a,b)=>Number(b.result.complete)-Number(a.result.complete)||b.id.localeCompare(a.id));
}
