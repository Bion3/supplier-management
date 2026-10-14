const pages=[
 {group:'首页',items:[['/hub.html','系统首页']]},
 {group:'基础资料',items:[['/','供应商档案']]},
 {group:'成本中心',items:[['/cost.html','成本测算'],['/pricing.html','采购价格中心']]},
 {group:'客户开发',items:[['/crm.html','客户资源'],['/inbox.html','收件箱'],['/mail.html','邮件发送']]},
 {group:'知识中心',items:[['/knowledge.html','货代知识库']]}
];
const path=location.pathname==='/'?'/':location.pathname;
const pricePages={'/pickup-rates.html':['国内运输','本地提货费'],'/rates.html':['国内运输','国内干线费'],'/rail-rates.html':['国际运输','铁路拼箱运费']};
const activePath=pricePages[path]?'/pricing.html':path;
const header=document.querySelector('body>header');
if(header){
 const active=pricePages[path]?.[1]||pages.flatMap(x=>x.items).find(([href])=>href===path)?.[1]||document.title;
 header.className='app-header';
 header.innerHTML=`<a class="app-brand" href="/hub.html"><span class="app-mark">E</span><span><b>国际物流管理系统</b><small>${active}</small></span></a><button class="nav-toggle" type="button" aria-expanded="false" aria-label="展开系统目录">目录</button><nav class="system-nav" aria-label="系统目录">${pages.map(section=>`<div class="nav-group"><span>${section.group}</span>${section.items.map(([href,label])=>`<a href="${href}" ${href===activePath?'aria-current="page"':''}>${label}</a>`).join('')}</div>`).join('')}</nav>`;
 const toggle=header.querySelector('.nav-toggle'),nav=header.querySelector('.system-nav');
 toggle.addEventListener('click',()=>{const open=toggle.getAttribute('aria-expanded')==='true';toggle.setAttribute('aria-expanded',String(!open));nav.classList.toggle('open',!open);});
}
if(pricePages[path]){const context=document.createElement('nav');context.className='price-breadcrumb';context.setAttribute('aria-label','当前位置');context.innerHTML=`<a href="/pricing.html">采购价格中心</a><span> / ${pricePages[path][0]} / ${pricePages[path][1]}</span>`;document.querySelector('main')?.prepend(context);}

