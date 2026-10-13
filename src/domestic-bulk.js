import {validateRate} from './domestic-model.js';

export function inferRule(quote){
 if(quote.cbm!==null&&quote.cbm!==undefined&&quote.ton!==null&&quote.ton!==undefined)return 'max';
 if(quote.cbm!==null&&quote.cbm!==undefined)return 'cbm';
 if(quote.ton!==null&&quote.ton!==undefined)return 'ton';
 return null;
}

export function prepareBulkConfirmation(row,settings){
 try{
  if(row.status!=='draft')throw Error('仅待确认记录可批量确认');
  if(!settings.supplierId)throw Error('请选择供应商');
  const quote={...structuredClone(row.quote),kind:row.kind,origin:row.origin,destination:row.destination,supplier_id:settings.supplierId,status:'confirmed'};
  quote.rule=settings.rule==='auto'?inferRule(quote):settings.rule;
  if(!quote.rule)throw Error('吨价和方价均缺失');
  if(quote.rule==='max'&&(quote.cbm===null||quote.cbm===undefined||quote.ton===null||quote.ton===undefined))throw Error('吨价/方价取大需要两项价格');
  if(['cbm','billable'].includes(quote.rule)&&(quote.cbm===null||quote.cbm===undefined))throw Error('缺少方价');
  if(quote.rule==='ton'&&(quote.ton===null||quote.ton===undefined))throw Error('缺少吨价');
  quote.ratio=Number(settings.ratio);
  quote.minimum=Number(settings.minimum);
  if(!Number.isFinite(quote.ratio)||quote.ratio<=0)throw Error('重抛比必须大于0');
  if(!Number.isFinite(quote.minimum)||quote.minimum<0)throw Error('最低收费不能为负数');
  if(quote.delivery===null||quote.delivery===undefined){
   if(settings.missingDelivery==='skip')throw Error('送货费缺失');
   if(settings.missingDelivery==='zero'){quote.delivery=0;quote.deliveryIncluded=false;}
   if(settings.missingDelivery==='included'){quote.delivery=null;quote.deliveryIncluded=true;}
  }
  if(settings.validUntil)quote.validUntil=settings.validUntil;
  quote.source=[quote.source,settings.versionLabel].filter(Boolean).join(' · ');
  validateRate(quote);
  return {ok:true,value:{kind:row.kind,origin:row.origin,destination:row.destination,supplier_id:settings.supplierId,status:'confirmed',quote,supersedes_id:row.id}};
 }catch(error){return {ok:false,reason:error.message,row};}
}

export function prepareBulk(rows,settings){
 const prepared=rows.map(row=>prepareBulkConfirmation(row,settings));
 return {ready:prepared.filter(x=>x.ok).map(x=>x.value),skipped:prepared.filter(x=>!x.ok).map(x=>({id:x.row.id,origin:x.row.origin,destination:x.row.destination,reason:x.reason}))};
}
