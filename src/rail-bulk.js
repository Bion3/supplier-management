import {defaults} from './cost-model.js';
import {railUnit} from './rail-unit.js';
export const latestPlans=rows=>{const old=new Set(rows.map(r=>r.supersedes_id).filter(Boolean));return rows.filter(r=>!old.has(r.id));};
function finite(value,name){const n=Number(value);if(value===''||!Number.isFinite(n)||n<0)throw Error(name+'必须是非负数');return n;}
export function parseRailRows(text,supplier){
 if(!supplier?.id)throw Error('请选择供应商');
 const lines=text.trim().split(/\r?\n/).filter(x=>x.trim());if(!text.trim())throw Error('请粘贴线路数据');if(lines.length>500)throw Error('每次最多500条');
 return lines.map((line,i)=>{const c=line.split('\t').map(x=>x.trim());if(c.length<4||c.length>8)throw Error(`第${i+1}行需要4至8列，以制表符分隔`);const [origin,destination,rate,ratio,fees='',minimum='',until='',tags='']=c;if(!origin||!destination)throw Error(`第${i+1}行缺少站点`);const s=defaults();s.mode='external';s.external[0]={supplierId:supplier.id,supplierName:supplier.name,version:'批量录入',rate:finite(rate,'单价'),ratio:finite(ratio,'重抛比'),fees:fees===''?null:finite(fees,'杂费'),minimum:minimum===''?0:finite(minimum,'最低收费'),included:'',validUntil:until};if(until&&!/^\d{4}-\d{2}-\d{2}$/.test(until))throw Error('有效期格式应为YYYY-MM-DD');s.supplierTags=tags.split(/[,，]/).filter(Boolean);s.railUnitCost=railUnit(s);return {origin,destination,status:'confirmed',inputs:s,valid_from:null,valid_until:until||null,supersedes_id:null};});
}
export function editRailRows(rows,settings,supplier){
 if(rows.some(row=>row.inputs.importSource))throw Error('供应商原表含特殊计费规则，请通过“查看 / 更新”维护单价；可单独批量停用。');
 return rows.map(row=>{const s=structuredClone(row.inputs);let changed=false;const set=(key,target,name)=>{if(settings[key]!==''&&settings[key]!==undefined){target[key]=finite(settings[key],name);changed=true;}};
 if(settings.rate!==''&&settings.rate!==undefined){if(s.mode!=='external')throw Error('自营单价需通过整柜成本折算；请仅筛选外采后批量改单价');set('rate',s.external[s.selected],'单价');}
 if(settings.ratio!==''&&settings.ratio!==undefined){const ratio=finite(settings.ratio,'重抛比');if(ratio<=0)throw Error('重抛比必须大于0');if(s.mode==='own')s.railRatio=ratio;else s.external[s.selected].ratio=ratio;changed=true;}
 if(settings.fees!==''&&settings.fees!==undefined){if(s.mode!=='external')throw Error('另计票费仅适用于外采');set('fees',s.external[s.selected],'杂费');}
 if(settings.component&&settings.componentAmount!==''){if(s.mode!=='own')throw Error('整柜费用仅适用于自营');const item=s.own.find(x=>x.name===settings.component);if(!item)throw Error('未找到费用项：'+settings.component);item.alternatives[item.selected].amount=finite(settings.componentAmount,'整柜费用');changed=true;}
 if(settings.supplierId){if(s.mode!=='external')throw Error('整体供应商仅适用于外采，自营请分项维护');s.external[s.selected].supplierId=supplier.id;s.external[s.selected].supplierName=supplier.name;changed=true;}
 if(settings.tags){s.supplierTags=[...new Set([...(s.supplierTags||[]),...settings.tags.split(/[,，]/).map(x=>x.trim()).filter(Boolean)])];changed=true;}
 let until=row.valid_until;if(settings.until){until=settings.until;if(row.valid_from&&row.valid_from>until)throw Error('有效期不能早于生效日期');if(s.mode==='external')s.external[s.selected].validUntil=until;changed=true;}
 if(!changed)throw Error('请填写至少一个修改项');s.railUnitCost=railUnit(s);return {origin:row.origin,destination:row.destination,status:row.status,inputs:s,valid_from:row.valid_from,valid_until:until,supersedes_id:row.id};});
}
export const deactivateRailRows=rows=>rows.map(row=>({origin:row.origin,destination:row.destination,status:'inactive',inputs:structuredClone(row.inputs),valid_from:row.valid_from,valid_until:row.valid_until,supersedes_id:row.id}));
