import {validateRate} from './domestic-model.js';
import {railUnit} from './rail-unit.js';
import {fclVersion} from './fcl-rail-model.js';
export const latestCosts=rows=>{const old=new Set(rows.map(r=>r.supersedes_id).filter(Boolean));return rows.filter(r=>!old.has(r.id));};
export function enableCost(row,kind){
 if(row.status==='confirmed')throw Error('已经启用');
 if(!row.origin?.trim()||!row.destination?.trim())throw Error('起运地或目的地缺失');
 if(kind==='fcl')return fclVersion(row,{status:'confirmed'});
 if(kind==='domestic'){
  const quote=structuredClone(row.quote);quote.status='confirmed';quote.kind=row.kind;quote.origin=row.origin;quote.destination=row.destination;quote.supplier_id=row.supplier_id||quote.supplier_id||null;validateRate(quote);
  return {kind:row.kind,origin:row.origin,destination:row.destination,supplier_id:quote.supplier_id,status:'confirmed',quote,supersedes_id:row.id};
 }
 if(kind!=='rail')throw Error('费用类型无效');
 const inputs=structuredClone(row.inputs),q=inputs.railUnitCost||railUnit(inputs);
 if(!Number.isFinite(q.unit)||q.unit<0)throw Error('铁路单价缺失');
 if(!Number.isFinite(q.ratio)||q.ratio<=0)throw Error('重泡比缺失');
 if(inputs.mode==='external'){const a=inputs.external[inputs.selected];if(!a.supplierId&&(!a.supplierName||/^拼箱商\d+$/.test(a.supplierName)))throw Error('供应商未关联');}
 if(row.valid_from&&row.valid_until&&row.valid_from>row.valid_until)throw Error('有效期顺序错误');
 inputs.railUnitCost=q;
 return {origin:row.origin,destination:row.destination,status:'confirmed',inputs,valid_from:row.valid_from,valid_until:row.valid_until,supersedes_id:row.id};
}
export function prepareCostEnable(rows,kind){const ready=[],skipped=[];for(const row of rows){try{ready.push(enableCost(row,kind));}catch(error){skipped.push({id:row.id,origin:row.origin,destination:row.destination,reason:error.message});}}return {ready,skipped};}
