export function parseCSV(input){
 const text=String(input).replace(/^\uFEFF/,''),rows=[];let row=[],field='',quoted=false;
 for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}else if(!quoted&&(c===','||c==='\n'||c==='\r')){row.push(field);field='';if(c!==','){if(c==='\r'&&text[i+1]==='\n')i++;if(row.some(Boolean))rows.push(row);row=[];}}else field+=c;}
 if(quoted)throw Error('CSV 引号未闭合');if(field||row.length){row.push(field);rows.push(row);}return rows;
}
export function hmrcOptions({hs='854143',year=String(new Date().getUTCFullYear()),page=1}={}){
 hs=String(hs).replace(/\s/g,'');year=String(year);page=Number(page);
 if(!/^\d{6}(\d{2})?$/.test(hs))throw Error('请输入6位或8位商品编码');
 if(!/^\d{4}$/.test(year)||+year<2016||+year>new Date().getUTCFullYear())throw Error('年份无效');
 if(!Number.isInteger(page)||page<1||page>100)throw Error('页码无效');return {hs,year,page};
}
export function hmrcSearchURL(options){const {hs,year}=hmrcOptions(options);const p=new URLSearchParams({q:hs,t:'Traders::commodity-code',traders:'Importers',year});return 'https://www.uktradeinfo.com/search/traders/?'+p;}
export function hmrcCSVURL(options){const {hs,year}=hmrcOptions(options);const p=new URLSearchParams({q:hs,t:'Traders::commodity-code',traders:'Importers',year});return 'https://www.uktradeinfo.com/umbraco/api/searchdownload/traders?'+p;}
export function hmrcEntries(csv,options){
 const {hs,year,page}=hmrcOptions(options),[header,...rows]=parseCSV(csv);if(!header||!['CompanyName','PostCode','CommodityCode','TradeTypeDescription','Month','Year'].every(k=>header.includes(k)))throw Error('官方返回格式已变化，停止采集');
 const map=new Map();for(const values of rows){if(values.length!==header.length)throw Error('CSV 列数不一致');const r=Object.fromEntries(header.map((k,i)=>[k,values[i]]));if(r.TradeTypeDescription!=='Import'||r.Year!==year||!r.CommodityCode.startsWith(hs))continue;
 const month=Number(r.Month);if(!Number.isInteger(month)||month<1||month>12||!r.CompanyName.trim())continue;
 const key=r.CompanyName.trim()+'|'+r.PostCode.trim();let e=map.get(key);if(!e){const query=new URLSearchParams({q:r.CompanyName.trim(),t:'Traders::name'});e={company_name:r.CompanyName.trim(),country:'英国',industry:'海关贸易企业',source_url:'https://www.uktradeinfo.com/search/traders/?'+query,website:'',contacts:[],address:['Address1','Address2','Address3','Address4','Address5','PostCode'].map(k=>r[k]).filter(Boolean).join(', '),postcode:r.PostCode,registration_scope:'HMRC 英国贸易登记；不代表企业总部位于英国',data_type:'企业贸易活动名录',provider:'HMRC',trade_direction:'进口',hs_codes:[],products:[],activity_months:[],year,china_trade:'未确认',rail_demand:'未确认',source_download_url:hmrcCSVURL(options)};map.set(key,e);}
 if(!e.hs_codes.includes(r.CommodityCode))e.hs_codes.push(r.CommodityCode);if(r.CN8Description&&!e.products.includes(r.CN8Description))e.products.push(r.CN8Description);const period=year+'-'+String(month).padStart(2,'0');if(!e.activity_months.includes(period))e.activity_months.push(period);
 }
 const all=[...map.values()];for(const e of all){e.activity_months.sort();e.latest_activity=e.activity_months.at(-1);e.industry=e.hs_codes.some(h=>h.startsWith('854143'))?'光伏组件':e.hs_codes.some(h=>h.startsWith('8507'))?'电池与储能':'海关贸易企业';}
 for(const e of all){e.query_hs=hs;e.commodity_code=e.hs_codes[0];const source=new URL(e.source_url);source.searchParams.set('postcode',e.postcode);source.searchParams.set('year',year);source.searchParams.set('commodities',hs);e.source_url=source.href;e.identity_status='名称与英国贸易登记匹配；法律实体身份待核实';}
 all.sort((a,b)=>b.latest_activity.localeCompare(a.latest_activity)||a.company_name.localeCompare(b.company_name)||a.postcode.localeCompare(b.postcode));return {entries:all.slice((page-1)*50,page*50),total:all.length,page,more:all.length>page*50,source_url:hmrcSearchURL(options),notice:'月度贸易活动，不是逐票货量；往来国家、中国采购关系和铁路需求未确认。'};
}
