export const referenceTemplates=[
 {id:'reference-outreach-en',name:'参考 · English · 中欧铁路开发',purpose:'开发客户',language:'en',subject:'China–Europe rail freight for {{company}}',body:'Hello {{name}},\n\nWe are Eurasiago. We arrange full-container and less-than-container rail freight between China and Europe, with collection and delivery options.\n\nIf {{company}} has an upcoming shipment, please share the origin, destination, cargo type, weight and volume. We can check the available route and quotation.\n\nWould this be relevant to your team?'},
 {id:'reference-outreach-zh',name:'参考 · 中文 · 中欧铁路开发',purpose:'开发客户',language:'zh',subject:'{{company}} 中欧铁路运输服务对接',body:'您好 {{name}}，\n\n我们是 Eurasiago，提供中国与欧洲之间的铁路整柜、拼箱及配套提送货服务。\n\n如贵司近期有运输计划，欢迎提供起运地、目的地、货物品名、重量和体积，我们可据此查询线路及报价。\n\n方便了解贵司负责物流运输的对接人吗？'},
 {id:'reference-followup-en',name:'参考 · English · 客户跟进',purpose:'维护客户',language:'en',subject:'Shipment planning for {{company}}',body:'Hello {{name}},\n\nI am following up on your shipment planning. Do you have any new cargo requirements for China–Europe transport?\n\nPlease share the cargo readiness date and shipment details so we can check the options.'},
 {id:'reference-followup-zh',name:'参考 · 中文 · 客户跟进',purpose:'维护客户',language:'zh',subject:'{{company}} 近期运输计划跟进',body:'您好 {{name}}，\n\n想跟进一下贵司近期的中欧运输计划。如有新的出货需求，欢迎提供预计货好时间及货物信息，我们为您查询合适的方案。'}
];
export function templateLanguage(t){return t.language||(/^\[EN\]/i.test(t.name)?'en':/^\[中文\]/.test(t.name)?'zh':/[\u3400-\u9fff]/.test(t.subject||'')?'zh':'en');}
export function templatePool(saved,purpose,language=''){return [...saved,...referenceTemplates].filter(t=>t.purpose===purpose&&(!language||templateLanguage(t)===language));}
export function assignTemplates(recipients,pool,random=Math.random){
 if(!pool.length)throw Error('请至少勾选一个随机发送模板。');
 return recipients.map(contact=>({contact,template:pool[Math.min(pool.length-1,Math.floor(Math.max(0,random())*pool.length))]}));
}
