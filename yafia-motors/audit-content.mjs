import fs from 'node:fs';
import path from 'node:path';
const plain=s=>s.replace(/<[^>]*>/g,' ').replace(/&(?:amp|quot|#39|lt|gt);/g,m=>({'&amp;':'&','&quot;':'"','&#39;':"'",'&lt;':'<','&gt;':'>'}[m])).replace(/\s+/g,' ').trim();
const report={pages:0,withinPage:[],acrossPages:[],missingContent:[]};
for(const lang of ['he','ar']){
 const files=[];function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);e.isDirectory()?walk(p):files.push(p);}}walk('dist/'+lang);
 const paragraphs=new Map();
 for(const file of files.filter(f=>f.endsWith('.html'))){
  report.pages++;let main=fs.readFileSync(file,'utf8').match(/<main id="main">([\s\S]*?)<\/main>/)?.[1];
  if(!main){report.missingContent.push(file);continue;}
  // Navigation cards, shared contact banners and editorial notices are reusable UI.
  main=main.replace(/<a class="service-card[^\"]*"[\s\S]*?<\/a>/g,'').replace(/<article class="article-card[^\"]*"[\s\S]*?<\/article>/g,'').replace(/<section class="container cta-wrap">[\s\S]*?<\/section>/g,'').replace(/<div class="article-source">[\s\S]*?<\/div>/g,'');
  const seen=new Set();
  for(const m of main.matchAll(/<p(?:\s[^>]*)?>([\s\S]*?)<\/p>/g)){
   if(m[0].includes('class="demo-note"'))continue;
   const text=plain(m[1]);if(text.length<70)continue;
   if(seen.has(text))report.withinPage.push({file,text});seen.add(text);
   const locations=paragraphs.get(text)||new Set();locations.add(file);paragraphs.set(text,locations);
  }
 }
 for(const [text,locations] of paragraphs)if(locations.size>1)report.acrossPages.push({text,files:[...locations]});
}
fs.mkdirSync('qa',{recursive:true});fs.writeFileSync('qa/content-audit.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));if(report.withinPage.length||report.acrossPages.length||report.missingContent.length)process.exitCode=1;
