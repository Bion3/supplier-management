export const sources = [
 {name:'中国海关统计数据在线查询',purpose:'statistics',markets:['china'],cost:'官方公开查询',url:'https://stats.customs.gov.cn/',fields:'商品 / HS 编码、贸易伙伴、月份、金额、数量及收发货人注册地等汇总统计。',limit:'适合看行业与国家进出口量，不是逐票企业买卖双方名录。'},
 {name:'UN Comtrade',purpose:'statistics',markets:['china','europe','usa','global'],cost:'公开查询 / API，额度以平台为准',url:'https://comtradeplus.un.org/',fields:'各报告国按商品、伙伴国、期间和贸易方向提供的进出口统计。',limit:'覆盖与更新取决于报告国；不用于直接查企业名称或邮箱。'},
 {name:'Eurostat · 欧盟货物贸易',purpose:'statistics',markets:['europe'],cost:'官方公开统计',url:'https://ec.europa.eu/eurostat/web/international-trade-in-goods/overview',fields:'欧洲按产品与贸易伙伴统计的进出口金额、数量及部分运输方式数据。',limit:'企业特征统计是汇总数据，不是可识别具体进口商的名单。'},
 {name:'ImportYeti · 美国海运提单',purpose:'company',markets:['usa'],cost:'网站可注册查询，API 与导出另核实',url:'https://www.importyeti.com/our-data',fields:'美国海运进口提单，可用于查收货企业、海外供应商及交易关系。',limit:'美国空运与陆运记录不在该公开提单覆盖内；企业名称变更或保密会造成缺失。'},
 {name:'Panjiva · 企业贸易数据',purpose:'company',markets:['china','europe','usa','global'],cost:'商业订阅，先核对样本与授权',url:'https://panjiva.com/api-guide/data-selection/data-sources',fields:'按数据集提供企业、交易双方与货运记录；提供 API 数据源说明。',limit:'不同国家、方向和字段覆盖不同；欧洲企业出现于对方记录，不代表覆盖欧洲本国全部进口。'},
 {name:'ImportGenius · 贸易记录',purpose:'company',markets:['china','europe','usa','global'],cost:'商业订阅，先核对目标国家样本',url:'https://www.importgenius.com/how-it-works',fields:'按其国家数据集查询交易企业、货物与运输记录，具体字段以样本为准。',limit:'目标企业可能来自贸易对方记录；铁路、空运、陆运和年份覆盖需逐项确认。'}
];
export function filterSources({purpose='',market='',query=''}={}) {
 const q=query.trim().toLocaleLowerCase();
 return sources.filter(s=>(!purpose||s.purpose===purpose)&&(!market||s.markets.includes(market))&&(!q||[s.name,s.cost,s.fields,s.limit].join(' ').toLocaleLowerCase().includes(q)));
}
if(typeof document!=='undefined'){
 const purpose=document.getElementById('purpose'),market=document.getElementById('market'),query=document.getElementById('source-query'),cards=document.getElementById('source-cards');
 function render(){
  const rows=filterSources({purpose:purpose.value,market:market.value,query:query.value});
  cards.replaceChildren(...rows.map(s=>{
   const card=document.createElement('article');card.className='customs-card';
   const title=document.createElement('h2');title.textContent=s.name;
   const meta=document.createElement('p');meta.className='customs-meta';meta.textContent=(s.purpose==='statistics'?'汇总统计':'企业与逐票数据')+' · '+s.cost;
   const fields=document.createElement('p');fields.textContent=s.fields;
   const limit=document.createElement('p');limit.className='customs-meta';limit.textContent=s.limit;
   const link=document.createElement('a');link.href=s.url;link.target='_blank';link.rel='noopener noreferrer';link.textContent='前往来源查询 ↗';
   card.append(title,meta,fields,limit,link);return card;
  }));
  document.getElementById('source-count').textContent=rows.length+' 个来源 · 国家筛选表示适用查询方向，具体覆盖以来源样本为准';
  document.getElementById('source-empty').hidden=rows.length>0;
 }
 purpose.addEventListener('change',render);market.addEventListener('change',render);query.addEventListener('input',render);
 document.getElementById('clear-filters').addEventListener('click',()=>{purpose.value='';market.value='';query.value='';render();});
 render();
}
