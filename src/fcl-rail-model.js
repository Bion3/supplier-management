export const latestFcl=rows=>{const old=new Set(rows.map(r=>r.supersedes_id).filter(Boolean));return rows.filter(r=>!old.has(r.id));};
export const blankFcl=()=>({container:'40尺',equipment:'待确认',currency:'USD',price:null,unit:'柜',service:'',via:'',scope:'站到站',validFrom:'',validUntil:'',notes:'',fees:[],profitPreset:{mode:'markup',value:0}});
export function validateFcl(row){
 const q=row.quote;if(!row.origin?.trim()||!row.destination?.trim())throw Error('请填写起运站和目的站');
 if(!['draft','confirmed','inactive'].includes(row.status))throw Error('状态无效');
 if(q.price!==null&&(!Number.isFinite(q.price)||q.price<0))throw Error('运价须为非负数或留空待确认');
 if(!['USD','CNY',''].includes(q.currency))throw Error('币种无效');
 if(!['SOC','COC','待确认'].includes(q.equipment))throw Error('SOC/COC无效');
 if(!['柜','组'].includes(q.unit))throw Error('计价单位无效');
 if(!q.scope?.trim())throw Error('请填写计价范围');
 if(q.validFrom&&q.validUntil&&q.validFrom>q.validUntil)throw Error('有效期顺序错误');
 for(const f of q.fees||[]){if(!f.name?.trim()||!['USD','CNY','EUR'].includes(f.currency)||f.amount!==null&&(!Number.isFinite(f.amount)||f.amount<0))throw Error('请检查单项费用名称、金额及币种');}
 const p=q.profitPreset;if(p&&(!['markup','margin','fixed'].includes(p.mode)||!Number.isFinite(p.value)||p.value<0||p.mode==='margin'&&p.value>=100))throw Error('利润预设无效，毛利率须低于100%');
 if(row.status==='confirmed'&&(!row.supplier_id||q.price===null||!q.currency||!q.container||q.container.includes('待确认')||q.equipment==='待确认'||q.scope.includes('待确认')))throw Error('启用前请确认供应商、单价、币种、箱型、SOC/COC和计价范围');
 return row;
}
export function fclVersion(row,changes={}){const copy={origin:row.origin,destination:row.destination,supplier_id:row.supplier_id,status:row.status,quote:structuredClone(row.quote),supersedes_id:row.id};Object.assign(copy,changes);return validateFcl(copy);}
