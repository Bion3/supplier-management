// Filters operate on the full loaded dataset, before pagination and bulk selection.
export function matchesListFilters(row,values,fields) {
 return fields.every(field=>{
  const value=String(values[field.id]||'').trim().toLocaleLowerCase();if(!value)return true;
  const raw=field.get(row),text=String(raw??'').toLocaleLowerCase();
  if(field.type==='from')return !!text&&text.slice(0,10)>=value;
  if(field.type==='until')return !!text&&text.slice(0,10)<=value;
  if(field.type==='select')return (Array.isArray(raw)?raw:[raw]).some(v=>String(v??'').toLocaleLowerCase()===value);
  return text.includes(value);
 });
}
export function createListFilters(bodyId,fields,onChange) {
 const body=document.getElementById(bodyId),box=document.createElement('details'),title=document.createElement('summary'),controls=document.createElement('div'),inputs=new Map();
 box.className='list-extra-filters';title.textContent='更多筛选';controls.className='list-filter-controls';box.append(title,controls);
 for(const field of fields) {
  const label=document.createElement('label');label.textContent=field.label;
  const input=document.createElement(field.type==='select'?'select':'input');input.id=bodyId+'-extra-'+field.id;
  if(field.type==='select')for(const [value,text] of [['','全部'],...(field.options||[])])input.append(new Option(text,value));
  else {input.type=['from','until'].includes(field.type)?'date':'search';input.placeholder=field.placeholder||field.label;}
  input.addEventListener(field.type==='select'||['from','until'].includes(field.type)?'change':'input',()=>{updateTitle();onChange();});
  label.append(input);controls.append(label);inputs.set(field.id,input);
 }
 const clear=document.createElement('button');clear.type='button';clear.className='secondary';clear.textContent='清除补充筛选';clear.onclick=()=>{for(const input of inputs.values())input.value='';updateTitle();onChange();};controls.append(clear);
 body.closest('.table-wrap').before(box);
 function values(){return Object.fromEntries([...inputs].map(([key,input])=>[key,input.value]));}
 function updateTitle(){const n=[...inputs.values()].filter(input=>input.value.trim()).length;title.textContent='更多筛选'+(n?'（已用 '+n+' 项）':'');}
 return {apply:rows=>rows.filter(row=>matchesListFilters(row,values(),fields)),clear:()=>{for(const input of inputs.values())input.value='';updateTitle();}};
}
export function contactColumns(contacts) {
 const values=channel=>[...new Set(contacts.filter(c=>c.channel===channel).map(c=>c.value).filter(Boolean))].join('\n');
 return {names:[...new Set(contacts.map(c=>c.name).filter(Boolean))].join('\n'),phone:values('电话'),email:values('邮箱'),wechat:values('微信')};
}
