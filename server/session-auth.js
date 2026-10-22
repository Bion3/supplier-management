const AUTH_URL='https://hcorkkudgicarsmexnqf.supabase.co/auth/v1/user';
const API_KEY='sb_publishable_nB2eShVqNNkND-zOSHYSnQ_Pf2xtBgp';
// Matches the existing supplier access policy; user-editable metadata is never trusted.
const MEMBERS=new Set(['1520a854-1746-4add-af50-6605967bb72f','2c1dc7d7-ecc4-4992-9bca-301877e9cd66']);
export const COOKIE='__Host-supplier-session';
export const PRIVATE_HEADERS={'Cache-Control':'private, no-store, max-age=0','Vercel-CDN-Cache-Control':'no-store'};
export function sessionCookie(token,maxAge=3600){return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;}
export function readSessionCookie(request){const pairs=(request.headers.get('cookie')||'').split(';').map(v=>v.trim());const values=pairs.filter(v=>v.startsWith(COOKIE+'=')).map(v=>v.slice(COOKIE.length+1));return values.length===1?values[0]:'';}
export async function verifySession(token,fetcher=fetch){
 if(!token||token.length>8192||!/^[A-Za-z0-9_.-]+$/.test(token))return null;
 const response=await fetcher(AUTH_URL,{headers:{apikey:API_KEY,Authorization:'Bearer '+token},cache:'no-store',signal:AbortSignal.timeout(6000)});
 if(response.status===401||response.status===403)return null;
 if(!response.ok)throw Error('登录验证暂不可用，请稍后重试。');
 const user=await response.json();
 return user?.id&&!user.is_anonymous&&MEMBERS.has(user.id)?{id:user.id,email:user.email}:null;
}
export function sameOrigin(request){return request.headers.get('origin')===new URL(request.url).origin;}
