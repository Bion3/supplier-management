export const directoryTypes=['ENF','WCA','WIFFA'];
export function companyDirectoryTypes(company){
 const found=new Set();const add=value=>{if(typeof value!=='string')return;const label=value.trim().toUpperCase();if(directoryTypes.includes(label))found.add(label);};
 for(const ref of company.source_refs||[]){if(typeof ref==='string'){add(ref);continue;}if(!ref||typeof ref!=='object')continue;add(ref.source);add(ref.provider);for(const name of Array.isArray(ref.original_sources)?ref.original_sources:[])add(name);}
 return directoryTypes.filter(value=>found.has(value));
}
