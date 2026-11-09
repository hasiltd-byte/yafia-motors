import fs from 'node:fs/promises';
const version=await(await fetch('http://127.0.0.1:9222/json/version')).json();
const ws=new WebSocket(version.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
let id=0;const waiting=new Map();ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const w=waiting.get(m.id);waiting.delete(m.id);m.error?w?.reject(Error(JSON.stringify(m.error))):w?.resolve(m.result);}};
function send(method,params={},sessionId){return new Promise((resolve,reject)=>{const i=++id;waiting.set(i,{resolve,reject});ws.send(JSON.stringify({id:i,method,params,...sessionId?{sessionId}:{}}));});}
const {targetId}=await send('Target.createTarget',{url:'about:blank'});const {sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});const c=(m,p)=>send(m,p,sessionId);
const evaluate=async expression=>(await c('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true})).result;
await c('Page.enable');await c('Runtime.enable');await fs.mkdir('qa',{recursive:true});
const errors=[];
ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.text);});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function visit(route,width,height){await c('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<600});await c('Page.navigate',{url:'http://127.0.0.1:4173'+route});for(let i=0;i<40;i++){await pause(100);const ready=await evaluate('document.readyState');if(ready.value==='complete')break;}await evaluate('document.fonts.ready');await evaluate(`(async()=>{document.querySelectorAll('img').forEach(i=>i.loading='eager');await Promise.all([...document.images].map(i=>i.decode().catch(()=>{})));})()`);await pause(300);return (await evaluate(`JSON.stringify({lang:document.documentElement.lang,title:document.title,overflow:document.documentElement.scrollWidth>innerWidth,missingImages:[...document.images].filter(i=>!i.complete||!i.naturalWidth).map(i=>i.src),h1:document.querySelectorAll('h1').length,fonts:document.fonts.status})`)).value;}
async function shot(name,full=false){await evaluate("document.querySelectorAll('.will-reveal').forEach(el=>el.classList.add('in-view'))");await pause(750);let opts={format:'png',captureBeyondViewport:full};if(full){const m=await c('Page.getLayoutMetrics');opts.clip={x:0,y:0,width:m.cssContentSize.width,height:m.cssContentSize.height,scale:1};}const r=await c('Page.captureScreenshot',opts);await fs.writeFile('qa/'+name+'.png',Buffer.from(r.data,'base64'));}
const results=[];
for(const [route,width,height,name,full] of [['/he/',1440,1000,'he-desktop',true],['/ar/',1440,1000,'ar-desktop',true],['/he/',390,844,'he-mobile',true],['/ar/',390,844,'ar-mobile',true],['/he/services/engine-replacement/',1440,1000,'service',false],['/ar/articles/transmission-service-guide/',390,844,'article-ar',false],['/ar/contact/',390,844,'contact-ar',true]]){results.push({route,width,result:JSON.parse(await visit(route,width,height))});await shot(name,full);}
await visit('/he/',390,844);
results.push({mobileMenu:await evaluate(`(()=>{const b=document.querySelector('.menu-toggle');b.click();return b.getAttribute('aria-expanded')==='true'&&getComputedStyle(document.querySelector('.nav-links')).display!=='none'})()`)});
results.push({faq:await evaluate(`(()=>{const q=document.querySelector('.faq-list summary');q.click();return q.parentElement.open})()`)});
results.push({gallery:await evaluate(`(()=>{document.querySelector('[data-photo]').click();const open=document.querySelector('dialog').open;document.querySelector('dialog button').click();return open&&!document.querySelector('dialog').open})()`)});
await visit('/ar/services/transmission/',390,844);results.push({switchPath:await evaluate(`document.querySelector('.language-switch').getAttribute('href')`)});
await visit('/ar/contact/',390,844);results.push({whatsapp:await evaluate(`(()=>{let target;window.open=(url)=>{target=url};const form=document.querySelector('form');form.querySelector('[name=name]').value='اختبار';form.querySelector('[name=vehicle]').value='شيفروليه 2020';form.requestSubmit();return {url:target,arabic:decodeURIComponent(target||'').includes('مرحباً'),valid:form.checkValidity()}})()`)});
const failures=results.filter(r=>r.result&&(r.result.overflow||r.result.missingImages.length||r.result.h1!==1));
for(const key of ['mobileMenu','faq','gallery'])if(!results.find(r=>r[key])?.[key]?.value)failures.push(key);
if(results.find(r=>r.switchPath)?.switchPath.value!=='/he/services/transmission/')failures.push('language switch');
if(!results.find(r=>r.whatsapp)?.whatsapp.value?.arabic)failures.push('Arabic message');
console.log(JSON.stringify({results,errors,failures},null,2));await fs.writeFile('qa/browser-results.json',JSON.stringify({results,errors,failures},null,2));await send('Target.closeTarget',{targetId});ws.close();if(failures.length||errors.length)process.exitCode=1;
