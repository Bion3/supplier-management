import {effectiveStatus} from './knowledge-model.js';
const norm=v=>String(v||'').trim().toLowerCase().replace(/\s+/g,'');
const aliases=[['西安','西安国际港','西安国际港站','新筑','新筑站','新筑车站'],['汉堡','hamburg'],['杜伊斯堡','duisburg'],['阿斯塔纳','努尔苏丹','astana']];
export function samePlace(a,b){a=norm(a);b=norm(b);return !!a&&!!b&&(a===b||aliases.some(g=>g.includes(a)&&g.includes(b)));}
export const phases=[
 {title:'接单与货物审核',action:'核对真实品名、材质用途、包装和件重尺；向承运方确认接货条件与仓位。',pattern:/询价|受理|下单|审核|安全|禁运|需求|委托书/},
 {title:'订舱与客户资料',action:'确认订舱信息，向客户收齐委托书、货物清单及报关资料；取得本票进仓通知和截单时间。',pattern:/订舱|文件|资料|单证|进仓单|报关草单/},
 {title:'入仓、装箱与发运',action:'确认提货或自送安排；按本次场站版本核对包装、贴唛、加固及照片，完成报关和进站。',pattern:/提货|车队|物流|仓|装箱|配载|加固|照片|贴唛|报关|进站|放箱|报车/},
 {title:'在途跟踪',action:'取得运单与发车信息，跟进运踪、口岸交接及异常，并向客户反馈。',pattern:/发车|在途|运踪|GPS|预报/},
 {title:'到站与交付',action:'向目的站代理确认到货、清关及提货资料；确认自提或派送安排，回收签收及还箱凭证。',pattern:/到站|交付|配送|还箱|签收|清关|自提/}
];
export function shipmentRequirements(input,{entries=[],routes=[],stations=[],sources=[]},today){
 for(const k of ['cargo','origin','destination','shipment_type'])if(!norm(input[k]))throw Error('请填写品名、发站、目的地及业务类型。');
 for(const k of ['pieces','weight','volume','length','width','height'])if(input[k]!==''&&input[k]!=null&&(!Number.isFinite(Number(input[k]))||Number(input[k])<=0))throw Error('件数、重量、体积和尺寸须大于0。');
 if(input.pieces&& !Number.isInteger(Number(input.pieces)))throw Error('件数须为整数。');
 if(input.date&&(!/^\d{4}-\d{2}-\d{2}$/.test(input.date)||Number.isNaN(Date.parse(input.date))||new Date(input.date).toISOString().slice(0,10)!==input.date))throw Error('计划发运日期无效。');
 const risks=['接货结论待承运方确认；知识匹配不代表已获接货批准。'];
 if(['木箱','托盘'].includes(input.packaging))risks.push('确认包装材质及目的地对木质包装的处理、标识和证明要求。');
 if(!input.packaging)risks.push('补充包装方式，确认是否使用实木包装。');
 if(!input.weight||!input.volume||!input.pieces)risks.push('补齐件数、总毛重和总体积后核对装载条件。');
 if(!input.length||!input.width||!input.height)risks.push('补充最大单件长、宽、高及单件重量；总体积不能代替单件尺寸。');
 if(!input.date)risks.push('未填计划发运日期，版本有效性暂按今日判断。');
 if(!input.supplier_id)risks.push('承运方未确定，承运方专属要求暂不采用。');
 if(!input.features||input.features==='不确定')risks.push('确认是否含电池、液体、粉末、磁性等特殊属性，并补充材质、用途及HS编码。');
 else if(input.features!=='无上述属性')risks.push(`已选“${input.features}”：请承运方按真实成分确认鉴定报告及接货条件。`);
 const date=input.date||today, relevant=[];
 for(const e of entries){
  if(e.kind==='报价'||e.kind==='航线档案')continue;
  if(e.shipment_type&&e.shipment_type!==input.shipment_type)continue;
  if(!e.shipment_type&&/FCL|整箱/.test(e.title)&&input.shipment_type==='拼箱LCL')continue;
  if(e.supplier_id&&e.supplier_id!==input.supplier_id)continue;
  const route=routes.find(r=>r.id===e.route_id),station=stations.find(s=>s.id===e.station_id),source=sources.find(s=>s.id===e.source_id);
  if(station&&!samePlace(input.origin,station.name)&&!samePlace(input.destination,station.name)&&![station.aliases,station.english_name].filter(Boolean).some(a=>a.split(/[;；,，]/).some(x=>samePlace(input.origin,x)||samePlace(input.destination,x))))continue;
  const general=route?.code==='GENERAL';
  const xi=route?.code==='XI-EXPORT'&&samePlace(input.origin,'西安')&&input.shipment_type!=='进口';
  const exact=route&&samePlace(route.origin,input.origin)&&samePlace(route.destination,input.destination);
  if(!general&&!xi&&!exact)continue;
  const cargoCase=/历史货物审核/.test(e.title);
  if(cargoCase){const name=e.content?.match(/品名原文：([^\n]+)/)?.[1];if(!name||norm(name)!==norm(input.cargo))continue;}
  let status=effectiveStatus(e,date);
  const sourceStatus=source?effectiveStatus({...source,status:'已核实'},date):'已核实';
  if(sourceStatus!=='已核实')status=sourceStatus;
  const superseded=entries.some(n=>n.supersedes_id===e.id&&effectiveStatus(n,date)==='已核实'&&n.effective_from&&n.effective_from<=date&&n.route_id===e.route_id&&n.station_id===e.station_id&&n.shipment_type===e.shipment_type&&n.supplier_id===e.supplier_id);
  const sourceReplaced=source&&sources.some(n=>n.supersedes_id===source.id&&n.effective_from&&n.effective_from<=date&&(!n.valid_until||n.valid_until>=date));
  if(superseded||sourceReplaced)status='已被替代';
  const approved=status==='已核实'&&!!e.effective_from&&!!e.shipment_type&&!!exact&&!cargoCase&&(!source||!!source.effective_from);
  relevant.push({...e,resultStatus:approved?'已核实':status==='已核实'?'适用范围 / 日期待确认':status,approved,sourceRecord:source,matchReason:exact?'起运地与目的地匹配':xi?'西安出口参考':'业务通用流程参考',cargoCase});
 }
 const groups=phases.map(p=>({...p,items:relevant.filter(e=>!e.cargoCase&&p.pattern.test(e.title+' '+(e.content?.match(/^阶段：([^\n]+)/)?.[1]||'')))}));
 const references=relevant.filter(e=>!groups.some(g=>g.items.some(x=>x.id===e.id)));
 if(!relevant.some(e=>e.approved))risks.push('未匹配到已核实且在有效期内的完整线路要求，以下步骤为操作准备清单，具体条件需确认。');
 risks.push('向发站确认本班次截单、入仓时间、限重限尺、加固及照片版本。');
 if(!relevant.some(e=>e.approved&&stations.some(s=>s.id===e.station_id&&samePlace(s.name,input.destination))))risks.push(`补充${input.destination}实际终端、清关及提货要求；城市名称不能替代到站终端。`);
 return {input,date,groups,references,risks,relevant,density:input.weight&&input.volume?Number(input.weight)/Number(input.volume):null,approved:relevant.filter(e=>e.approved).length};
}
