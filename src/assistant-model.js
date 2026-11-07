export const countryAliases={德国:['德国','Germany'],波兰:['波兰','Poland'],荷兰:['荷兰','Netherlands'],法国:['法国','France'],意大利:['意大利','Italy'],英国:['英国','United Kingdom','UK'],西班牙:['西班牙','Spain'],捷克:['捷克','Czech'],匈牙利:['匈牙利','Hungary'],俄罗斯:['俄罗斯','Russia'],伊朗:['伊朗','Iran']};
export function assistantIntent(text){
 if(/邮件|开发信|跟进信|收件|回复|email|draft/i.test(text))return 'mail';
 if(/任务|进度|采集|失败|同步/.test(text))return 'tasks';
 if(/成本|费用|报价|运价|价格|重泡|重抛|计费/.test(text))return 'cost';
 if(/客户|企业|进口商|批发商|分销商|同行/.test(text))return 'customers';
 return 'help';
}
export function assistantFilters(text){
 const filters={};
 for(const [name,aliases] of Object.entries(countryAliases))if(aliases.some(s=>new RegExp(s==='UK'?'\\bUK\\b':s,'i').test(text))){filters.region=name;break;}
 if(/无邮箱|没有邮箱|缺邮箱/.test(text))filters.contact='missing-email';
 else if(/邮箱|email/i.test(text))filters.contact='verified-email';
 for(const [pattern,stage] of [[/暂缓|暂不开发/,'暂缓开发'],[/未开发|待开发/,'待开发'],[/开发中|正在开发/,'开发中'],[/已合作|合作中/,'已合作'],[/有意向/,'有意向'],[/报价中/,'报价中']])if(pattern.test(text)){filters.stage=stage;break;}
 for(const source of ['ENF','WCA','WIFFA'])if(text.toUpperCase().includes(source)){filters.directory=source;break;}
 if(/同行/.test(text))filters.role='同行';
 return filters;
}
export function regionVariants(filters){return (countryAliases[filters.region]||[filters.region||'']).map(region=>({...filters,region}));}
export function customerSummary(results,variants){
 const unique=new Map();
 for(const data of results)for(const row of data.companies||[])if(!unique.has(row.id))unique.set(row.id,row);
 return {companies:[...unique.values()].slice(0,10),counts:results.map((r,i)=>({region:variants[i].region||'全部地区',total:Number(r.total||0)}))};
}
const signature='Benjamin | Eurasiago\nbenjamin@eurasiago.com\nhttps://eurasiago.com';
export function mailDraft({type='intro',language='en',company='',route='China–Europe',cargo=''}={}){
 const zh=language==='zh',name=String(company).trim().slice(0,150),line=String(route).trim().slice(0,200)||'China–Europe',goods=String(cargo).trim().slice(0,300);
 const greeting=zh?(name?name+'团队，您好：':'您好：'):(name?'Hello '+name+' team,':'Hello,');
 const variants=zh?{
  intro:{subject:line+'运输服务合作 | Eurasiago',body:'我是 Eurasiago 的 Benjamin。我们提供中欧铁路整箱、拼箱及海空运服务。\n\n如贵司有 '+line+' 方向的运输需求，欢迎提供起运地、目的地、货物品名、毛重、体积及预计发运时间，我们可以进一步核对方案和运价。'},
  followup:{subject:line+'运输需求跟进 | Eurasiago',body:'想了解贵司近期是否有 '+line+' 方向的运输计划。若有合适的需求，欢迎分享货物信息和计划时间，我们可以协助核对运输方案。'},
  inquiry:{subject:line+'运价咨询 | Eurasiago',body:'请协助提供 '+line+' 线路的运输报价。\n\n货物信息：'+(goods||'[请补充品名、件数、毛重、体积、箱型和预计发运日期]')+'\n\n请注明服务范围、计费单位、包含及另计费用、报价有效期和所需操作资料。'}
 }:{
  intro:{subject:line+' freight cooperation | Eurasiago',body:'I’m Benjamin from Eurasiago. We provide China–Europe rail FCL/LCL services as well as sea and air freight.\n\nIf you have upcoming shipments on the '+line+' route, please share the origin, destination, cargo description, gross weight, volume and expected shipping date. We can check a suitable routing and quotation for you.'},
  followup:{subject:line+' shipping plans | Eurasiago',body:'I would like to check whether you have any upcoming shipments on the '+line+' route. Please feel free to share the cargo details and planned shipping date so we can check a suitable transport option.'},
  inquiry:{subject:'Rate request: '+line+' | Eurasiago',body:'Please provide your quotation for the '+line+' route.\n\nCargo details: '+(goods||'[Add description, packages, gross weight, volume, container type and shipping date]')+'\n\nPlease specify the service scope, charging unit, included and additional charges, validity and required documents.'}
 };
 const selected=variants[type]||variants.intro;
 return {subject:selected.subject,body:greeting+'\n\n'+selected.body+'\n\n'+(zh?'顺颂商祺，':'Best regards,')+'\n'+signature};
}
