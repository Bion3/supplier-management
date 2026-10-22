import {verifySession,readSessionCookie,sessionCookie,sameOrigin,PRIVATE_HEADERS} from './session-auth.js';
export async function GET(request){
 try{const user=await verifySession(readSessionCookie(request));return Response.json(user?{user}:{error:'请先登录。'},{status:user?200:401,headers:PRIVATE_HEADERS});}
 catch{return Response.json({error:'登录验证暂不可用，请稍后重试。'},{status:503,headers:PRIVATE_HEADERS});}
}
export async function POST(request){
 if(!sameOrigin(request))return Response.json({error:'请求来源无效。'},{status:403,headers:PRIVATE_HEADERS});
 const token=(request.headers.get('authorization')||'').replace(/^Bearer /i,'');
 try{const user=await verifySession(token);if(!user)return Response.json({error:'登录已失效或账号没有访问权限。'},{status:401,headers:{...PRIVATE_HEADERS,'Set-Cookie':sessionCookie('',0)}});
  return Response.json({user},{headers:{...PRIVATE_HEADERS,'Set-Cookie':sessionCookie(token)}});
 }catch{return Response.json({error:'登录验证暂不可用，请稍后重试。'},{status:503,headers:PRIVATE_HEADERS});}
}
export async function DELETE(request){
 if(!sameOrigin(request))return Response.json({error:'请求来源无效。'},{status:403,headers:PRIVATE_HEADERS});
 return Response.json({signed_out:true},{headers:{...PRIVATE_HEADERS,'Set-Cookie':sessionCookie('',0)}});
}
