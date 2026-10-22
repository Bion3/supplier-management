export const latestTrucking=rows=>{const old=new Set(rows.map(r=>r.supersedes_id).filter(Boolean));return rows.filter(r=>!old.has(r.id));};
export const blankTrucking=()=>({loadingPlace:'',container:'',vehicle:'',direction:'出口',currency:'CNY',price:null,unit:'',priceBasis:'采购价',validFrom:'',validUntil:'',notes:'',fees:[],profitPreset:{mode:'markup',value:0}});
export function validityOf(q,today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())){if(!q.validFrom||!q.validUntil)return 'unknown';return q.validFrom>today?'future':q.validUntil<today?'expired':'valid';}
export function validateTrucking(row){
 const q=row.quote;
 if(!row.origin?.trim()||!q.loadingPlace?.trim()||!row.destination?.trim())throw Error('请填写提箱地、装箱地和目的地');
 if(!['draft','confirmed','inactive'].includes(row.status))throw Error('状态无效');
 if(q.price!==null&&(!Number.isFinite(q.price)||q.price<0))throw Error('价格须为非负数或留空待确认');
 if(!['USD','CNY','EUR',''].includes(q.currency))throw Error('币种无效');
 if(!['','柜','车','票'].includes(q.unit))throw Error('计价单位无效');
 if(!['','采购价','参考价','销售价'].includes(q.priceBasis))throw Error('价格口径无效');
 if(!['','出口','进口','内贸'].includes(q.direction))throw Error('进出口类型无效');
 if(q.validFrom&&q.validUntil&&q.validFrom>q.validUntil)throw Error('有效期顺序错误');
 for(const f of q.fees||[])if(!f.name?.trim()||!['USD','CNY','EUR'].includes(f.currency)||f.amount!==null&&(!Number.isFinite(f.amount)||f.amount<0))throw Error('请检查附加费名称、金额及币种');
 const p=q.profitPreset;if(p&&(!['markup','margin','fixed'].includes(p.mode)||!Number.isFinite(p.value)||p.value<0||p.mode==='margin'&&p.value>=100))throw Error('利润预设无效，毛利率须低于100%');
 if(row.status==='confirmed'&&(!row.supplier_id||q.price===null||!q.currency||!q.container?.trim()||q.container.includes('待确认')||!q.unit||q.priceBasis!=='采购价'))throw Error('启用前请确认供应商、单价、币种、箱型、计价单位及采购价口径');
 return row;
}
export function truckingVersion(row,changes={}){return validateTrucking(Object.assign({origin:row.origin,destination:row.destination,supplier_id:row.supplier_id,status:row.status,quote:structuredClone(row.quote),supersedes_id:row.id},changes));}
