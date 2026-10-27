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
  config.railUnitCost=config.railUnitCost||railUnit(config);
  const lines=valid.filter(r=>r.kind==='linehaul'&&placeMatches(r.destination,plan.origin));
  const combos=[];

  const shared=valid.filter(p=>p.kind==='pickup'&&p.quote.sharedPickup&&(!p.quote.areas?.length||p.quote.areas.some(a=>placeMatches(a,input.origin))));
  for(const l of lines){const pickups=valid.filter(p=>p.kind==='pickup'&&!p.quote.sharedPickup&&placeMatches(p.origin,input.origin)&&placeMatches(p.destination,l.origin));if(placeMatches(l.origin,input.origin)){if(pickups.length)for(const p of pickups)combos.push({l,p});else if(shared.length)for(const p of shared)combos.push({l,p});else combos.push({l,p:null});}else for(const p of pickups)combos.push({l,p});for(const p of shared)if(!combos.some(c=>c.l?.id===l.id&&c.p?.id===p.id))combos.push({l,p});}
  const pickupsToStation=valid.filter(p=>p.kind==='pickup'&&placeMatches(p.origin,input.origin)&&placeMatches(p.destination,plan.origin));for(const p of pickupsToStation)combos.push({p,l:null,directPickup:true});
  if(!combos.length){if(shared.length)for(const p of shared)combos.push({p,l:null});else combos.push({p:null,l:null});}
  const scored=combos.map(c=>{try{let score=0,price=0;for(const q of [c.p,c.l])if(q){const r=domesticCost(snapshot(q),volume,weight,fx,input.date);score+=r.complete?1:0;price+=r.usd;}return {...c,score,price};}catch{return {...c,score:-1,price:Infinity};}}).sort((a,b)=>Number(!!b.p&&!!(b.l||b.directPickup)&&b.score===1+Number(!!b.l))-Number(!!a.p&&!!(a.l||a.directPickup)&&a.score===1+Number(!!a.l))||Number(!!b.p&&!b.p.quote.sharedPickup)-Number(!!a.p&&!a.p.quote.sharedPickup)||b.score-a.score||a.price-b.price);
  let chosen=scored[0];if(input.pickupQuoteId){const specific=scored.find(c=>c.p?.id===input.pickupQuoteId);if(specific)chosen=specific;}
  config.volume=volume;config.weight=weight;config.pieces=input.pieces;config.origin=input.origin;config.destination=input.destination;config.route=input.origin+' → '+input.destination;config.railPlanId=plan.id;config.pickupQuote=chosen.p?snapshot(chosen.p):missing('未匹配提货采购价');config.linehaulQuote=chosen.l?snapshot(chosen.l):chosen.directPickup?{...blankRate(),status:'confirmed',rule:'fixed',fixed:0,deliveryIncluded:true,source:'提货直达装箱仓，无独立干线'}:missing('未匹配国内干线采购价');
  if(input.pickupOverride){const o=input.pickupOverride;if(!Number.isFinite(o.amount)||o.amount<0||!['USD','CNY'].includes(o.currency)||!o.reason?.trim())throw Error('临时提货费须填写非负金额、币种和原因');config.pickupQuote={...blankRate(),status:'confirmed',rule:'fixed',fixed:o.amount,minimum:0,deliveryIncluded:true,currency:o.currency,source:'本票临时提货费：'+o.reason,notes:o.reason};}config.pickupChoices=scored.filter(c=>c.p).map(c=>({id:c.p.id,quote:snapshot(c.p),linehaul:c.l?snapshot(c.l):null,directPickup:!!c.directPickup,complete:c.score===Number(!!c.p)+Number(!!c.l)}));const calculation=calculate(config);result.push({id:plan.id,label:`${plan.origin} → ${plan.destination} · ${config.mode==='own'?'自营':'外配'}`,inputs:config,result:calculation});
 }
 return result.sort((a,b)=>Number(b.result.complete)-Number(a.result.complete)||b.id.localeCompare(a.id));
}
