import fs from 'node:fs';
import path from 'node:path';
const errors=[],counts={pages:0,servicePages:0,articlePages:0,images:0,sections:0};
const unescape=s=>s.replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>');
for(const lang of ['he','ar']){
 const titles=new Set(),descriptions=new Set(),files=[];
 function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);e.isDirectory()?walk(p):files.push(p);}}walk('dist/'+lang);
 for(const file of files.filter(f=>f.endsWith('.html'))){
  counts.pages++;const html=fs.readFileSync(file,'utf8'),title=html.match(/<title>(.*?)<\/title>/)?.[1],description=html.match(/<meta name="description" content="([^"]*)"/)?.[1];
  if(!title||titles.has(title))errors.push(file+': missing/duplicate title');titles.add(title);
  if(!description||descriptions.has(description))errors.push(file+': missing/duplicate description');descriptions.add(description);
  if(title?.length>85||!description||unescape(description).length<65||unescape(description).length>200)errors.push(file+': review metadata length');
  const main=html.match(/<main id="main">([\s\S]*?)<\/main>/)?.[1]||'';
  if((main.match(/<h1\b/g)||[]).length!==1||!main.includes('<h2>'))errors.push(file+': heading structure');
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);if(new Set(ids).size!==ids.length)errors.push(file+': duplicate IDs');
  for(const m of html.matchAll(/href="#([^"]+)"/g))if(!ids.includes(m[1]))errors.push(file+': broken section anchor '+m[1]);
  for(const m of html.matchAll(/<img\b[^>]*>/g)){
   counts.images++;const alt=m[0].match(/\balt="([^"]*)"/);
   if(!alt)errors.push(file+': image without alt');
   const insideDialog=html.lastIndexOf('<dialog',m.index)>html.lastIndexOf('</dialog',m.index);
   if(alt?.[1]===''&&!m[0].includes('/logo.svg')&&!insideDialog)errors.push(file+': undescribed content image');
  }
  if(lang==='ar'&&/[\u0590-\u05ff]/.test(main))errors.push(file+': Hebrew text in Arabic main content');
  const data=JSON.parse(html.match(/<script type="application\/ld\+json">([^<]*)<\/script>/)[1]);
  if(file.includes(path.sep+'services'+path.sep)&&!file.endsWith(path.sep+'services'+path.sep+'index.html')){
   counts.servicePages++;if(!data.some(d=>d['@type']==='Service'))errors.push(file+': missing Service schema');
   if(!main.includes('knowledge-toc')||!main.includes('work-steps')||!main.includes('knowledge-table-wrap')||!main.includes('article-source'))errors.push(file+': incomplete professional service content');
  }
  if(file.includes(path.sep+'articles'+path.sep)&&!file.endsWith(path.sep+'articles'+path.sep+'index.html')){counts.articlePages++;if(!data.some(d=>d['@type']==='Article'&&d.citation?.length))errors.push(file+': article sources/schema');}
  counts.sections+=(main.match(/class="knowledge-block"/g)||[]).length;
  const expected='/'+path.relative('dist',path.dirname(file)).split(path.sep).join('/')+'/';
  const canonical=unescape(html.match(/rel="canonical" href="([^"]+)"/)[1]);if(new URL(canonical).pathname!==expected)errors.push(file+': wrong canonical');
 }
}
console.log(JSON.stringify({counts,errors},null,2));if(errors.length)process.exitCode=1;
