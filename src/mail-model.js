export function validEmail(value){return /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/.test(String(value))&&String(value).length<=254;}
export function eligibleContacts(contacts){const seen=new Set(),blocked=new Set(contacts.filter(c=>c.channel==='邮箱'&&c.email_allowed===false).map(c=>c.value.trim().toLowerCase()));return contacts.filter(c=>{const e=c.value?.trim().toLowerCase();if(c.channel!=='邮箱'||c.status!=='有效'||blocked.has(e)||!validEmail(e)||seen.has(e))return false;seen.add(e);return true;});}
export function personalise(text,company,contact){return String(text).replace(/\{\{(company|name|routes)\}\}/g,(_,key)=>({company:company?.company_name||'',name:contact?.name||'',routes:company?.current_routes||'您的运输线路'}[key]));}
export function validateMail(subject,body){subject=String(subject||'').trim();body=String(body||'').trim();if(!subject||subject.length>200||/[\r\n]/.test(subject))throw Error('主题需为1至200字的单行文本。');if(!body||body.length>20000)throw Error('正文需为1至20000字。');if(/\{\{[^}]+\}\}/.test(subject+body))throw Error('邮件仍有未替换的模板变量。');return {subject,body};}
export function regionInfo(company){
 if(company?.region?.trim())return {value:company.region.trim(),inferred:false};
 const address=(company?.addresses||[]).join(' ');
 const province=address.match(/北京|上海|天津|重庆|河北|山西|辽宁|吉林|黑龙江|江苏|浙江|安徽|福建|江西|山东|河南|湖北|湖南|广东|海南|四川|贵州|云南|陕西|甘肃|青海|内蒙古|广西|西藏|宁夏|新疆|香港|澳门|台湾/);
 if(province)return {value:province[0],inferred:true};
 const cities={深圳:'广东',广州:'广东',佛山:'广东',东莞:'广东',惠州:'广东',肇庆:'广东',苏州:'江苏',无锡:'江苏',常州:'江苏',南京:'江苏',宁波:'浙江',杭州:'浙江',绍兴:'浙江',嘉兴:'浙江',台州:'浙江',金华:'浙江',温州:'浙江',厦门:'福建',福州:'福建',泉州:'福建',武汉:'湖北',襄阳:'湖北',长沙:'湖南',株洲:'湖南',成都:'四川',西安:'陕西',青岛:'山东',济南:'山东',郑州:'河南',石家庄:'河北'};
 for(const [city,value] of Object.entries(cities))if(address.includes(city))return {value,inferred:true};
 return {value:'未填写',inferred:false};
}
export function filterRecipients(contacts,companies,filters={}){
 const map=new Map(companies.map(c=>[c.id,c])),q=(filters.query||'').trim().toLowerCase();
 const eligible=new Set(eligibleContacts(contacts).map(c=>c.value.trim().toLowerCase()));
 return contacts.filter(c=>{const co=map.get(c.company_id),groups=c.mail_groups||[];
 return c.channel==='邮箱'&&(!q||[c.value,c.name,co?.company_name,co?.current_routes,JSON.stringify(co?.historical_routes),groups.join(' ')].join(' ').toLowerCase().includes(q))
 &&(!filters.status||co?.status===filters.status)&&(!filters.role||(co?.role||'待核实')===filters.role)
 &&(!filters.region||regionInfo(co).value===filters.region)&&(!filters.verification||c.status===filters.verification)
 &&(!filters.allowed||(filters.allowed==='yes'?c.email_allowed!==false:c.email_allowed===false))
 &&(!filters.group||(filters.group==='__ungrouped'?!groups.length:groups.includes(filters.group)))
 &&(!filters.sendable||(c.status==='有效'&&eligible.has(c.value.trim().toLowerCase())))
 &&(!filters.selectedOnly||filters.selected?.has(c.id));});
}
export function groupNames(value){const groups=[...new Set(String(value||'').split(/[,，]/).map(x=>x.trim()).filter(Boolean))];if(!groups.length||groups.some(x=>x.length>50))throw Error('请填写分组名称，每个名称最多50字，可用逗号分隔。');return groups;}
export function batchRecipients(selected,contacts,limit=10){
 const chosen=contacts.filter(c=>selected.has(c.id)),blocked=contacts.filter(c=>c.email_allowed===false);
 const valid=eligibleContacts([...chosen,...blocked]).filter(c=>selected.has(c.id));
 const rejected=chosen.filter(c=>c.status!=='有效'||c.email_allowed===false||!validEmail(c.value)||blocked.some(b=>b.value.trim().toLowerCase()===c.value.trim().toLowerCase()));
 if(rejected.length)throw Error(`已选中${rejected.length}条未核实、无效或停止联系的邮箱，请先批量标记有效或取消选择。`);
 return {rows:valid.slice(0,limit),total:valid.length,remaining:Math.max(0,valid.length-limit)};
}
export function selectRows(selected,rows,checked=true){const result=new Set(selected);for(const row of rows)if(checked)result.add(row.id);else result.delete(row.id);return result;}
export function selectionState(selected,rows){const count=rows.filter(row=>selected.has(row.id)).length;return {checked:rows.length>0&&count===rows.length,indeterminate:count>0&&count<rows.length,disabled:rows.length===0};}
export function emailContactScope(chosen,contacts){const emails=new Set(chosen.filter(c=>c.channel==='邮箱').map(c=>c.value.trim().toLowerCase()));return contacts.filter(c=>c.channel==='邮箱'&&emails.has(c.value.trim().toLowerCase())).map(c=>c.id);}

