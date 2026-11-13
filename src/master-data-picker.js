import {cloudRequest} from './cloud.js';
import {locationChoices,resolveLocation} from './master-data-model.js';
let rows=[],loadedAt=0,pending=null;
async function load(){
 if(Date.now()-loadedAt<60000)return rows;
 if(!pending)pending=(async()=>{const result=[];for(let offset=0;;offset+=500){const batch=await cloudRequest(`freight_master_data?select=id,kind,code,name_zh,name_en,country,city,roles,aliases,unit,enabled&enabled=eq.true&order=name_zh,id&limit=500&offset=${offset}`);result.push(...batch);if(batch.length<500)break;}rows=result;loadedAt=Date.now();return rows;})().finally(()=>{pending=null;});
 return pending;
}
window.addEventListener('storage',event=>{if(event.key==='eurasiago-master-updated')loadedAt=0;});
export function installMasterPickers(){
 const fields={origin:'origin',destination:'destination',feeName:'charge'};
 document.addEventListener('focusin',async event=>{
  const input=event.target;if(input.tagName!=='INPUT'||!input.closest('dialog')||!fields[input.name])return;
  const role=fields[input.name];
  try{const data=await load();if(!input.isConnected)return;const id='master-picker-'+role;let list=document.getElementById(id);if(!list){list=document.createElement('datalist');list.id=id;document.body.append(list);}list.replaceChildren();
   const choices=role==='charge'?data.filter(r=>r.kind==='charge'):locationChoices(data,role);
   for(const row of choices){const option=document.createElement('option');option.value=row.name_zh;option.label=[row.name_en,row.country,row.city,row.code].filter(Boolean).join(' · ');list.append(option);}
   input.setAttribute('list',id);
  }catch{input.title='基础信息暂未加载，可继续填写原始名称。';}
 });
 document.addEventListener('change',event=>{
  const input=event.target,role=fields[input.name];if(!role||!input.closest('dialog')||!input.form)return;
  if(role==='charge')return;
  const row=resolveLocation(rows,input.value,role);if(!row)return;
  const country=input.form.elements[role==='origin'?'originCountry':'destinationCountry'];
  if(country&&!country.value&&row.country){country.value=row.country;country.dispatchEvent(new Event('input',{bubbles:true}));}
 });
}
