export const referenceTemplates=[];
export function templatePool(saved,purpose){return [...saved,...referenceTemplates].filter(t=>t.purpose===purpose);}
export function assignTemplates(recipients,pool,random=Math.random){
 if(!pool.length)throw Error('请至少勾选一个随机发送模板。');
 return recipients.map(contact=>({contact,template:pool[Math.min(pool.length-1,Math.floor(Math.max(0,random())*pool.length))]}));
}
