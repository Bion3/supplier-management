import {enableCost} from './cost-enable-model.js';
import {railUnit} from './rail-unit.js';
export const missing=v=>v===null||v===undefined||v==='';
export const gapFields={
 common:[['supplier_id','供应商','supplier'],['currency','币种','currency']],
 fcl:[['price','单价','number'],['container','箱型','container'],['equipment','用箱方式','equipment'],['scope','计价范围','text'],['unit','计价单位','text']],
 trucking:[['price','单价','number'],['container','箱型','container'],['loadingPlace','装箱地','text'],['unit','计价单位','text'],['priceBasis','价格口径','text']],
 rental:[['price','单价','number'],['container','箱型','container'],['unit','计价单位','text']],
 domestic:[['rule','计价规则','rule'],['cbm','轻货方价','number'],['ton','重货吨价','number'],['ratio','重泡比','positive'],['minimum','最低收费','number'],['delivery','送货费','number'],['deliveryIncluded','送货已含','boolean'],['fixed','固定金额','number']],
 rail:[['rate','外采铁路单价','number'],['ratio','铁路重泡比','positive'],['minimum','最低收费','number'],['fees','外采杂费合计','number']]
};
export function costGaps(row,kind,today=new Date().toISOString().slice(0,10)){
 const issues=[],add=(key,label,level='block')=>issues.push({key,label,level});
 const q=row.quote||{};
 if(!row.origin?.trim())add('origin','缺起始地');if(!row.destination?.trim())add('destination','缺目的地');
 // Activation is handled by the status column and batch enable, not missing data.
 if(row.status==='inactive')return issues;
 if(kind==='rail'){
  try{const unit=railUnit(row.inputs);for(const item of unit.pending||[])add('railFees',item,/过期/.test(item)?'warning':'block');}catch(e){add('railFees',e.message);}
 }else{
  if(!row.supplier_id&&!q.sharedPickup)add('supplier_id','缺供应商');
  if(!q.currency)add('currency','缺币种');
  if(kind==='domestic'){
   if(row.kind==='linehaul'&&['cbm','ton','max','billable'].includes(q.rule)){
    if(missing(q.cbm))add('cbm','轻货缺方价');if(missing(q.ton))add('ton','重货缺吨价');
    if(!(q.ratio>0))add('ratio','缺有效重泡比');
   }else if(q.rule==='tier'){
    if(!q.tiers?.length)add('tiers','缺提货阶梯');
    else if(q.tiers.some(t=>missing(t.amount)))add('tiers','阶梯缺价');
   }else if(q.rule==='fixed'&&missing(q.fixed))add('fixed','缺固定金额');
   else if(!['cbm','ton','max','billable','fixed'].includes(q.rule))add('rule','计价规则未确认');
   if(missing(q.minimum))add('minimum','缺最低收费口径');
   if(!q.deliveryIncluded&&missing(q.delivery))add('delivery','送货费未确认');
  }else{
   if(missing(q.price)||!Number.isFinite(q.price)||q.price<0)add('price','单价缺失或无效');
   else if(q.price===0)add('price','零单价需核实');
   if(!q.container||q.container.includes('待确认'))add('container','缺箱型');
   if(!q.unit)add('unit','缺计价单位');
   if(kind==='fcl'){if(!['SOC','COC'].includes(q.equipment))add('equipment','SOC/COC未确认');if(!q.scope||q.scope.includes('待确认'))add('scope','计价范围未确认');}
   if(kind==='trucking'){if(!q.loadingPlace)add('loadingPlace','缺装箱地');if(q.priceBasis!=='采购价')add('priceBasis','采购价口径未确认');}
   if((q.fees||[]).some(f=>missing(f.amount)))add('additionalFees','单项附加费缺价');
  }
 }
 // Reuse enable validation as a final guard; do not pretend a confirmed row is valid.
 try{enableCost({...row,status:'draft'},kind);}catch(e){if(!issues.some(i=>i.level==='block'))add('validation',e.message);}
 const from=q.validFrom||row.valid_from,until=q.validUntil||row.valid_until;
 if(!from||!until)add('validity','有效期未完整','warning');
 else if(until<today)add('validity','有效期已过','warning');else if(from>today)add('validity','尚未到生效期','warning');
 return issues;
}
export function repairCost(row,kind,field,value){
 const definition=[...gapFields.common,...gapFields[kind]].find(f=>f[0]===field);
 if(!definition)throw Error('该字段请使用单条编辑补全');
 if(String(value).trim()==='')throw Error('请填写修改值');
 const type=definition[2];
 if(['number','positive'].includes(type)){value=Number(value);if(!Number.isFinite(value)||value<0||type==='positive'&&value<=0)throw Error('金额须为非负数，重泡比须大于0');}
 if(type==='boolean')value=value==='yes';
 const out={origin:row.origin,destination:row.destination,supplier_id:row.supplier_id,status:'draft',supersedes_id:row.id};
 if(kind==='rail'){
  const inputs=structuredClone(row.inputs);
  if(inputs.mode!=='external')throw Error('自营铁路包含多项分摊费用，请在原记录逐项修改');
  const a=inputs.external?.[inputs.selected];if(!a)throw Error('外采供应商未选择');
  if(field==='currency')throw Error('外采铁路运费以USD维护，不支持直接换币种');
  if(field==='supplier_id'){a.supplierId=value;a.supplierName='已关联供应商';}else a[field]=value;
  delete inputs.railUnitCost;
  return {origin:row.origin,destination:row.destination,status:'draft',supersedes_id:row.id,inputs,valid_from:row.valid_from,valid_until:row.valid_until};
 }
 out.quote=structuredClone(row.quote);
 if(kind==='domestic')out.kind=row.kind;
 if(field==='supplier_id'){out.supplier_id=value;if(kind==='domestic')out.quote.supplier_id=value;}else out.quote[field]=value;
 if(kind==='domestic')out.quote.status='draft';
 return out;
}


// One primary state per record; activation remains a separate action.
export function costReadiness(row,kind){
 const issues=costGaps(row,kind).filter(i=>i.level==='block');
 if(row.status==='inactive')return {state:'inactive',label:'已停用',issues:[]};
 const priceKeys=new Set(['price','cbm','ton','fixed','tiers','additionalFees']);
 const priceMissing=issues.some(i=>priceKeys.has(i.key));
 return {state:priceMissing?'price':issues.length?'review':'ready',label:priceMissing?'缺价格':issues.length?'待确认':'可用',issues};
}
