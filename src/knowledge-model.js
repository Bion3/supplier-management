export const kinds=['航线档案','操作SOP','报价','单证要求','异常案例','其他'];
export const statuses=['待确认','已核实','已过期','存在冲突'];
export const MAX_FILE_SIZE=20*1024*1024;
export function validateEntry(data){
 const result={};
 for(const key of ['title','kind','content','scope','source','status','route_id'])result[key]=String(data[key]||'').trim();
 if(!result.title||result.title.length>240)throw Error('请填写标题（最多240字）。');
 if(!result.route_id)throw Error('请选择航线。');
 if(!kinds.includes(result.kind)||!statuses.includes(result.status))throw Error('请选择有效类型和状态。');
 if(result.content.length>50000)throw Error('内容最多50000字。');
 if(result.status==='已核实'&&(!result.source||!result.content))throw Error('已核实条目必须填写内容和核实依据。');
 result.supplier_id=data.supplier_id||null;
 for(const key of ['station_id','source_id','supersedes_id'])result[key]=data[key]||null;
 result.shipment_type=String(data.shipment_type||'');
 if(!['','整箱FCL','拼箱LCL','进口'].includes(result.shipment_type))throw Error('业务类型无效。');
 result.revision_note=String(data.revision_note||'').trim();
 for(const key of ['source_date','effective_from','valid_until']){
  const value=data[key]||null;
  if(value&&(!/^\d{4}-\d{2}-\d{2}$/.test(value)||Number.isNaN(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value))throw Error('日期格式无效。');
  result[key]=value;
 }
 if(result.effective_from&&result.valid_until&&result.effective_from>result.valid_until)throw Error("生效日期不能晚于失效日期。");
 return result;
}
export function effectiveStatus(entry,today){return entry.valid_until&&entry.valid_until<today?'已过期':entry.effective_from&&entry.effective_from>today?'尚未生效':entry.status;}
export function filterEntries(entries,{query='',route='',status='',today=''}){
 const q=query.trim().toLocaleLowerCase();
 return entries.filter(e=>(!route||e.route_id===route)&&(!status||effectiveStatus(e,today)===status)&&(!q||[e.title,e.content,e.scope,e.source,e.supplier_name,e.route_name,e.station_name,e.source_name,e.shipment_type].join(' ').toLocaleLowerCase().includes(q)));
}
export function filePath(entryId,file){
 if(!file.size||file.size>MAX_FILE_SIZE)throw Error('文件不能为空，且单个文件不能超过20MB。');
 const ext=file.name.split('.').pop().toLowerCase();
 if(!['pdf','doc','docx','xls','xlsx','csv','txt','md','png','jpg','jpeg','webp','eml'].includes(ext))throw Error('请上传PDF、Office文档、文本、邮件或图片。');
 return `${entryId}/${crypto.randomUUID()}.${ext}`;
}
