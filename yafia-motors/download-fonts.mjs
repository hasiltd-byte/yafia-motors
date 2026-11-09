import fs from 'node:fs/promises';
const url='https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;600;700;800;900&family=Noto+Sans+Arabic:wght@400;500;600;700;800;900&family=Oswald:wght@500;600;700&display=swap';
const res=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0 Chrome/130.0.0.0 Safari/537.36'}});if(!res.ok)throw Error(res.status);
let css=await res.text();const urls=[...new Set([...css.matchAll(/url\((https:[^)]+)\)/g)].map(x=>x[1]))];
await fs.mkdir('dist/assets/fonts',{recursive:true});
for(const [i,url] of urls.entries()){const r=await fetch(url);if(!r.ok)throw Error(r.status);const name=`font-${i}.woff2`;await fs.writeFile('dist/assets/fonts/'+name,Buffer.from(await r.arrayBuffer()));css=css.split(url).join('/assets/fonts/'+name);}
await fs.writeFile('dist/assets/fonts.css',css);console.log(`Downloaded ${urls.length} font files.`);
