export const latestRental=rows=>{const old=new Set(rows.map(r=>r.supersedes_id).filter(Boolean));return rows.filter(r=>!old.has(r.id));};
export const blankRental=()=>({container:'',currency:'',price:null,unit:'柜',service:'',validFrom:'',validUntil:'',freeDays:null,overdueDaily:null,lossAfterDays:null,lossAmount:null,lossCurrency:'',notes:'',fees:[],profitPreset:{mode:'markup',value:0}});
export function validateRental(row){
 const q=row.quote;
 if(!row.origin?.trim()||!row.destination?.trim())throw Error('请填写提箱地和还箱地 / 城市');
 if(!['draft','confirmed','inactive'].includes(row.status))throw Error('状态无效');
 for(const k of ['price','freeDays','overdueDaily','lossAfterDays','lossAmount'])if(q[k]!==null&&(!Number.isFinite(q[k])||q[k]<0))throw Error('价格及租期须为非负数或留空待确认');
 for(const k of ['freeDays','lossAfterDays'])if(q[k]!==null&&!Number.isInteger(q[k]))throw Error('租期天数须为整数');
 if(!['USD','CNY','EUR',''].includes(q.currency)||!['USD','CNY','EUR',''].includes(q.lossCurrency))throw Error('币种无效');
 if(q.unit!=='柜')throw Error('租箱价按柜维护');
 if(q.validFrom&&q.validUntil&&q.validFrom>q.validUntil)throw Error('有效期顺序错误');
 if(q.lossAmount!==null&&!q.lossCurrency)throw Error('请确认赔偿币种');
 for(const f of q.fees||[])if(!f.name?.trim()||!['USD','CNY','EUR'].includes(f.currency)||f.amount!==null&&(!Number.isFinite(f.amount)||f.amount<0))throw Error('请检查附加费名称、金额及币种');
 const p=q.profitPreset;if(p&&(!['markup','margin','fixed'].includes(p.mode)||!Number.isFinite(p.value)||p.value<0||p.mode==='margin'&&p.value>=100))throw Error('利润预设无效，毛利率须低于100%');
 if(row.status==='confirmed'&&(!row.supplier_id||q.price===null||!q.currency||!q.container?.trim()||q.container.includes('待确认')))throw Error('启用前请确认供应商、单价、币种和箱型');
 return row;
}
export function rentalVersion(row,changes={}){return validateRental(Object.assign({origin:row.origin,destination:row.destination,supplier_id:row.supplier_id,status:row.status,quote:structuredClone(row.quote),supersedes_id:row.id},changes));}
