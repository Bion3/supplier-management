import {build} from 'esbuild';
import postcss from 'postcss';
import {readFile,writeFile,rm} from 'node:fs/promises';
await build({entryPoints:['src/orders-ui/entry.tsx'],outfile:'dist/src/orders.js',bundle:true,format:'esm',target:'es2022',minify:true,jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'shared-auth',setup(b){b.onResolve({filter:/^\.\.\/cloud\.js$/},()=>({path:'/src/cloud.js',external:true}))}}]});
// Scope the reviewed prototype stylesheet to this module so existing CRM navigation is preserved.
const root=postcss.parse(await readFile('src/orders-ui/styles.css','utf8'));
root.walkAtRules('import',rule=>rule.remove());
root.walkRules(rule=>{rule.selectors=rule.selectors.map(s=>s==='body'?'.orders-app':'.orders-app '+s)});
await writeFile('dist/src/orders.css',root.toString()+`\n.orders-app{background:#f5f7fa}.orders-app .main{margin:0;width:100%}.orders-app .cloud-busy{position:fixed;inset:0;z-index:100;background:#f4f7fbc9;display:grid;place-items:center;color:#315a86;font-weight:600}.orders-app .fields strong{white-space:pre-wrap}.orders-app .cloud-status{padding:15px;color:#6e86a3}.orders-app .sidebar{display:none}.orders-app input[type=checkbox]{width:15px;height:15px}.orders-app .fee-footer p{display:inline-block;margin:0 10px}\n`);
console.log('Orders client bundled with scoped styles.');

await rm('dist/src/orders-ui',{recursive:true,force:true});
