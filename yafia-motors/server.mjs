import http from 'node:http';
import {readFile, stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.join(path.dirname(fileURLToPath(import.meta.url)),'dist');
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.xml':'application/xml','.txt':'text/plain'};
http.createServer(async(req,res)=>{try{let p=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!p.startsWith(root+path.sep)&&p!==root)throw Error();if((await stat(p)).isDirectory())p=path.join(p,'index.html');res.setHeader('Content-Type',types[path.extname(p)]||'application/octet-stream');res.setHeader('Cache-Control','no-cache');res.end(await readFile(p));}catch{res.statusCode=404;res.setHeader('Content-Type','text/html; charset=utf-8');res.end(await readFile(path.join(root,'404.html')).catch(()=> 'Not found'));}}).listen(4173,'127.0.0.1',()=>console.log('Local: http://localhost:4173'));
