const base='https://hcorkkudgicarsmexnqf.supabase.co',key='sb_publishable_nB2eShVqNNkND-zOSHYSnQ_Pf2xtBgp';
let session;try{session=JSON.parse(sessionStorage.getItem('eurasiago-client-auth')||'null')}catch{}
function remember(s){session=s;if(s)sessionStorage.setItem('eurasiago-client-auth',JSON.stringify(s));else sessionStorage.removeItem('eurasiago-client-auth')}
async function request(path,options={},access){const r=await fetch(base+path,{...options,headers:{apikey:key,'Content-Type':'application/json',...(access?{Authorization:'Bearer '+access}:{}),...options.headers}});const d=await r.json().catch(()=>null);if(!r.ok)throw Error(d?.msg||d?.message||d?.error_description||'请求失败，请重试');return d;}
export function portalUser(){return session?.user}
export async function portalLogin(email,password){const s=await request('/auth/v1/token?grant_type=password',{method:'POST',body:JSON.stringify({email,password})});remember({...s,expires_at:Date.now()+s.expires_in*1000});return s.user}
export async function portalSignup(email,password){await request('/auth/v1/signup',{method:'POST',body:JSON.stringify({email,password})});}
export async function portalLogout(){const token=session?.access_token;remember(null);if(token)await request('/auth/v1/logout',{method:'POST'},token).catch(()=>{});}
let refresh;
async function token(){if(!session)throw Error('请先登录');if(session.expires_at<Date.now()+60000){if(!refresh)refresh=request('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:JSON.stringify({refresh_token:session.refresh_token})}).then(s=>{remember({...s,expires_at:Date.now()+s.expires_in*1000});return s.access_token}).catch(e=>{remember(null);throw e}).finally(()=>{refresh=null});return refresh}return session.access_token}
export async function portalRequest(path,options={}){return request('/rest/v1/'+path,options,await token())}
