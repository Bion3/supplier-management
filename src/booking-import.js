// Explicit template recognition prevents unrelated spreadsheets becoming orders.
const text=v=>String(v??'').replace(/\t/g,' ').trim();
const number=v=>text(v).match(/[\d]+(?:\.\d+)?/)?.[0]||'';
const date=v=>{const m=text(v).match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);return m?`${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`:''};
function party(value){const lines=text(value).split(/\n/).map(text).filter(Boolean);return {company:lines[0]||'',address:lines.slice(1).filter(x=>! /^(TEL|PHONE|FAX|EMAIL|TAX ID)\s*:/i.test(x)).join('\n'),contact:'',phone:text(value).match(/(?:TEL|PHONE)\s*:\s*([^\n]+)/i)?.[1]?.trim()||'',email:text(value).match(/EMAIL\s*:\s*([^\s]+)/i)?.[1]||'',taxId:text(value).match(/TAX ID\s*:\s*([^\n]+)/i)?.[1]?.trim()||''};}
const place=v=>({XIAN:'西安',HAMBURG:'汉堡',DUISBURG:'杜伊斯堡'}[text(v).toUpperCase()]||text(v));
const cargo=(fields)=>({id:crypto.randomUUID(),cn:'',en:'',hs:'',marks:'',pack:'',quantity:'',length:'',width:'',height:'',weight:'',...fields});
export function parseBookingWorkbook(workbook){
 const matches=[];
 for(const name of workbook.SheetNames){const s=workbook.Sheets[name];const get=a=>text(s[a]?.v);
 if(get('A1').includes('货物托运委托书')&&get('A3').includes('Shipper')&&get('A25').includes('Marks')){
 const raw=get('B26'),cn=raw.match(/品名[：:]\s*([^\n]+)/)?.[1]||'',en=raw.split('\n').map(text).find(l=>l&&!/BOX|品名|^\d/i.test(l))||'';
 const lines=[...raw.matchAll(/BOX\s*\d+\s*:\s*([\d.]+)\s*[*×x]\s*([\d.]+)\s*[*×x]\s*([\d.]+)\s*CM\s*\/\s*([\d.]+)\s*KGS?/gi)].map(m=>cargo({cn,en,marks:get('A26'),pack:'BOX',quantity:'1',length:m[1],width:m[2],height:m[3],weight:m[4]}));
 if(!lines.length)lines.push(cargo({cn,en,marks:get('A26'),pack:'BOX',quantity:raw.match(/(\d+)\s*BOX/i)?.[1]||''}));
 matches.push({template:'JCT 托书',booking:{customer:get('D8'),reference:get('D7'),billing:get('A31').replace(/^发票抬头[：:]\s*/,''),customerContact:get('G13'),customerEmail:get('G15'),bookingDate:date(get('G16')),shipper:party(get('A5')),consignee:party(get('A9')),notify:party(get('A14')),notifySame:get('A9')===get('A14'),origin:place(get('C22')),destination:place(get('A24')),readyDate:date(get('A20')),departureDate:date(get('C20')),mode:'铁路',loadType:'拼箱 LCL',billType:/original/i.test(get('G20'))?'正本 Original':get('G20'),payment:get('G21')==='PP'?'预付 PP':get('G21')==='CC'?'到付 CC':get('G21'),declaredWeight:number(get('F26')),declaredVolume:number(get('J26')),cargo:lines,remarks:get('A29')+'\n发票地址：'+get('A32').replace(/^地址[：:]\s*/,'')},warnings:['报价原文保留在备注，应收费用请另行核对录入。']});
 }else if(get('A2').includes('订舱委托书')&&get('A10').includes('发货人')&&get('A18').includes('包装类型')){
 const consignee=party(get('I11'));consignee.contact=get('J12');consignee.email=get('J13')||consignee.email;
 matches.push({template:'铁大大托书',booking:{customer:party(get('A6')).company,reference:get('A3').replace(/^FORTO SID\s*:\s*/i,''),shipper:party(get('A11')),consignee,notify:party(get('E11')),notifySame:/SAME AS CONSIGNEE/i.test(get('E11')),origin:place(get('F15')),destination:place(get('H15')),mode:'铁路',loadType:/LCL|拼箱/i.test(get('B15'))?'拼箱 LCL':'整柜 FCL',pickupMethod:/工厂提货/.test(get('B16'))?'工厂提货':get('B16')||'待确认',declaredWeight:number(get('G18')),declaredVolume:number(get('I18')),cargo:[cargo({cn:get('B19'),en:get('F19'),hs:get('K18'),pack:get('B18'),quantity:number(get('E18')),marks:get('J19')})],trackingTo:get('B43'),trackingCc:['B44','B45','B46','B47'].map(get).filter(Boolean).join('; '),remarks:'托书收货人原文：\n'+get('I11')},warnings:['未填写的单件尺寸、重量和班列日期留空，请核对补充。']});
 }
 }
 if(matches.length!==1)throw Error(matches.length?'文件包含多份托书，请拆分后分别导入。':'暂未识别此托书格式。目前支持 JCT 和铁大大托书，请使用手工新建或提供模板适配。');
 const result=matches[0];result.warnings.push('收发通、件重尺及日期请复核。文件只做字段识别，原件暂不作为附件上传。');return result;
}
