import {verifySession,readSessionCookie,sessionCookie,PRIVATE_HEADERS} from './session-auth.js';
export async function protectPage(request,{verify=verifySession,proceed}={}){
 const url=new URL(request.url);
 if(url.pathname==='/login.html'||url.pathname==='/login'||url.pathname.startsWith('/api/')||url.pathname.startsWith('/src/')||['/favicon.ico','/robots.txt'].includes(url.pathname))return proceed();
 const token=readSessionCookie(request);
 try{
  if(token&&await verify(token))return proceed({headers:PRIVATE_HEADERS});
  const login=new URL('/login.html',url.origin);login.searchParams.set('next',url.pathname+url.search);
  return new Response(null,{status:303,headers:{...PRIVATE_HEADERS,Location:login.pathname+login.search,'Set-Cookie':sessionCookie('',0)}});
 }catch{return new Response('登录验证暂不可用，请稍后刷新重试。',{status:503,headers:{...PRIVATE_HEADERS,'Content-Type':'text/plain; charset=utf-8'}});}
}
