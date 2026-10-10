import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve, extname, sep} from 'node:path';
const root = resolve(process.argv[2] || '.'), port = Number(process.env.PORT || 3000);
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'};
createServer(async(req,res) => {
  try {
    const path = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const file = resolve(root, '.' + (path === '/' ? '/index.html' : path));
    if(!file.startsWith(root + sep) || !['.html','.js','.css'].includes(extname(file))) {res.writeHead(404);return res.end('Not found');}
    const data = await readFile(file); res.writeHead(200,{'Content-Type':types[extname(file)],'X-Content-Type-Options':'nosniff'}); res.end(data);
  } catch {res.writeHead(404);res.end('Not found');}
}).listen(port,'127.0.0.1',() => console.log(`Supplier Hub: http://localhost:${port}`));
