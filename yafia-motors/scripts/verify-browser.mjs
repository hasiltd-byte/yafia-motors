import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const base = process.env.CHECK_ORIGIN || 'http://127.0.0.1:4199';
const version = await (await fetch('http://127.0.0.1:9229/json/version')).json();
const ws = new WebSocket(version.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.onopen = resolve;
  ws.onerror = reject;
});
let id = 0;
const pending = new Map(),
  errors = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id) {
    const item = pending.get(m.id);
    pending.delete(m.id);
    m.error ? item?.reject(Error(JSON.stringify(m.error))) : item?.resolve(m.result);
  }
  if (m.method === 'Runtime.exceptionThrown')
    errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  if (m.method === 'Page.javascriptDialogOpening')
    void send('Page.handleJavaScriptDialog', { accept: true }, m.sessionId);
};
function send(method, params = {}, sessionId) {
  return new Promise((resolve, reject) => {
    const i = ++id;
    pending.set(i, { resolve, reject });
    ws.send(JSON.stringify({ id: i, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
}
const { targetId } = await send('Target.createTarget', { url: 'about:blank' }),
  { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
const c = (method, params) => send(method, params, sessionId);
async function evaluate(expression) {
  const r = await c('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails)
    throw Error(r.exceptionDetails.exception?.description || 'Browser evaluation failed');
  return r.result.value;
}
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
await c('Page.enable');
await c('Runtime.enable');
await fs.mkdir('qa', { recursive: true });
async function visit(url, width = 1440, height = 960) {
  await c('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width < 600,
  });
  await c('Page.navigate', { url });
  for (let i = 0; i < 80; i++) {
    await pause(100);
    if (await evaluate("document.readyState==='complete'")) break;
  }
  await evaluate('document.fonts.ready');
  await pause(500);
}
async function shot(name) {
  await evaluate(
    "document.querySelectorAll('.will-reveal').forEach(el=>el.classList.add('in-view'))",
  );
  await pause(400);
  const image = await c('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await fs.writeFile('qa/' + name + '.png', Buffer.from(image.data, 'base64'));
}
const results = [];
for (const [route, width, height, name] of [
  ['/he/', 1440, 960, 'next-home-he'],
  ['/ar/', 1440, 960, 'next-home-ar'],
  ['/he/', 390, 844, 'next-mobile-he'],
  ['/ar/', 390, 844, 'next-mobile-ar'],
  ['/he/services/engine-replacement/', 1440, 960, 'next-engine'],
  ['/ar/articles/transmission-service-guide/', 390, 844, 'next-article-ar'],
  ['/admin/login/', 1440, 960, 'next-login-setup'],
]) {
  await visit(base + route, width, height);
  await evaluate(
    "(async()=>{document.querySelectorAll('img').forEach(i=>i.loading='eager');await Promise.all([...document.images].map(i=>i.decode().catch(()=>{})));})()",
  );
  const data = await evaluate(
    "({lang:document.documentElement.lang,overflow:document.documentElement.scrollWidth>innerWidth,h1:document.querySelectorAll('h1').length,broken:[...document.images].filter(i=>!i.naturalWidth).map(i=>i.src)})",
  );
  assert.equal(data.overflow, false, route + ' overflow');
  assert.equal(data.h1, 1, route + ' H1');
  assert.deepEqual(data.broken, [], route + ' images');
  if (route.startsWith('/ar/')) assert.equal(data.lang, 'ar');
  results.push({ route, width, ...data });
  await shot(name);
}
await visit(base + '/he/', 390, 844);
assert.equal(
  await evaluate(
    "(()=>{const b=document.querySelector('.menu-toggle');b.click();return b.getAttribute('aria-expanded')==='true'})()",
  ),
  true,
);
assert.equal(
  await evaluate(
    "(()=>{const s=document.querySelector('.faq-list summary');s.click();return s.parentElement.open})()",
  ),
  true,
);
assert.equal(
  await evaluate(
    "(()=>{document.querySelector('[data-photo]').click();const d=document.querySelector('dialog'),open=d.open;d.querySelector('button').click();return open&&!d.open})()",
  ),
  true,
);
await visit(base + '/ar/contact/', 390, 844);
assert.equal(
  await evaluate(
    "(()=>{let target;window.open=url=>{target=url};const f=document.querySelector('#contact-form');f.querySelector('[name=name]').value='اختبار';f.querySelector('[name=vehicle]').value='شيفروليه 2020';f.requestSubmit();return decodeURIComponent(target||'').includes('مرحباً')})()",
  ),
  true,
);
// Real admin components with a separate loopback fixture API, never an auth bypass.
const harness = 'http://127.0.0.1:4198/harness/';
await visit(harness);
assert.equal(await evaluate("document.querySelectorAll('.cms-page-table article').length"), 18);
await shot('admin-dashboard');
await evaluate(
  "[...document.querySelectorAll('.cms-page-table article')].find(a=>a.querySelector('bdi')?.textContent.includes('/services/maintenance/')).querySelector('button').click()",
);
await pause(500);
assert.ok(await evaluate("document.querySelector('.cms-editor')!==null"));
await shot('admin-editor');
await evaluate("document.querySelector('.cms-editor-options input[type=checkbox]').click()");
const previous = await evaluate(
  "document.querySelector('.cms-field-editor .localized-field textarea[lang=ar]').value",
);
await evaluate(
  "(()=>{const el=document.querySelector('.cms-field-editor .localized-field textarea[lang=he]');el.focus();Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,'בדיקת עריכה חדשה');el.dispatchEvent(new Event('input',{bubbles:true}));el.blur()})()",
);
await pause(300);
assert.equal(
  await evaluate(
    "document.querySelector('.cms-field-editor .localized-field textarea[lang=ar]').value",
  ),
  previous,
  'manual translation protection',
);
await evaluate(
  "(()=>{const el=document.querySelector('.cms-field-editor .localized-field textarea[lang=he]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,'');el.dispatchEvent(new Event('input',{bubbles:true}))})()",
);
await pause(200);
assert.equal(
  await evaluate(
    "document.querySelector('.cms-field-editor .localized-field textarea[lang=he]').value",
  ),
  '',
  'cleared field stays editable',
);
await evaluate(
  "[...document.querySelectorAll('.cms-sticky button')].find(b=>b.textContent.includes('שמירת טיוטה')).click()",
);
await pause(500);
const calls = await (await fetch('http://127.0.0.1:4198/__calls')).json();
assert.ok(calls.some((c) => c.action === 'pages/save' && c.input.items.length === 2));
assert.equal(
  calls.some((c) => c.action === 'translation'),
  false,
);
await visit(harness, 390, 844);
assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth'), false);
await shot('admin-mobile');
await visit(harness);
await evaluate(
  "[...document.querySelectorAll('.cms-sidebar nav button')].find(b=>b.textContent.includes('פרטי האתר')).click()",
);
await pause(400);
await evaluate("document.querySelector('.cms-menu-manager summary').click()");
assert.equal(
  await evaluate("document.querySelectorAll('.cms-menu-row').length"),
  16,
  'all three menus',
);
await evaluate("document.querySelector('.cms-menu-manager section .cms-primary').click()");
await pause(200);
assert.equal(
  await evaluate(
    "document.querySelectorAll('.cms-menu-manager section')[0].querySelectorAll('.cms-menu-row').length",
  ),
  7,
  'new menu item',
);
await evaluate(
  "[...document.querySelectorAll('.cms-sticky button')].find(b=>b.textContent.includes('שמירת טיוטה')).click()",
);
await pause(400);
await shot('admin-menus');
await visit(harness + '?role=editor');
assert.equal(
  await evaluate(
    "[...document.querySelectorAll('.cms-sidebar nav button')].some(b=>b.textContent.includes('הרשאות'))",
  ),
  false,
  'editor permissions navigation',
);
await visit(harness + '?login=1');
assert.ok(await evaluate("document.querySelector('input[type=email]')!==null"));
await shot('admin-login-form');
assert.deepEqual(errors, [], 'browser exceptions');
await fs.writeFile(
  'qa/next-browser-results.json',
  JSON.stringify(
    {
      results,
      errors,
      admin:
        'Real components with synthetic fixture API; Supabase deployment still requires real account configuration.',
    },
    null,
    2,
  ),
);
console.log(
  'Browser checks passed: desktop/mobile Hebrew and Arabic, images, navigation, gallery, WhatsApp, admin editor, draft save, manual translation locks and role-based controls.',
);
await send('Target.closeTarget', { targetId });
ws.close();
