import {domesticCost} from './domestic-model.js';
export const defaults=()=>({route:'西安—汉堡',box:'40HQ',fx:7,capacity:60,domesticRatio:300,railRatio:500,volume:5,weight:1000,domesticRate:null,domesticTonRate:null,pickup:null,profitMode:'markup',profit:10,mode:'own',selected:0,own:[{name:'西安装箱',amount:3000,currency:'CNY'},{name:'铁路运费',amount:8400,currency:'USD'},{name:'租箱',amount:1800,currency:'USD'},{name:'目的港提柜拆箱',amount:1200,currency:'USD'},{name:'THC',amount:null,currency:'USD'}].map(x=>({...x,selected:0,alternatives:[{supplierId:'',supplierName:'待关联',version:'用户参考价',...x},{supplierId:'',supplierName:'备选2',version:'',amount:null,currency:x.currency},{supplierId:'',supplierName:'备选3',version:'',amount:null,currency:x.currency}]})),external:Array.from({length:3},(_,i)=>({supplierId:'',supplierName:`拼箱商${i+1}`,version:'',rate:null,ratio:500,minimum:0,fees:null,included:'',validUntil:''}))});
const positive=(x,label)=>{if(!Number.isFinite(x)||x<=0)throw Error(label+'必须大于0');return x;};
const amount=(x,label)=>{if(x===null||x===undefined||x==='')return null;if(!Number.isFinite(x)||x<0)throw Error(label+'不能为负数');return x;};
export function calculate(s){
 positive(s.fx,'汇率');positive(s.capacity,'预计计费方');positive(s.domesticRatio,'干线重抛比');positive(s.railRatio,'铁路重抛比');positive(s.volume,'体积');positive(s.weight,'重量');
 const pending=[],warnings=[],lines=[],domesticQty=Math.max(s.volume,s.weight/s.domesticRatio);let railQty,unit;
 const add=(name,value,basis)=>{if(value===null)pending.push(name);else lines.push({name,value,basis});};
 const applyDomestic=(name,q)=>{const r=domesticCost(q,s.volume,s.weight,s.fx,s.date);const noRate=r.pending.some(p=>/运费缺价|计价规则待确认|阶梯重叠|货物不在阶梯范围|方价缺失|吨价缺失/.test(p));add(name,noRate?null:r.usd,r.basis+'；采购版本 '+(q.quoteId||q.source||''));pending.push(...r.pending.map(p=>name+'：'+p));warnings.push(...(r.warnings||[]).map(p=>name+'：'+p));};
 const pickup=amount(s.pickup,'提货费');
 // Original bands are preserved. Cross-band and fractional gaps require an explicit price.
 const matches=(s.volume>=1&&s.volume<=5&&s.weight<=2500)||(s.volume>=6&&s.volume<=10&&s.weight>=2500&&s.weight<=5000);
 if(s.pickupQuote)applyDomestic('国内提货',s.pickupQuote);else add('提货费',pickup??(matches?80:null),pickup!==null?'手动确认金额':'原始双条件阶梯');
 if(s.linehaulQuote?.internalNoLinehaul){warnings.push('起运地与铁路集货站同城，无独立国内干线，未重复收取干线费');}
 else if(s.linehaulQuote)applyDomestic('国内干线',{...s.linehaulQuote,kind:'linehaul'});
 else applyDomestic('国内干线',{kind:'linehaul',rule:'billable',status:'confirmed',currency:'CNY',ratio:s.domesticRatio,cbm:s.domesticRate??null,ton:s.domesticTonRate??null,minimum:0,deliveryIncluded:true});
 if(s.railUnitCost){
  const q=s.railUnitCost;railQty=Math.max(s.volume,s.weight/500);unit=amount(q.unit,'铁路采购单价');add('铁路运费',unit===null?null:Math.max(railQty*unit,q.minimum??0),`铁路重抛比1:500；${railQty}计费方 × 已录铁路单价 USD ${unit??'待定'}/计费方`);if(q.ratio!==undefined&&q.ratio!==null&&Number(q.ratio)!==500)warnings.push('原铁路重抛比不是1:500，已按统一铁路规则计算');if(s.mode==='external')add('外配杂费',q.fees??null,'铁路采购价另计杂费（每票一次）');pending.push(...(q.pending||[]));
 }else if(s.mode==='own'){
  railQty=Math.max(s.volume,s.weight/500);let pool=0;
  for(const item of s.own){const a=item.alternatives[item.selected];const n=amount(a.amount,item.name);if(n===null)pending.push(item.name);else pool+=n/(a.currency==='CNY'?s.fx:1);}
  unit=pool/s.capacity;add('自营铁路折算',railQty*unit,`已知整柜USD ${pool} ÷ ${s.capacity} × ${railQty}`);
 }else{const a=s.external[s.selected];railQty=Math.max(s.volume,s.weight/500);const rate=amount(a.rate,'外配单价'),min=amount(a.minimum,'最低收费');unit=rate;add('外配铁路',rate===null?null:Math.max(railQty*rate,min??0),`${railQty}计费方；最低收费USD ${min??0}`);add('外配杂费',amount(a.fees,'外配杂费'),'供应商杂费合计／票');if(a.validUntil&&a.validUntil<(s.date||new Date().toISOString().slice(0,10)))warnings.push('外配报价已过期');}
 const cost=lines.reduce((n,l)=>n+l.value,0),p=amount(s.profit,'利润');if(p===null)throw Error('请填写利润');let price;
 if(s.profitMode==='margin'){if(p>=100)throw Error('毛利率必须小于100%');price=cost/(1-p/100);}else price=s.profitMode==='fixed'?cost+p:cost*(1+p/100);
 return {domesticQty,railQty,unit,cost,price,profit:price-cost,lines,pending,warnings,complete:pending.length===0};
}
