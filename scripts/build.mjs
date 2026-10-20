import {mkdir, rm, cp, readFile, writeFile} from 'node:fs/promises';
await rm('dist', {recursive:true,force:true});
await mkdir('dist',{recursive:true});
const htmlFiles=['index.html','crm.html','discovery.html','knowledge.html','mail.html','inbox.html','cost.html','rates.html','rail-rates.html','hub.html','pickup-rates.html','pricing.html'];
const authBoot=`<script data-auth-boot>try{const s=JSON.parse(sessionStorage.getItem('supplier-auth')||'null');if(s?.user)document.documentElement.classList.add('auth-user')}catch{}finally{document.documentElement.classList.add('auth-ready')}</script>`;
for(const file of htmlFiles){
 const source=await readFile(file,'utf8');
 await writeFile(`dist/${file}`,source.replace('</head>',authBoot+'</head>'));
}
await cp('src','dist/src',{recursive:true});
const html = await readFile('dist/index.html','utf8');
for(const asset of ['src/app.js','src/suppliers.js','src/style.css']) await readFile(`dist/${asset}`);
if(!html.includes('/src/app.js')) throw new Error('Missing application entry');
for(const file of htmlFiles){const output=await readFile(`dist/${file}`,'utf8');if(!output.includes('data-auth-boot'))throw new Error(`Missing auth bootstrap: ${file}`);}
console.log('Build successful: dist/ (static frontend, no runtime dependencies)');



