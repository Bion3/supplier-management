export const warehouseFields=['name','warehouse_type','port','supplier','country','address','charges','hours','contact','phone','notes'];
export function validateWarehouse(value){
 const row=Object.fromEntries(warehouseFields.map(k=>[k,String(value[k]??'').trim()]));
 if(!row.name||row.name.length>120)throw Error('请填写仓库名称（最多120字）');
 if(!['集货仓','装箱仓','拆箱仓'].includes(row.warehouse_type))throw Error('请选择仓库类型');
 if(warehouseFields.some(k=>row[k].length>6000))throw Error('单个字段最多6000字');
 row.enabled=value.enabled===true||value.enabled==='true';return row;
}
export function warehouseQuery(filters,page=1){
 const q=new URLSearchParams({select:'*',order:'name.asc,id.asc',limit:'51',offset:String((page-1)*50)});
 // Quote PostgREST operands; escape pattern metacharacters so input is literal.
 const pattern=v=>'"*'+String(v).trim().replace(/[\\%_*"\n\r]/g,c=>c==='\n'||c==='\r'?' ':('\\'+c))+'*"';
 if(filters.search?.trim())q.set('or','('+['name','address','contact','phone'].map(k=>k+'.ilike.'+pattern(filters.search)).join(',')+')');
 if(filters.type)q.set('warehouse_type','eq.'+filters.type);
 for(const k of ['port','supplier'])if(filters[k]?.trim())q.set(k,'ilike.'+pattern(filters[k]).slice(1,-1));
 if(['true','false'].includes(filters.status))q.set('enabled','eq.'+filters.status);
 return 'domestic_warehouses?'+q.toString();
}
