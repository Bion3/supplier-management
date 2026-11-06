import {effectiveStatus} from './knowledge-model.js';
const norm=v=>String(v||'').trim().toLowerCase().replace(/\s+/g,'');
const aliases=[['西安','西安国际港','西安国际港站','新筑','新筑站','新筑车站'],['汉堡','hamburg'],['杜伊斯堡','duisburg'],['阿斯塔纳','努尔苏丹','astana']];
export function samePlace(a,b){a=norm(a);b=norm(b);return !!a&&!!b&&(a===b||aliases.some(g=>g.includes(a)&&g.includes(b)));}
const fuzzy=(a,b)=>{a=norm(a);b=norm(b);return !!a&&!!b&&(a===b||(Math.min(a.length,b.length)>=2&&(a.includes(b)||b.includes(a))));};
function productLine(e,cargo){
 const history=e.content?.match(/品名原文：([^\n]+)/)?.[1];
 if(history)return fuzzy(history,cargo)?history:'';
 if(!/物品|品名清单|货物清单/.test(e.title))return '';
 return (e.content||'').split('\n').find(line=>/^\s*\d+[.、．]/.test(line)&&line.replace(/^\s*\d+[.、．]\s*/,'').replace(/[（(].*$/,'').split(/[、，,；;]/).some(name=>fuzzy(name,cargo)))||'';
}
export const phases=[
 {title:'接单与货物审核',action:'核对真实品名、材质用途、包装和件重尺；向承运方确认接货条件与仓位。',pattern:/询价|受理|下单|审核|安全|禁运|需求|委托书/},
 {title:'订舱与客户资料',action:'确认订舱信息，向客户收齐委托书、货物清单及报关资料；取得本票进仓通知和截单时间。',pattern:/订舱|文件|资料|单证|进仓单|报关草单/},
 {title:'入仓、装箱与发运',action:'确认提货或自送安排；按本次场站版本核对包装、贴唛、加固及照片，完成报关和进站。',pattern:/提货|车队|物流|仓|装箱|配载|加固|照片|贴唛|报关|进站|放箱|报车/},
 {title:'在途跟踪',action:'取得运单与发车信息，跟进运踪、口岸交接及异常，并向客户反馈。',pattern:/发车|在途|运踪|GPS|预报/},
 {title:'到站与交付',action:'向目的站代理确认到货、清关及提货资料；确认自提或派送安排，回收签收及还箱凭证。',pattern:/到站|交付|配送|还箱|签收|清关|自提/}
];
export function shipmentRequirements(input,{entries=[],routes=[],stations=[],sources=[]},today){
 const hs=String(input.hs||'').trim().replace(/[.\s]/g,'');
 if(hs&&!/^\d{1,10}$/.test(hs))throw Error('HS 编码请输入最多 10 位数字，可只填前几位。');
 const mode=norm(input.mode),type=input.shipment_type||(/拼箱|lcl/.test(mode)?'拼箱LCL':/整箱|fcl/.test(mode)?'整箱FCL':'');
 const broad=!!(hs||input.route||mode||input.supplier_id);
 for(const k of ['pieces','weight','volume','length','width','height'])if(input[k]!==''&&input[k]!=null&&(!Number.isFinite(Number(input[k]))||Number(input[k])<=0))throw Error('件数、重量、体积和尺寸须大于0。');
 if(input.pieces&& !Number.isInteger(Number(input.pieces)))throw Error('件数须为整数。');
 if(input.date&&(!/^\d{4}-\d{2}-\d{2}$/.test(input.date)||Number.isNaN(Date.parse(input.date))||new Date(input.date).toISOString().slice(0,10)!==input.date))throw Error('计划发运日期无效。');
 const risks=['接货结论待承运方确认；知识匹配不代表已获接货批准。'];
 const date=input.date||today, relevant=[],otherStations=[];
 for(const e of entries){
  if(e.kind==='报价'||e.kind==='航线档案')continue;
  if(type&&e.shipment_type&&e.shipment_type!==type)continue;
  if(!e.shipment_type&&/FCL|整箱/.test(e.title)&&type==='拼箱LCL')continue;
  if(input.supplier_id?e.supplier_id!==input.supplier_id:!!e.supplier_id&&!broad)continue;
  const route=routes.find(r=>r.id===e.route_id),station=stations.find(s=>s.id===e.station_id),source=sources.find(s=>s.id===e.source_id);
  if(input.route&&![route?.name,route?.code,[route?.origin,route?.destination].filter(Boolean).join('至')].some(n=>fuzzy(n,input.route)))continue;
  const descriptor=[route?.category,route?.name,e.title,e.scope,e.source,e.shipment_type].join(' ');
  const transport=mode.replace(/拼箱|整箱|lcl|fcl/g,'');
  if(transport&&!norm(descriptor).includes(transport)&&!(transport==='铁路'&&/班列|TDD总体操作流程/.test(descriptor)))continue;
  const hsCodes=[...(String(e.content||'')+' '+(e.title||'')+' '+(e.scope||'')).matchAll(/(?:HS(?:\s*CODE|编码|栏原值|号|码)?|税号|海关编码)\s*[:：]?\s*([0-9][0-9.]{1,14})/gi)].map(m=>m[1].replace(/\./g,''));
  if(hs&&!hsCodes.some(c=>c.startsWith(hs)))continue;
  if(!input.cargo&&!input.origin&&!input.destination&&!broad&&!type&&(route?.code!=='GENERAL'||e.station_id||e.shipment_type||e.supplier_id))continue;
  const line=productLine(e,input.cargo);
  const names=station?[station.name,station.english_name,...String(station.aliases||'').split(/[;；,，]/)].filter(Boolean):[];
  const stationExact=names.some(n=>samePlace(input.origin,n)||samePlace(input.destination,n));
  const originMatch=names.some(n=>samePlace(input.origin,n)||fuzzy(input.origin,n));
  const stationNear=names.some(n=>fuzzy(input.origin,n)||fuzzy(input.destination,n));
  if(station&&(input.origin||input.destination||!broad)&&(!stationExact&&!stationNear||line&&!originMatch)){
   if(line)otherStations.push({...e,hit:line,matchReason:station.name+' · 仅供对照，不适用于本票',resultStatus:effectiveStatus(e,date)});
   continue;
  }
  if(input.cargo&&/不需要鉴定报告物品/.test(e.title)&&!line)continue;
  const general=route?.code==='GENERAL';
  const xi=route?.code==='XI-EXPORT'&&samePlace(input.origin,'西安')&&input.shipment_type!=='进口';
  const exact=route&&samePlace(route.origin,input.origin)&&samePlace(route.destination,input.destination);
  const partial=route&&(input.origin||input.destination)&&(!input.origin||samePlace(input.origin,route.origin)||fuzzy(input.origin,route.origin))&&(!input.destination||samePlace(input.destination,route.destination)||fuzzy(input.destination,route.destination));
  if(!general&&!xi&&!exact&&!partial&&!(broad&&!input.origin&&!input.destination))continue;
  const cargoCase=/历史货物审核/.test(e.title);
  if(cargoCase&&input.cargo){const name=e.content?.match(/品名原文：([^\n]+)/)?.[1];if(!name||!fuzzy(name,input.cargo))continue;}
  let status=effectiveStatus(e,date);
  const sourceStatus=source?effectiveStatus({...source,status:'已核实'},date):'已核实';
  if(sourceStatus!=='已核实')status=sourceStatus;
  const superseded=entries.some(n=>n.supersedes_id===e.id&&effectiveStatus(n,date)==='已核实'&&n.effective_from&&n.effective_from<=date&&n.route_id===e.route_id&&n.station_id===e.station_id&&n.shipment_type===e.shipment_type&&n.supplier_id===e.supplier_id);
  const sourceReplaced=source&&sources.some(n=>n.supersedes_id===source.id&&n.effective_from&&n.effective_from<=date&&(!n.valid_until||n.valid_until>=date));
  if(superseded||sourceReplaced)status='已被替代';
  const approved=!!type&&status==='已核实'&&!!e.effective_from&&!!e.shipment_type&&!!exact&&(!station||stationExact)&&!line&&!cargoCase&&(!source||!!source.effective_from);
  relevant.push({...e,hit:line,resultStatus:approved?'已核实':status==='已核实'?'适用范围 / 日期待确认':status,approved,sourceRecord:source,matchReason:!exact&&broad&&!line?'查询条件匹配，仅供参考':line?(station?.name||'品名')+' · 品名相关':!exact&&partial?'线路部分匹配，仅供参考':exact?'起运地与目的地匹配':xi?'西安出口参考':'业务通用流程参考',cargoCase});
 }
 const groups=phases.map(p=>({...p,items:relevant.filter(e=>!e.cargoCase&&p.pattern.test(e.title+' '+(e.content?.match(/^阶段：([^\n]+)/)?.[1]||'')))}));
 const references=relevant.filter(e=>!groups.some(g=>g.items.some(x=>x.id===e.id)));
 if(!relevant.some(e=>e.approved))risks.push('未匹配到已核实且在有效期内的完整线路要求，以下步骤为操作准备清单，具体条件需确认。');
 risks.push('向发站确认本班次截单、入仓时间、限重限尺、加固及照片版本。');
 if(!relevant.some(e=>e.approved&&stations.some(s=>s.id===e.station_id&&samePlace(s.name,input.destination))))risks.push(`补充${input.destination||"目的站"}实际终端、清关及提货要求；城市名称不能替代到站终端。`);
 const matches=relevant.filter(e=>e.hit);
 const todo=[...groups.map(g=>g.action)];
 todo[0]=(input.cargo?'向客户核对“'+input.cargo+'”的具体商品、成分、用途及包装。':'确认本票具体品名、成分、用途及包装。')+(matches.length?'核对下方品名命中记录，并请承运方确认适用条件。':'向'+(input.origin||'发站')+'承运方核实是否需要鉴定报告。');
 if(!input.destination)todo[1]='先向客户确认目的城市、具体到站及交付方式，再核对订舱资料和截单时间。';
 if(!input.pieces||!input.weight||!input.volume)todo[2]='补齐件数、毛重和体积，确认进仓、贴唛及装载要求。';
 return {input,date,groups,todo,matches,otherStations,references,risks,relevant,density:input.weight&&input.volume?Number(input.weight)/Number(input.volume):null,approved:relevant.filter(e=>e.approved).length};
}
