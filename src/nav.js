import {logout} from './cloud.js';
const pages=[
 {group:'首页',items:[['/hub.html','系统首页']]},
 {group:'基础资料',items:[['/','供应商档案']]},
 {group:'成本中心',items:[['/cost.html','成本测算'],['/pricing.html','采购价格中心'],['/sales-prices.html','官网销售价格']]},
 {group:'客户开发',items:[['/crm.html','客户资源'],['/lead-map.html','地图获客'],['/discovery.html','候选审核'],['/inbox.html','收件箱'],['/mail.html','邮件发送']]},
 {group:'知识中心',items:[['/knowledge.html','货代知识库']]}
];
const path=location.pathname==='/index.html'?'/':location.pathname;
const pricePages={'/trucking.html':['国内运输','国内拖车费'],'/container-rental.html':['集装箱与箱务','集装箱租箱价格'],'/pickup-rates.html':['国内运输','本地提货费'],'/rates.html':['国内运输','国内干线费'],'/rail-rates.html':['国际运输','铁路拼箱运费'],'/fcl-rail.html':['国际运输','整箱铁路运费']};
const activePath=pricePages[path]?'/pricing.html':path;
const header=document.querySelector('body>header');
if(header){
 const active=pricePages[path]?.[1]||pages.flatMap(x=>x.items).find(([href])=>href===path)?.[1]||document.title;
 let saved={};try{saved=JSON.parse(localStorage.getItem('eurasiago-nav-groups')||'{}')||{};if(typeof saved!=='object'||Array.isArray(saved))saved={};}catch{}
 const link=(href,label)=>`<a href="${href}" ${href===path?'aria-current="page"':''}>${label}</a>`;
 const items=section=>section.items.map(([href,label])=>{
  if(href!=='/pricing.html')return link(href,label);
  return `<details class="nav-subgroup" data-nav-group="采购价格中心" ${activePath===href||saved['采购价格中心']?'open':''}><summary>${label}</summary><div class="nav-children">${link(href,'价格库总览')}${Object.entries(pricePages).map(([url,info])=>link(url,info[1])).join('')}</div></details>`;
 }).join('');
 header.className='app-header';document.body.classList.add('has-sidebar');
 header.innerHTML=`<a class="app-brand" href="/hub.html"><span class="app-mark">E</span><span><b>国际物流管理系统</b><small>${active}</small></span></a><button class="nav-toggle" type="button" aria-expanded="false" aria-controls="system-directory" aria-label="展开系统目录">目录</button><nav id="system-directory" class="system-nav" aria-label="系统目录">${pages.map(section=>section.group==='首页'?`<div class="nav-home">${items(section)}</div>`:`<details class="nav-group" data-nav-group="${section.group}" ${section.items.some(([href])=>href===activePath)||saved[section.group]?'open':''}><summary>${section.group}</summary><div class="nav-children">${items(section)}</div></details>`).join('')}</nav>`;
 const signout=document.createElement('button');signout.type='button';signout.className='nav-signout';signout.textContent='退出登录';signout.addEventListener('click',async()=>{signout.disabled=true;try{await logout();}catch{location.replace('/login.html');}});header.querySelector('.system-nav').append(signout);
 const toggle=header.querySelector('.nav-toggle'),nav=header.querySelector('.system-nav');
 function close(){toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-label','展开系统目录');nav.classList.remove('open');}
 toggle.addEventListener('click',()=>{const open=toggle.getAttribute('aria-expanded')!=='true';toggle.setAttribute('aria-expanded',String(open));toggle.setAttribute('aria-label',open?'收起系统目录':'展开系统目录');nav.classList.toggle('open',open);});
 header.addEventListener('keydown',event=>{if(event.key==='Escape'){close();toggle.focus();}});
 nav.addEventListener('click',event=>{if(event.target.closest('a'))close();});
 for(const group of nav.querySelectorAll('details'))group.addEventListener('toggle',()=>{saved[group.dataset.navGroup]=group.open;try{localStorage.setItem('eurasiago-nav-groups',JSON.stringify(saved));}catch{}});
}
if(pricePages[path]){const context=document.createElement('nav');context.className='price-breadcrumb';context.setAttribute('aria-label','当前位置');context.innerHTML=`<a href="/pricing.html">采购价格中心</a><span> / ${pricePages[path][0]} / ${pricePages[path][1]}</span>`;document.querySelector('main')?.prepend(context);}
