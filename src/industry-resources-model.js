export const runLabels={running:'采集中',completed:'已完成',partial:'部分完成',blocked:'受限已跳过',failed:'失败待重试'};
export function safeResourceURL(value){try{const u=new URL(value);return ['http:','https:'].includes(u.protocol)?u.href:'';}catch{return '';}}
export function sourceQuery(tab,{query='',industry='',region='',state=''},page=1,size=30){
 const table={sources:'freight_industry_directories',entries:'freight_directory_entries',runs:'freight_directory_runs'}[tab];if(!table)throw Error('未知列表');
 const p=new URLSearchParams({select:'*',limit:String(size+1),offset:String((page-1)*size),order:tab==='sources'?'priority.asc,name.asc':tab==='entries'?'first_collected_at.desc,id.desc':'started_at.desc,id.desc'});
 if(tab!=='runs'){if(industry)p.set('industry','eq.'+industry);if(region)p.set(tab==='sources'?'region':'country','eq.'+region);if(query)p.set(tab==='sources'?'name':'company_name','ilike.*'+query.replace(/[\\*%_]/g,'\\$&')+'*');}
 if(state)p.set(tab==='sources'?'access_status':tab==='entries'?'contact_state':'status','eq.'+state);
 return table+'?'+p;
}
