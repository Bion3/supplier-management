const url = 'https://hcorkkudgicarsmexnqf.supabase.co';
const key = 'sb_publishable_nB2eShVqNNkND-zOSHYSnQ_Pf2xtBgp';
let session;
try { session = JSON.parse(sessionStorage.getItem('supplier-auth') || 'null'); } catch { session = null; }
function remember(value) { session = value; if(value) sessionStorage.setItem('supplier-auth',JSON.stringify(value)); else sessionStorage.removeItem('supplier-auth'); }
async function request(path, options = {}, token) {
 const response = await fetch(url + path, {...options, headers:{apikey:key,'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`} : {}),...options.headers}});
 const data = await response.json().catch(()=>null);
 if(!response.ok) throw new Error(data?.msg || data?.message || data?.error_description || '数据库请求失败，请检查网络和登录状态。');
 return data;
}
export async function login(email,password) {
 const data = await request('/auth/v1/token?grant_type=password',{method:'POST',body:JSON.stringify({email,password})});
 remember({...data,expires_at:Date.now()+data.expires_in*1000});
 return data.user;
}
async function token() {
 if(!session) throw new Error('请先登录。');
 if(Date.now() >= session.expires_at-60000) {
  try { const data=await request('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:JSON.stringify({refresh_token:session.refresh_token})}); remember({...data,expires_at:Date.now()+data.expires_in*1000}); }
  catch(error) { remember(null); throw error; }
 }
 return session.access_token;
}
export function currentUser() {return session?.user;}
export async function logout() {try {if(session) await request('/auth/v1/logout',{method:'POST'},await token());} finally {remember(null);}}
const statuses = {active:'合作中',pending:'待评估',inactive:'暂停合作',blacklisted:'暂停合作'};
export function fromRow(r) {return {id:r.id,name:r.company_name,country:r.country||'',region:r.region||'',city:r.city||'',contact:r.contact_name||'',category:r.supplier_type||'其他',phone:r.phone||'',email:r.email||'',routes:r.main_routes||'',notes:r.notes||'',status:statuses[r.status]||'待评估',createdAt:r.created_at,updatedAt:r.updated_at};}
export function toRow(s) {return {company_name:s.name,country:s.country,region:s.region,city:s.city,contact_name:s.contact,supplier_type:s.category,phone:s.phone,email:s.email,main_routes:s.routes,notes:s.notes,status:{'合作中':'active','待评估':'pending','暂停合作':'inactive'}[s.status],updated_at:new Date().toISOString()};}
export async function listSuppliers() {
 const result=[]; const access=await token();
 for(let offset=0;;offset+=500) {const rows=await request(`/rest/v1/suppliers?select=*&order=created_at.desc,id.asc&limit=500&offset=${offset}`,{},access);result.push(...rows.map(fromRow)); if(rows.length<500)break;}
 return result;
}
export async function saveSupplier(data,id) {
 const path='/rest/v1/suppliers'+(id?`?id=eq.${encodeURIComponent(id)}`:'');
 const rows=await request(path,{method:id?'PATCH':'POST',headers:{Prefer:'return=representation'},body:JSON.stringify(toRow(data))},await token());
 if(rows.length!==1) throw new Error('保存未成功，请确认账号权限后重试。');
 return fromRow(rows[0]);
}
export async function cloudRequest(path,options={}) {return request('/rest/v1/'+path,options,await token());}
export async function appRequest(path,options={}) {
 const response=await fetch(path,{...options,headers:{'Content-Type':'application/json',Authorization:'Bearer '+await token(),...options.headers}});
 const data=await response.json().catch(()=>null);
 if(!response.ok)throw Error(data?.error||'邮件服务请求失败。');
 return data;
}

export async function storageUpload(path,file) {
 return request('/storage/v1/object/freight-knowledge/'+path,{method:'POST',headers:{'Content-Type':file.type||'application/octet-stream','x-upsert':'false'},body:file},await token());
}
export async function storageRemove(path) {
 return request('/storage/v1/object/freight-knowledge',{method:'DELETE',body:JSON.stringify({prefixes:[path]})},await token());
}
export async function storageSignedURL(path) {
 const data=await request('/storage/v1/object/sign/freight-knowledge/'+path,{method:'POST',body:JSON.stringify({expiresIn:60})},await token());
 const signed=data.signedURL||data.signedUrl;
 if(!signed)throw Error('无法生成文件下载链接。');
 const result=new URL(signed.startsWith('/object/')?'/storage/v1'+signed:signed,url);
 if(result.origin!==url)throw Error('无效的文件链接。');
 return result.href;
}

