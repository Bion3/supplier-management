// The existing authenticated request helper supplies the shared workspace token.
export function createOrderStore(request){
 const table='freight_booking_orders';
 const unpack=row=>({...row.data,id:row.id,version:row.version});
 return {
  async list(offset=0){const rows=await request(`${table}?select=id,data,version&order=created_at.desc,id.asc&limit=100&offset=${offset}`);return rows.map(unpack);},
  async save(order,{create=false}={}){
   const {version,...data}=order;
   const path=table+(create?'':`?id=eq.${encodeURIComponent(order.id)}&version=eq.${Number(version)}`);
   if(!create&&(!Number.isInteger(version)||version<1))throw Error('订单版本无效，请刷新后重试。');
   const rows=await request(path,{method:create?'POST':'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify(create?{id:order.id,data}:{data})});
   if(rows.length!==1)throw Error('此订单已被其他页面修改，或当前账号无权限。请刷新列表后重新编辑；本次内容尚未保存。');
   return unpack(rows[0]);
  }
 };
}
