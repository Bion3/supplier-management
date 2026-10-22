import {domesticCost} from './domestic-model.js';
export const defaults=()=>({route:'西安—汉堡',box:'40HQ',fx:7,capacity:60,domesticRatio:300,railRatio:500,volume:5,weight:1000,domesticRate:null,pickup:null,profitMode:'markup',profit:10,mode:'own',selected:0,own:[{name:'西安装箱',amount:3000,currency:'CNY'},{name:'铁路运费',amount:8400,currency:'USD'},{name:'租箱',amount:1800,currency:'USD'},{name:'目的港提柜拆箱',amount:1200,currency:'USD'},{name:'THC',amount:null,currency:'USD'}].map(x=>({...x,selected:0,alternatives:[{supplierId:'',supplierName:'待关联',version:'用户参考价',...x},{supplierId:'',supplierName:'备选2',version:'',amount:null,currency:x.currency},{supplierId:'',supplierName:'备选3',version:'',amount:null,currency:x.currency}]})),external:Array.from({length:3},(_,i)=>({supplierId:'',supplierName:`拼箱商${i+1}`,version:'',rate:null,ratio:500,minimum:0,fees:null,included:'',validUntil:''}))});
const positive=(x,label)=>{if(!Number.isFinite(x)||x<=0)throw Error(label+'必须大于0');return x;};
const amount=(x,label)=>{if(x===null||x==='')return null;if(!Number.isFinite(x)||x<0)throw Error(label+'不能为负数');return x;};
export function calculate(s){
 positive(s.fx,'汇率');positive(s.capacity,'预计计费方');positive(s.domesticRatio,'干线重抛比');positive(s.railRatio,'铁路重抛比');positive(s.volume,'体积');positive(s.weight,'重量');
 const pending=[],lines=[],domesticQty=Math.max(s.volume,s.weight/s.domesticRatio);let railQty,unit;
 const add=(name,value,basis)=>{if(value===null)pending.push(name);else lines.push({name,value,basis});};
 const applyDomestic=(name,q)=>{const r=domesticCost(q,s.volume,s.weight,s.fx,s.date);add(name,r.usd,r.basis+'；采购版本 '+(q.quoteId||q.source||''));pending.push(...r.pending.map(p=>name+'：'+p));};
 const pickup=amount(s.pickup,'提货费');
 // Original bands are preserved. Cross-band and fractional gaps require an explicit price.
 const matches=(s.volume>=1&&s.volume<=5&&s.weight<=2500)||(s.volume>=6&&s.volume<=10&&s.weight>=2500&&s.weight<=5000);
 if(s.pickupQuote)applyDomestic('国内提货',s.pickupQuote);else add('提货费',pickup??(matches?80:null),pickup!==null?'手动确认金额':'原始双条件阶梯');
 const domestic=amount(s.domesticRate,'国内干线单价');if(s.linehaulQuote)applyDomestic('国内干线',s.linehaulQuote);else {add('国内干线',domestic===null?null:domesticQty*domestic,`${domesticQty}计费方 × CNY单价 ÷ 汇率`);if(domestic!==null)lines.at(-1).value/=s.fx;}
 if(s.railUnitCost){
  const q=s.railUnitCost;positive(q.ratio,'铁路重抛比');railQty=Math.max(s.volume,s.weight/q.ratio);unit=amount(q.unit,'铁路采购单价');add('铁路运费',unit===null?null:Math.max(railQty*unit,q.minimum??0),`${railQty}计费方 × 已保存采购单价 USD ${unit??'待定'}`);if(s.mode==='external')add('外配杂费',q.fees??null,'铁路采购价另计杂费');pending.push(...q.pending);
 }else if(s.mode==='own'){
  railQty=Math.max(s.volume,s.weight/s.railRatio);let pool=0;
  for(const item of s.own){const a=item.alternatives[item.selected];const n=amount(a.amount,item.name);if(n===null)pending.push(item.name);else pool+=n/(a.currency==='CNY'?s.fx:1);}
  unit=pool/s.capacity;add('自营铁路折算',railQty*unit,`已知整柜USD ${pool} ÷ ${s.capacity} × ${railQty}`);
 }else{const a=s.external[s.selected];positive(a.ratio,'外配重抛比');railQty=Math.max(s.volume,s.weight/a.ratio);const rate=amount(a.rate,'外配单价'),min=amount(a.minimum,'最低收费');unit=rate;add('外配铁路',rate===null?null:Math.max(railQty*rate,min??0),`${railQty}计费方；最低收费USD ${min??0}`);add('外配杂费',amount(a.fees,'外配杂费'),'供应商杂费合计／票');if(a.validUntil&&a.validUntil<(s.date||new Date().toISOString().slice(0,10)))pending.push('外配报价已过期');}
 const cost=lines.reduce((n,l)=>n+l.value,0),p=amount(s.profit,'利润');if(p===null)throw Error('请填写利润');let price;
 if(s.profitMode==='margin'){if(p>=100)throw Error('毛利率必须小于100%');price=cost/(1-p/100);}else price=s.profitMode==='fixed'?cost+p:cost*(1+p/100);
 return {domesticQty,railQty,unit,cost,price,profit:price-cost,lines,pending,complete:pending.length===0};
}
