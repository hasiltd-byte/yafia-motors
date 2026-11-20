// Loopback-only UI test harness. It never participates in the Next.js application.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { build } from 'esbuild';
if (process.env.VERCEL) throw Error('The local UI harness cannot run on Vercel');
const root = path.resolve(import.meta.dirname, '..');
process.chdir(root);
fs.mkdirSync('qa', { recursive: true });
fs.writeFileSync(
  'qa/ui-entry.tsx',
  `import React from 'react';import {createRoot} from 'react-dom/client';import Dashboard from '../src/components/admin/Dashboard';import Login from '../src/components/admin/Login';const q=new URLSearchParams(location.search);createRoot(document.getElementById('root')!).render(<div className="cms">{q.has('login')?<Login ready/>:<Dashboard identity={{role:q.get('role')==='editor'?'editor':'admin',email:'admin@example.test'}}/>}</div>);`,
);
await build({
  entryPoints: ['qa/ui-entry.tsx'],
  outfile: 'qa/ui-harness.js',
  bundle: true,
  platform: 'browser',
  format: 'esm',
  jsx: 'automatic',
  define: {
    'process.env.NODE_ENV': '"production"',
    'process.env.SITE_ID': '"7a16cdaa-3c97-4791-a412-46775bd4d521"',
    'process.env.SITE_ORIGIN': '"https://yafia-motors.mybizsite.co"',
    'process.env.NEXT_PUBLIC_SUPABASE_URL': '"https://test.invalid"',
    'process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY': '"test-public-key"',
  },
  tsconfig: 'tsconfig.json',
});
if(process.argv.includes('--build-only'))process.exit(0);
const seed = JSON.parse(fs.readFileSync('.generated/seed.json', 'utf8'));
const pages = [...seed.pages, ...Object.values(seed.shells)].map((p) => ({
  id: randomUUID(),
  site_id: '7a16cdaa-3c97-4791-a412-46775bd4d521',
  ...p,
  draft: p.document,
  version: 1,
  published_revision: randomUUID(),
  updated_at: new Date().toISOString(),
}));
const revisions = pages.map((p) => ({
  id: p.published_revision,
  page_id: p.id,
  version: 1,
  document: p.draft,
  created_at: new Date().toISOString(),
}));
const calls = [];
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1:4198');
  const json = (data, status = 200) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  };
  if (url.pathname.startsWith('/api/admin/')) {
    const action = url.pathname.slice(11).replace(/\/$/, '');
    let input = {};
    if (req.method === 'POST') {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      input = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    }
    calls.push({ action, input });
    let data;
    if (action === 'pages') data = pages;
    else if (action === 'pages/save') {
      for (const item of input.items) {
        const p = pages.find((p) => p.id === item.id);
        if (p.version !== item.version) return json({ error: 'version conflict' }, 409);
        p.draft = item.document;
        p.version++;
        revisions.unshift({
          id: randomUUID(),
          page_id: p.id,
          version: p.version,
          document: p.draft,
          created_at: new Date().toISOString(),
        });
      }
      data = { ok: true };
    } else if (action === 'revisions')
      data = revisions
        .filter((r) => r.page_id === url.searchParams.get('id'))
        .sort((a, b) => b.version - a.version);
    else if (action === 'media' || action === 'tasks' || action === 'members' || action === 'audit')
      data = [];
    else if (action === 'settings')
      data = {
        monthly_budget_usd: 0,
        ai_enabled: false,
        usage: [],
        providers: { openai: false, googleSearch: false, searchConsole: false },
      };
    else data = { ok: true };
    return json({ data });
  }
  if (url.pathname === '/api/translation/') {
    calls.push({ action: 'translation' });
    return json({ translation: 'ترجمة للاختبار فقط' });
  }
  if (url.pathname === '/api/auth/') return json({ error: 'פרטי התחברות לבדיקה בלבד' }, 401);
  if (url.pathname === '/__calls') return json(calls);
  if (url.pathname === '/harness/') {
    res.writeHead(200, { 'Content-Type': 'text/html;charset=utf-8' });
    return res.end(
      '<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/assets/fonts.css"><link rel="stylesheet" href="/ui-harness.css"><link rel="stylesheet" href="/admin.css"></head><body style="margin:0"><div id="root"></div><script type="module" src="/ui-harness.js"></script></body></html>',
    );
  }
  let file;
  if (url.pathname.startsWith('/assets/')) {
    const candidate = path.resolve('dist', decodeURIComponent(url.pathname).slice(1));
    if (candidate.startsWith(path.resolve('dist/assets') + path.sep)) file = candidate;
  } else if (url.pathname === '/admin.css') file = path.resolve('src/app/admin/admin.css');
  else if (url.pathname === '/ui-harness.js') file = path.resolve('qa/ui-harness.js');
  else if (url.pathname === '/ui-harness.css') file = path.resolve('qa/ui-harness.css');
  if (file && fs.existsSync(file)) {
    const ext = path.extname(file),
      mime =
        {
          '.js': 'text/javascript',
          '.css': 'text/css',
          '.svg': 'image/svg+xml',
          '.jpg': 'image/jpeg',
          '.png': 'image/png',
          '.woff2': 'font/woff2',
        }[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime });
    return fs.createReadStream(file).pipe(res);
  }
  res.writeHead(404);
  res.end('Not found');
});
server.listen(4198, '127.0.0.1', () =>
  console.log(
    'Synthetic admin UI test harness: http://127.0.0.1:4198/harness/ (not a production login)',
  ),
);
