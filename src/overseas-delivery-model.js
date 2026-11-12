export {latestTrucking,validityOf} from './trucking-model.js';
export const blankTrucking=(deliveryType='lcl')=>({deliveryType,originCountry:'',destinationCountry:'',loadingPlace:'',container:'',vehicle:'',currency:'EUR',price:null,unit:'',priceBasis:'参考价',referenceOnly:true,validFrom:'',validUntil:'',notes:'',fees:[],cargo:{},profitPreset:{mode:'markup',value:0}});
export function validateTrucking(row){
 const q=row.quote;
 if(!row.origin?.trim()||!row.destination?.trim())throw Error('请填写起运站 / 仓和目的地');
 if(!['fcl','lcl'].includes(q.deliveryType))throw Error('请选择整柜或拼箱配送');
 if(!['draft','confirmed','inactive'].includes(row.status))throw Error('状态无效');
 if(q.price!==null&&(!Number.isFinite(q.price)||q.price<0))throw Error('价格须为非负数或留空');
 if(!['USD','CNY','EUR',''].includes(q.currency))throw Error('币种无效');
 if(!['','待确认','柜','车','票','40HQ','CBM','kg','件'].includes(q.unit))throw Error('计价单位无效');
 if(q.validFrom&&q.validUntil&&q.validFrom>q.validUntil)throw Error('有效期顺序错误');
 for(const [k,v] of Object.entries(q.cargo||{}))if(['packages','grossWeightKg','volumeCbm'].includes(k)&&v!==null&&(!Number.isFinite(v)||v<0||(k==='packages'&&!Number.isInteger(v))))throw Error('请检查件数、重量和体积');
 for(const f of q.fees||[])if(!f.name?.trim()||!['USD','CNY','EUR'].includes(f.currency)||f.amount!==null&&(!Number.isFinite(f.amount)||f.amount<0))throw Error('请检查附加费');
 if(row.status==='confirmed'&&(!row.supplier_id||!(q.price>0)||!q.currency||!q.unit||q.unit==='待确认'||q.priceBasis!=='采购价'||q.referenceOnly||q.deliveryType==='fcl'&&!q.container?.trim()))throw Error('启用前请确认供应商、采购单价、计价单位及整柜箱型；单票参考价保留为待确认');
 return row;
}
export function truckingVersion(row,changes={}){return validateTrucking({...row,id:undefined,created_at:undefined,created_by:undefined,supersedes_id:row.id,...changes});}
