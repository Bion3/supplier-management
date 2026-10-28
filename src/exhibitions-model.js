import {normalizeCountry,countryInfo} from './supplier-geography.js';
export const companyTypes=['待分类','进口商','批发商','分销商','制造商','货代','海外代理','服务商','其他'];
export const fairFields={name:'展会名称',edition:'届次',country:'国家',city:'城市',venue:'场馆',industry:'行业',organizer:'主办方',starts_on:'开始日期',ends_on:'结束日期',website:'官网',directory_url:'展商目录链接',source_url:'来源链接',status:'核实状态',directory_status:'目录状态',notes:'备注'};
export const exhibitorFields={company_name:'公司名称',country:'国家',city:'城市',industry:'行业',company_type:'企业类型',products:'产品或服务',booth:'展位',catalog_edition:'目录届次',website:'公司官网',contact_name:'联系人',email:'邮箱',phone:'电话',source_url:'来源链接',status:'核实状态',tags:'标签',notes:'备注'};
export function safeURL(value){const text=String(value||'').trim();if(!text)return '';try{const u=new URL(text);if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw Error();return u.href;}catch{throw Error('链接须使用完整的 http:// 或 https:// 地址。');}}
const day=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
function date(value){if(!value)return null;const text=String(value).trim();if(!/^\d{4}-\d{2}-\d{2}$/.test(text)||!Number.isFinite(Date.parse(text))||new Date(text).toISOString().slice(0,10)!==text)throw Error('日期须为有效的 YYYY-MM-DD。');return text;}
export function validateEntry(data,kind,exhibitionId){
 const fields=kind==='fairs'?fairFields:exhibitorFields,r={};for(const key of Object.keys(fields)){r[key]=String(data[key]??'').trim();if(r[key].length>(['notes','products'].includes(key)?5000:1000))throw Error('字段过长：'+fields[key]);}
 const name=kind==='fairs'?'name':'company_name';if(!r[name]||r[name].length>240)throw Error('请填写名称（不超过240字）。');
 for(const key of ['website','directory_url','source_url'])if(key in r)r[key]=safeURL(r[key]);if(!r.source_url)throw Error('请填写来源链接，以便后续核对。');
 r.country=normalizeCountry(r.country);r.updated_at=new Date().toISOString();
 if(kind==='fairs'){
  r.starts_on=date(r.starts_on);r.ends_on=date(r.ends_on);if(r.starts_on&&r.ends_on&&r.ends_on<r.starts_on)throw Error('结束日期不能早于开始日期。');
  r.status=r.status||'待核实';r.directory_status=r.directory_status||'未收集';if(!['待核实','已核实','延期','取消'].includes(r.status)||!['未收集','收集中','待核实','已整理'].includes(r.directory_status))throw Error('展会状态无效。');r.region=countryInfo(r.country)?.[2]||'其他';
 }else{
  if(!/^[0-9a-f-]{36}$/i.test(exhibitionId||''))throw Error('请先选择所属展会。');r.exhibition_id=exhibitionId;r.company_type=r.company_type||'待分类';r.status=r.status||'待核实';if(!companyTypes.includes(r.company_type)||!['待核实','已核实','失效'].includes(r.status))throw Error('展商分类或状态无效。');
  r.catalog_edition=r.catalog_edition||'待核实';if(r.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email))throw Error('邮箱格式不正确，请每条记录填写一个邮箱。');r.tags=[...new Set(r.tags.split(/[,，;；]/).map(x=>x.trim()).filter(Boolean))];
 }
 r.verified_on=r.status==='已核实'?day():null;return r;
}
export function identity(row,kind){return (kind==='fairs'?[row.name,row.edition,normalizeCountry(row.country),row.city]:[row.exhibition_id,row.company_name,normalizeCountry(row.country)]).map(x=>String(x||'').trim().toLowerCase()).join('\u001f');}
export function filterEntries(rows,{query='',country='',industry='',status='',type='',exhibition='',tag='',period='',year='',today=day()}={}){const q=query.toLowerCase().trim();return rows.filter(r=>(!year||editionYear(r)===year)&&(!country||r.country===country)&&(!industry||r.industry===industry)&&(!status||r.status===status)&&(!type||r.company_type===type)&&(!exhibition||r.exhibition_id===exhibition)&&(!tag||(r.tags||[]).includes(tag))&&(!period||(period==='upcoming'?r.starts_on>=today:period==='past'?r.ends_on&&r.ends_on<today:r.starts_on&&r.ends_on&&r.starts_on<=today&&r.ends_on>=today))&&Object.values(r).flat().join(' ').toLowerCase().includes(q));}
export function parseCSV(text){
 const rows=[];let row=[],cell='',quoted=false,closed=false;const s=String(text).replace(/^\uFEFF/,'');if(s.length>5e6)throw Error('文件过大，请分批导入（最多5MB）。');
 for(let i=0;i<s.length;i++){const c=s[i];if(c==='"'){if(quoted&&s[i+1]==='"'){cell+='"';i++;}else if(quoted){quoted=false;closed=true;}else if(!cell&&!closed){quoted=true;}else throw Error('CSV 引号格式错误。');}else if(c===','&&!quoted){row.push(cell);cell='';closed=false;}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&s[i+1]==='\n')i++;row.push(cell);if(row.some(x=>x.trim()))rows.push(row);row=[];cell='';closed=false;}else{if(closed)throw Error('CSV 引号后的内容无效。');cell+=c;}}
 if(quoted)throw Error('CSV 引号未闭合。');row.push(cell);if(row.some(x=>x.trim()))rows.push(row);if(rows.length>2001)throw Error('每次最多导入2000条，请拆分文件。');return rows;
}
export function importPlan(text,kind,existing,exhibitionId){
 const matrix=parseCSV(text),fields=kind==='fairs'?fairFields:exhibitorFields;if(matrix.length<2)throw Error('文件至少需要表头和一条数据。');const [headers,...lines]=matrix;const keys=headers.map(h=>Object.keys(fields).find(k=>k===h.trim()||fields[k]===h.trim()));
 if(!keys.includes(kind==='fairs'?'name':'company_name')||!keys.includes('source_url'))throw Error('缺少名称或来源链接表头，请下载模板。');
 const known=new Set(existing.map(r=>identity(r,kind))),accepted=[],errors=[];let duplicates=0;
 lines.forEach((line,i)=>{try{if(line.length!==headers.length)throw Error('列数与表头不一致');const data={};keys.forEach((k,j)=>{if(k)data[k]=line[j];});data.status='待核实';if(kind==='fairs')data.directory_status='未收集';const r=validateEntry(data,kind,exhibitionId),key=identity(r,kind);if(known.has(key)){duplicates++;return;}known.add(key);accepted.push(r);}catch(e){errors.push('第'+(i+2)+'行：'+e.message);}});return {accepted,errors,duplicates,total:lines.length};
}
export function entriesCSV(rows,kind){const fields=kind==='fairs'?fairFields:exhibitorFields,cell=v=>'"'+String(Array.isArray(v)?v.join(';'):v??'').replace(/^[\s]*[=+@-]/,'\t$&').replaceAll('"','""')+'"';return '\uFEFF'+[Object.values(fields),...rows.map(r=>Object.keys(fields).map(k=>r[k]))].map(r=>r.map(cell).join(',')).join('\r\n');}

export function editionYear(row){return String(row.starts_on||row.edition||row.catalog_edition||'').match(/20\d{2}/)?.[0]||'';}
export function approveAutoChanges(row,keys){const allowed=new Set(['starts_on','ends_on','venue','organizer','website','directory_url','status']),pending={...(row.pending_updates||{})},picked={};for(const key of new Set(keys)){if(allowed.has(key)&&Object.hasOwn(pending,key)){picked[key]=pending[key].proposed;delete pending[key];}}if(!Object.keys(picked).length)throw Error('请选择需要采用的更新。');const validated=validateEntry({...row,...picked},'fairs'),patch={};for(const key of Object.keys(picked))patch[key]=validated[key];patch.pending_updates=pending;patch.last_crawl_status=Object.keys(pending).length?'待核实':'成功';patch.updated_at=new Date().toISOString();if(validated.status==='已核实')patch.verified_on=day();else if(Object.hasOwn(picked,'status'))patch.verified_on=null;return patch;}
