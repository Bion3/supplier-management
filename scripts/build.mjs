import {mkdir, rm, cp, readFile} from 'node:fs/promises';
await rm('dist', {recursive:true,force:true});
await mkdir('dist',{recursive:true});
await cp('index.html','dist/index.html');
await cp('crm.html','dist/crm.html');
await cp('knowledge.html','dist/knowledge.html');
await cp('mail.html','dist/mail.html');
await cp('cost.html','dist/cost.html');
await cp('rates.html','dist/rates.html');
await cp('rail-rates.html','dist/rail-rates.html');
await cp('hub.html','dist/hub.html');
await cp('pickup-rates.html','dist/pickup-rates.html');
await cp('src','dist/src',{recursive:true});
const html = await readFile('dist/index.html','utf8');
for(const asset of ['src/app.js','src/suppliers.js','src/style.css']) await readFile(`dist/${asset}`);
if(!html.includes('/src/app.js')) throw new Error('Missing application entry');
console.log('Build successful: dist/ (static frontend, no runtime dependencies)');


