import {Resolver} from 'node:dns/promises';
import {domainToASCII} from 'node:url';
import {validEmail} from '../src/mail-model.js';
export async function checkEmail(value,resolve){
 const email=String(value||'').trim(),domain=domainToASCII(email.split('@')[1]||'');
 if(!validEmail(email)||!domain||domain.length>253||domain.split('.').some(p=>!p||p.length>63||! /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(p)))return {email,status:'invalid',reason:'邮箱格式错误'};
 try{const mx=await resolve(domain,'MX');
 if(mx.length&&mx.every(r=>!r.exchange||r.exchange==='.'))return {email,status:'invalid',reason:'域名明确声明不接收邮件（Null MX）'};
 if(mx.some(r=>r.exchange&&r.exchange!=='.'))return {email,status:'domain_ok',reason:'收信域名检查通过，具体邮箱是否存在仍未知'};
 }catch(e){if(e.code==='ENOTFOUND')return {email,status:'invalid',reason:'邮箱域名不存在'};if(e.code!=='ENODATA')return {email,status:'unknown',reason:'DNS 查询暂时失败，请稍后重试'};}
 // SMTP permits implicit MX via A/AAAA when there is no explicit MX.
 const addresses=await Promise.allSettled(['A','AAAA'].map(t=>resolve(domain,t)));
 if(addresses.some(r=>r.status==='fulfilled'&&r.value.length))return {email,status:'domain_ok',reason:'域名有备用收信地址，具体邮箱是否存在仍未知'};
 if(addresses.every(r=>r.status==='fulfilled'||['ENOTFOUND','ENODATA'].includes(r.reason?.code)))return {email,status:'invalid',reason:'域名没有收信服务器或备用地址'};
 return {email,status:'unknown',reason:'DNS 查询暂时失败，请稍后重试'};
}
export async function checkEmails(emails){
 const resolver=new Resolver({timeout:2500,tries:1}),cache=new Map();
 const resolve=(domain,type)=>{const key=domain+'|'+type;if(!cache.has(key))cache.set(key,resolver.resolve(domain,type));return cache.get(key);};
 const unique=[...new Set(emails.map(v=>String(v).trim().toLowerCase()))];
 const results=[];for(let i=0;i<unique.length;i+=5)results.push(...await Promise.all(unique.slice(i,i+5).map(v=>checkEmail(v,resolve))));return results;
}
