import fs from 'node:fs';
import path from 'node:path';
const expected='https://yafia-motors.mybizsite.co';
const errors=[];let pages=0;
const config=JSON.parse(fs.readFileSync('vercel.json','utf8'));
if(config.framework!==null||config.outputDirectory!=='dist'||config.buildCommand!=='npm run build'||!config.trailingSlash)errors.push('Unexpected Vercel build settings');
if(!config.redirects.some(r=>r.source==='/'&&r.destination==='/he/'&&r.permanent))errors.push('Missing permanent Hebrew home redirect');
function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())walk(p);else if(p.endsWith('.html')){pages++;const html=fs.readFileSync(p,'utf8');for(const match of html.matchAll(/(?:rel="(?:canonical|alternate)"[^>]*href|property="og:(?:url|image)"[^>]*content|name="twitter:image"[^>]*content)="([^"]+)"/g))if(!match[1].startsWith(expected+'/'))errors.push(p+': unexpected public URL '+match[1]);if(html.includes('localhost:4173')||html.includes('yafia-motors-garage.hasiltd.chatgpt.site'))errors.push(p+': old origin');}}}
walk('dist/he');walk('dist/ar');
const sitemap=fs.readFileSync('dist/sitemap.xml','utf8');const locations=[...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(m=>m[1]);
if(locations.length!==36||locations.some(u=>!u.startsWith(expected+'/')))errors.push('Sitemap origin or page count');
if(!fs.readFileSync('dist/robots.txt','utf8').includes(expected+'/sitemap.xml'))errors.push('Robots sitemap origin');
console.log(JSON.stringify({pages,origin:expected,errors},null,2));if(errors.length)process.exitCode=1;
