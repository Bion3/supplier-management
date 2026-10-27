import {estimateFcl} from './cost-unified-model.js';

// Recalculate each quotation with exactly the same inputs, conversion rates,
// fee inclusion and scope as the current comparison. No approximation by raw price.
export function compareFclSuppliers(input,data,choices={}){
 const base=estimateFcl(input,data,choices);
 const groups=[];
 for(const [key,rows] of Object.entries(base.available)){
  if(!rows.length)continue;
  const label={rail:'整箱铁路',truck:'国内拖车',rent:'SOC租箱'}[key]||key;
  const quotes=rows.map(row=>{
   const tested=estimateFcl(input,data,{...choices,[key]:row.id});
   const lines=tested.result.lines.filter(line=>line.quoteId===row.id);
   const amount=lines.reduce((sum,line)=>sum+line.value,0);
   const pending=tested.result.pending.filter(p=>p.startsWith(label+'：')||p.startsWith(label+' /'));
   const validity=tested.result.validity.find(v=>v.quoteId===row.id);
   // A missing core rate or an unsupported unit cannot be ranked by a false zero.
   const priced=lines.some(line=>line.name===label||key==='rent'&&line.name==='租箱基础费（不含超期）');
   return {id:row.id,supplierId:row.supplier_id,source:row,amount:priced?amount:null,
    pending,validity,complete:priced&&!pending.length,selected:base.inputs.sources[key]?.id===row.id};
  }).sort((a,b)=>Number(b.complete)-Number(a.complete)
   ||(a.amount===null?Infinity:a.amount)-(b.amount===null?Infinity:b.amount)
   ||String(a.supplierId||'').localeCompare(String(b.supplierId||''))
   ||String(a.id).localeCompare(String(b.id)));
  groups.push({key,label,quotes});
 }
 return groups;
}
export function compareLclPlans(matches){
 return [...matches].map(m=>({
  id:m.id,label:m.label,cost:m.result?.cost??null,complete:!!m.result?.complete,
  pending:m.result?.pending||[],validity:m.result?.validity||[]
 })).sort((a,b)=>Number(b.complete)-Number(a.complete)||(a.cost??Infinity)-(b.cost??Infinity)||a.id.localeCompare(b.id));
}
