// Multi-contact format shared by manual exhibitor editing and list display.
export function mergeExhibitorContacts(row,extra={}){
 const all=[],seen=new Set();
 const add=(type,value,details={})=>{
  value=String(value||'').trim();
  if(!value||value.length>180)return;
  if(type==='email'&&!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(value))return;
  if(type==='phone'&&value.replace(/\\D/g,'').length<6)return;
  const key=type+'|'+value.toLowerCase();
  if(seen.has(key)||all.length>=100)return;
  seen.add(key);all.push({type,value,verification:'unverified',...details});
 };
 for(const item of Array.isArray(row.contacts)?row.contacts:[]){
  if(['email','phone','person'].includes(item.type))add(item.type,item.value,item);
 }
 add('email',row.email,{source_type:'primary_field'});
 add('phone',row.phone,{source_type:'primary_field'});
 add('person',row.contact_name,{source_type:'primary_field'});
 for(const [type,text] of [['email',extra.emails],['phone',extra.phones],['person',extra.people]]){
  for(const value of String(text||'').split(/[\\r\\n;；]+/).slice(0,50))
   add(type,value,{source_type:'manual_entry'});
 }
 return all;
}
export function exhibitorContactsByType(row,type){
 const arr=mergeExhibitorContacts(row);
 return arr.filter(x=>x.type===type);
}
