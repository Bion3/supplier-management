export const blankRate=()=>({kind:'linehaul',origin:'',destination:'',supplier_id:null,currency:'CNY',status:'draft',rule:'billable',cbm:null,ton:null,fixed:null,ratio:300,minimum:0,delivery:null,deliveryIncluded:false,validFrom:'',validUntil:'',source:'',notes:'',tiers:[]});
const n=(x,label)=>{if(x===null||x===undefined||x==='')return null;if(!Number.isFinite(x)||x<0)throw Error(label+'须为非负数');return x;};
export function domesticCost(q,volume,weight,fx,date=new Date().toISOString().slice(0,10)){
 const pending=[],basis=[];let freight=null;
 if(volume<=0||weight<=0||fx<=0)throw Error('货物及汇率必须大于0');
 if(q.status!=='confirmed')pending.push('采购价未确认');
 if(q.validFrom&&q.validFrom>date)pending.push('采购价尚未生效');
 if(q.validUntil&&q.validUntil<date)pending.push('采购价已过期');
 const cbm=n(q.cbm,'方价'),ton=n(q.ton,'吨价');
 switch(q.rule){
 case 'cbm':freight=cbm===null?null:volume*cbm;basis.push(`${volume}CBM × ${cbm??'待定'}`);break;
 case 'ton':freight=ton===null?null:weight/1000*ton;basis.push(`${weight/1000}吨 × ${ton??'待定'}`);break;
 case 'max':freight=cbm===null||ton===null?null:Math.max(volume*cbm,weight/1000*ton);basis.push('吨价金额与方价金额取大');break;
 case 'billable':if(!Number.isFinite(q.ratio)||q.ratio<=0)throw Error('重抛比必须大于0');freight=cbm===null?null:Math.max(volume,weight/q.ratio)*cbm;basis.push(`${Math.max(volume,weight/q.ratio).toFixed(3)}计费方 × ${cbm??'待定'}`);break;
 case 'fixed':freight=n(q.fixed,'固定金额');basis.push('固定金额/票');break;
 case 'tier':{if(!Number.isFinite(q.ratio)||q.ratio<=0)throw Error('重抛比必须大于0');const ordered=[...q.tiers].sort((a,b)=>a.maxVolume-b.maxVolume||a.maxWeight-b.maxWeight);if(q.tierMode==='ceil'&&ordered.some((t,i)=>i>0&&t.maxWeight<ordered[i-1].maxWeight)){pending.push('阶梯上限交叉，需核对');break;}const matches=q.tierMode==='ceil'?ordered.filter(t=>volume<=t.maxVolume&&weight<=t.maxWeight).slice(0,1):q.tiers.filter(t=>volume>=t.minVolume&&volume<=t.maxVolume&&weight>=t.minWeight&&weight<=t.maxWeight);if(matches.length===1){const t=matches[0],rate=n(t.amount,'阶梯价');freight=rate===null?null:rate*(t.unit==='cbm'?volume:t.unit==='billable'?Math.max(volume,weight/q.ratio):1);basis.push(q.tierMode==='ceil'?`按体积/重量上限取档：≤${t.maxVolume}CBM / ≤${t.maxWeight}kg`:'匹配双条件阶梯，整票套档');}else pending.push(matches.length?'阶梯重叠':'货物不在阶梯范围');break;}
 default:pending.push('计价规则待确认');
 }
 if(freight===null)pending.push('运费缺价');
 const minimum=n(q.minimum,'最低收费');if(minimum===null)pending.push('最低收费待确认');
 const delivery=q.deliveryIncluded?0:n(q.delivery,'送货费');if(delivery===null)pending.push('送货费待确认');
 const original=(freight===null?0:Math.max(freight,minimum??0))+(delivery??0);const usd=original/(q.currency==='CNY'?fx:1);
 return {usd,original,currency:q.currency,basis:basis.join('；')+(q.deliveryIncluded?'；送货已含':`；送货费 ${delivery??'待定'}`),pending,complete:pending.length===0};
}
export function validateRate(q){
 if(!q.origin.trim()||!q.destination.trim())throw Error('请填写始发区域及目的仓');
 if(!['CNY','USD'].includes(q.currency))throw Error('币种仅支持CNY/USD');
 if(!['pickup','linehaul'].includes(q.kind))throw Error('无效运输段');
 if(q.validFrom&&q.validUntil&&q.validFrom>q.validUntil)throw Error('有效期起止顺序错误');
 if(q.rule==='tier'){if(!Array.isArray(q.tiers)||!q.tiers.length)throw Error('请添加阶梯');for(const t of q.tiers){for(const k of ['minVolume','maxVolume','minWeight','maxWeight','amount'])if(n(t[k],k)===null)throw Error('阶梯字段缺失');if(t.minVolume>t.maxVolume||t.minWeight>t.maxWeight||!['fixed','cbm','billable'].includes(t.unit))throw Error('阶梯范围或单位错误');}}
 const r=domesticCost(q,1,300,7);if(q.status==='confirmed'){if(!q.supplier_id&&!q.sharedPickup)throw Error('确认采购价前请关联供应商');const blocked=r.pending.filter(x=>!['货物不在阶梯范围','运费缺价','采购价尚未生效','采购价已过期'].includes(x));if(blocked.length)throw Error(blocked.join('、'));if(q.rule!=='tier'&&r.pending.includes('运费缺价'))throw Error('运费缺价');}return q;
}
