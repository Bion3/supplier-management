import {lookup} from 'node:dns/promises';
import https from 'node:https';
import {isIP} from 'node:net';

function publicIPv4(address){
 if(isIP(address)!==4)return false;
 const p=address.split('.').map(Number);
 if(p[0]===0||p[0]===10||p[0]===127||p[0]>=224||p[0]===169&&p[1]===254||p[0]===172&&p[1]>=16&&p[1]<=31||p[0]===192&&p[1]===168||p[0]===100&&p[1]>=64&&p[1]<=127||p[0]===198&&p[1]>=18&&p[1]<=19||p[0]===192&&p[1]===0&&p[2]===0||p[0]===192&&p[1]===0&&p[2]===2||p[0]===198&&p[1]===51&&p[2]===100||p[0]===203&&p[1]===0&&p[2]===113)return false;
 return true;
}
export function websiteUrl(value){
 try{
  const url=new URL(String(value||''));
  if(url.protocol!=='https:'||url.username||url.password||url.port&&url.port!=='443'||url.hostname.length>253||!url.hostname.includes('.')||isIP(url.hostname)||url.hostname.toLowerCase().endsWith('.local'))return null;
  url.hash='';return url;
 }catch{return null;}
}
function readHtml(url,address){
 return new Promise((resolve,reject)=>{
  const req=https.request({hostname:address,port:443,path:url.pathname+url.search,method:'GET',servername:url.hostname,headers:{Host:url.hostname,'User-Agent':'EurasiagoLeadResearch/1.0 (+https://eurasiago.com; business-contact research)','Accept':'text/html','Accept-Encoding':'identity'},timeout:7000,rejectUnauthorized:true},res=>{
   if(res.statusCode!==200){res.resume();reject(Error('网页未返回200'));return;}
   if(!/text\/html/i.test(String(res.headers['content-type']||''))){res.resume();reject(Error('非 HTML 页面'));return;}
   const parts=[];let size=0;
   res.on('data',part=>{size+=part.length;if(size>250000){req.destroy(Error('网页超过大小限制'));return;}parts.push(part);});
   res.on('end',()=>resolve(Buffer.concat(parts).toString('utf8')));
  });
  req.on('timeout',()=>req.destroy(Error('页面读取超时')));req.on('error',reject);req.end();
 });
}
async function fetchSafe(url){
 const records=await lookup(url.hostname,{all:true,verbatim:true});
 const usable=records.filter(r=>publicIPv4(r.address));
 // Fail closed if DNS returns any private/reserved address.
 if(!records.length||usable.length!==records.length)throw Error('网站地址不符合安全访问要求');
 return readHtml(url,usable[0].address);
}
function decode(s){return s.replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(+n)).replace(/&commat;/g,'@').replace(/&amp;/g,'&');}
function getContactLinks(html,base){
 const links=[];const rx=/<a\b[^>]*href\s*=\s*["']([^"'<>]{1,400})["'][^>]*>/gi;let m;
 while((m=rx.exec(html))&&links.length<8){
  try{const u=new URL(decode(m[1]),base);if(u.origin!==base.origin||!/contact|kontakt|impressum|about|ueber-uns|über-uns|team|legal/i.test(u.pathname)||!websiteUrl(u.href))continue;
   if(!links.some(x=>x.href===u.href))links.push(u);
  }catch{}
 }
 return links;
}
function extract(html,url){
 const found=[];
 function add(type,value){value=decode(value).trim().replace(/^[\s:]+|[\s.,;]+$/g,'');if(value.length<5||value.length>120)return;if(!found.some(c=>c.type===type&&c.value.toLowerCase()===value.toLowerCase()))found.push({type,value,source_url:url.href,source_type:'official_website',verification:'unverified'});}
 for(const match of html.matchAll(/href\s*=\s*["']mailto:([^"'?<>\s]+)(?:\?[^"']*)?["']/gi)){try{add('email',decodeURIComponent(match[1]));}catch{add('email',match[1]);}}
 for(const match of decode(html).matchAll(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi))add('email',match[0]);
 for(const match of html.matchAll(/href\s*=\s*["']tel:([^"'<>]+)["']/gi))add('phone',decodeURIComponent(match[1]));
 return found.filter(c=>c.type!=='email'||!c.value.match(/\.(png|jpg|svg|webp)$/i)).slice(0,25);
}
export async function researchWebsite(website){
 const home=websiteUrl(website);if(!home)throw Error('目前只支持正常的 HTTPS 企业官网');
 // Reduce scope to public homepage and at most two linked pages, same origin only.
 const root=new URL('/',home),pages=[home];const seen=new Set(),contacts=[],evidence=[],errors=[];
 for(let i=0;i<pages.length&&seen.size<3;i++){
  const url=pages[i];if(seen.has(url.href))continue;seen.add(url.href);
  try{
   const html=await fetchSafe(url),items=extract(html,url);evidence.push({url:url.href,found:items.length,checked_at:new Date().toISOString()});
   for(const item of items)if(!contacts.some(x=>x.type===item.type&&x.value.toLowerCase()===item.value.toLowerCase()))contacts.push(item);
   if(i===0)for(const link of getContactLinks(html,url).slice(0,2))pages.push(link);
  }catch(e){errors.push(url.href+': '+e.message);}
 }
 return {contacts:contacts.slice(0,40),evidence,errors,checked_pages:seen.size};
}
