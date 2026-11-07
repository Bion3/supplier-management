// Keep this allowlist in sync with the protected HTML pages in scripts/build.mjs.
export const taskPages=new Set(['/','/hub.html','/assistant.html','/daily-dashboard.html','/crm.html','/customs-data.html','/exhibitions.html','/industry-resources.html','/discovery.html','/lead-map.html','/knowledge.html','/mail.html','/inbox.html','/cost.html','/rates.html','/rail-rates.html','/fcl-rail.html','/container-rental.html','/trucking.html','/pickup-rates.html','/pricing.html','/sales-prices.html','/tracking.html']);
export function taskURL(value,origin){
 try{const url=new URL(value,origin);if(url.pathname==='/index.html')url.pathname='/';return url.origin===origin&&taskPages.has(url.pathname)?url.pathname+url.search+url.hash:null;}catch{return null;}
}
export function openTask(url){
 if(window.parent!==window&&typeof window.parent.eurasiagoWorkspace?.open==='function'){if(!window.parent.eurasiagoWorkspace.open(url))throw Error('请先保存并关闭一个任务，再打开新任务。');}
 else location.assign(url);
}
