export function railUnit(s){
 const pending=[],components=[];
 const num=(v,label)=>{if(v===null||v===undefined||v===''){pending.push(label);return null;}if(!Number.isFinite(v)||v<0)throw Error(label+'不能为负数');return v;};
 if(s.mode==='own'){
  if(!Number.isFinite(s.fx)||s.fx<=0||!Number.isFinite(s.capacity)||s.capacity<=0||!Number.isFinite(s.railRatio)||s.railRatio<=0)throw Error('汇率、预计计费方和铁路重抛比必须大于0');
  let total=0;for(const item of s.own){const a=item.alternatives[item.selected],amount=num(a.amount,item.name);if(amount!==null){const usd=amount/(a.currency==='CNY'?s.fx:1);total+=usd;components.push({name:item.name,amount,currency:a.currency,usd,supplierId:a.supplierId,version:a.version});}}
  return {unit:total/s.capacity,currency:'USD',billingUnit:'计费方',ratio:s.railRatio,capacity:s.capacity,containerTotal:total,minimum:0,fees:0,components,pending,complete:pending.length===0};
 }
 const a=s.external[s.selected];if(!Number.isFinite(a.ratio)||a.ratio<=0)throw Error('铁路重抛比必须大于0');const unit=num(a.rate,'铁路单价'),minimum=num(a.minimum,'最低运费'),fees=num(a.fees,'外配另计杂费');if(a.validUntil&&a.validUntil<new Date().toISOString().slice(0,10))pending.push('外配报价已过期');
 return {unit,currency:'USD',billingUnit:'计费方',ratio:a.ratio,minimum,fees,components:[],pending,complete:pending.length===0};
}
