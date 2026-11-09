import {spawn} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
process.chdir(root);
await import('./build.mjs');
const address='http://localhost:4173';
async function ready(){try{const r=await fetch(address+'/he/',{signal:AbortSignal.timeout(1500)});return r.ok&&(await r.text()).includes('YAFIA MOTORS');}catch{return false;}}
if(!await ready()){
 const child=spawn(process.execPath,[path.join(root,'server.mjs')],{cwd:root,detached:true,stdio:'ignore',windowsHide:true});child.unref();
 for(let i=0;i<30&&!await ready();i++)await new Promise(r=>setTimeout(r,200));
}
if(!await ready())throw Error('Could not start local website on port 4173.');
console.log('Hebrew: '+address+'/he/\nArabic: '+address+'/ar/');
if(process.platform==='win32'&&!process.argv.includes('--no-open'))spawn('powershell.exe',['-NoProfile','-Command',"Start-Process 'http://localhost:4173/he/'"],{stdio:'ignore',windowsHide:true}).unref();
