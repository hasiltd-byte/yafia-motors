import fs from 'node:fs';
import path from 'node:path';
const files=[];function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);e.isDirectory()?walk(p):files.push(p);}}walk('dist');
const failures=[];let count=0;
for(const file of files.filter(f=>f.endsWith('.html'))){const text=fs.readFileSync(file,'utf8');if(file.endsWith('404.html'))continue;count++;if(!/<html lang="(?:he|ar)" dir="rtl">/.test(text))failures.push(`${file}: language/direction`);if((text.match(/<h1[ >]/g)||[]).length!==1)failures.push(`${file}: heading count`);for(const required of ['name="description"','rel="canonical"','hreflang="he"','hreflang="ar"','application/ld+json'])if(!text.includes(required))failures.push(`${file}: missing ${required}`);for(const m of text.matchAll(/(?:src|href)="(\/[^"#?]*)(?:[?#][^"]*)?"/g)){let target=path.join('dist',decodeURIComponent(m[1]));if(fs.existsSync(target)&&fs.statSync(target).isDirectory())target=path.join(target,'index.html');if(!fs.existsSync(target))failures.push(`${file}: broken ${m[1]}`);}for(const m of text.matchAll(/<script type="application\/ld\+json">([^<]*)<\/script>/g))try{JSON.parse(m[1]);}catch{failures.push(`${file}: invalid schema`);}if(/(?:src|href)="\/en(?:\/|")/.test(text))failures.push(`${file}: unexpected local English route`);}
for(const file of files.filter(f=>f.endsWith('.html')&&!f.endsWith('404.html'))){
 const html=fs.readFileSync(file,'utf8');
 for(const node of html.matchAll(/>([^<>]+)</g))if(/\?{3,}/.test(node[1])){failures.push(`${file}: corrupted text rendered as question marks`);break;}
 const footer=html.match(/class="container footer-demo">([^<]*)</)?.[1]||'';
 const arabic=html.includes('<html lang="ar"');
 if(!(arabic?/\p{Script=Arabic}/u:/\p{Script=Hebrew}/u).test(footer))failures.push(`${file}: footer notice is missing its expected language`);
}
if(failures.length){console.error(failures.join('\n'));process.exit(1);}console.log(`PASS: ${count} pages; local links, images, metadata, JSON-LD, Hebrew/Arabic routes and text encoding.`);
