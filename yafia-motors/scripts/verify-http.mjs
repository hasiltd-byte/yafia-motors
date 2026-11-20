import fs from 'node:fs';
import assert from 'node:assert/strict';
import { parse } from 'parse5';
const base = process.env.CHECK_ORIGIN || 'http://127.0.0.1:4199';
const seed = JSON.parse(fs.readFileSync('.generated/seed.json', 'utf8'));
const descendants = (n, test) => [
  ...(test(n) ? [n] : []),
  ...(n.childNodes || []).flatMap((c) => descendants(c, test)),
];
const attr = (n, key) => n?.attrs?.find((a) => a.name === key)?.value;
const normalize = (value) => value.replace(/\s+/g, ' ').trim();
const rawText = (n) =>
  n?.nodeName === '#text'
    ? n.value
    : (n?.childNodes || [])
        .filter((c) => !['script', 'style'].includes(c.tagName))
        .map(rawText)
        .join('');
const text = (n) => normalize(rawText(n));
const rawExpected = (nodes) =>
  nodes.map((n) => (n.text !== undefined ? n.text : rawExpected(n.children || []))).join('');
const expectedText = (nodes) => normalize(rawExpected(nodes));
const results = [];
for (const p of seed.pages) {
  const route = `/${p.locale}/${p.route ? p.route + '/' : ''}`,
    response = await fetch(base + route);
  assert.equal(response.status, 200, route);
  const html = await response.text(),
    ast = parse(html),
    main = descendants(ast, (n) => n.tagName === 'main')[0];
  assert.equal(
    attr(descendants(ast, (n) => n.tagName === 'html')[0], 'lang'),
    p.locale,
    route + ' document language',
  );
  assert.equal(descendants(main, (n) => n.tagName === 'h1').length, 1, route + ' H1');
  assert.equal(
    text(descendants(ast, (n) => n.tagName === 'title')[0]),
    p.document.title,
    route + ' title',
  );
  assert.equal(
    text(main),
    expectedText(p.document.blocks.flatMap((b) => b.nodes)),
    route + ' main content',
  );
  const canonical = descendants(
    ast,
    (n) => n.tagName === 'link' && attr(n, 'rel') === 'canonical',
  )[0];
  assert.equal(attr(canonical, 'href'), seed.origin + route, route + ' canonical');
  const metas = descendants(ast, (n) => n.tagName === 'meta');
  assert.equal(
    attr(
      metas.find((n) => attr(n, 'name') === 'description'),
      'content',
    ),
    p.document.description,
    route + ' description',
  );
  assert.equal(
    descendants(ast, (n) => n.tagName === 'link' && attr(n, 'hreflang')).length,
    3,
    route + ' alternate languages',
  );
  const switcher = descendants(
    ast,
    (n) => n.tagName === 'a' && attr(n, 'class')?.split(/\s+/).includes('language-switch'),
  )[0];
  const other = p.locale === 'he' ? 'ar' : 'he';
  assert.equal(
    attr(switcher, 'href'),
    `/${other}/${p.route ? p.route + '/' : ''}`,
    route + ' language switch',
  );
  const header = descendants(ast, (n) => n.tagName === 'header')[0];
  assert.equal(
    Boolean(attr(header, 'class')?.includes('interior-header')),
    Boolean(p.route),
    route + ' header variant',
  );
  const expectedImages = [];
  function collectImages(nodes) {
    for (const n of nodes) {
      if (n.tag === 'img') expectedImages.push({ src: n.attrs.src, alt: n.attrs.alt });
      collectImages(n.children || []);
    }
  }
  collectImages(p.document.blocks.flatMap((b) => b.nodes));
  assert.deepEqual(
    descendants(main, (n) => n.tagName === 'img').map((n) => ({
      src: attr(n, 'src'),
      alt: attr(n, 'alt'),
    })),
    expectedImages,
    route + ' original image selection and alt text',
  );
  for (const img of descendants(main, (n) => n.tagName === 'img')) {
    assert.ok(
      img.attrs.some((a) => a.name === 'alt'),
      route + ' image alt',
    );
    const image = await fetch(new URL(attr(img, 'src'), base));
    assert.equal(image.status, 200, route + ' image');
  }
  const schemas = descendants(
    ast,
    (n) => n.tagName === 'script' && attr(n, 'type') === 'application/ld+json',
  );
  assert.ok(schemas.length, route + ' structured data');
  for (const schema of schemas) JSON.parse(schema.childNodes.map((n) => n.value || '').join(''));
  assert.ok(
    descendants(ast, (n) => n.tagName === 'a' && attr(n, 'href') === '/admin/login/').length,
    route + ' admin link',
  );
  results.push({ route, status: response.status, content: 'preserved', seo: 'passed' });
}
const root = await fetch(base + '/', { redirect: 'manual' });
assert.equal(root.status, 308);
assert.equal(root.headers.get('location'), '/he/');
for (const path of ['/missing/', '/he/missing/', '/en/'])
  assert.equal((await fetch(base + path)).status, 404, path);
const admin = await fetch(base + '/admin/', { redirect: 'manual' });
assert.equal(admin.status, 307);
assert.equal(admin.headers.get('location'), '/admin/login/');
const login = await fetch(base + '/admin/login/');
assert.equal(login.status, 200);
assert.match(login.headers.get('x-robots-tag'), /noindex/);
for (const path of [
  'pages',
  'members',
  'tasks',
  'settings',
  'revisions?id=aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
]) {
  const r = await fetch(base + '/api/admin/' + path);
  assert.ok([401, 403, 503].includes(r.status), 'unauthorized ' + path);
}
const sitemap = await (await fetch(base + '/sitemap.xml')).text();
assert.equal((sitemap.match(/<loc>/g) || []).length, 36);
assert.ok(!sitemap.includes('localhost'));
assert.ok(!sitemap.includes('/admin/'));
assert.ok(sitemap.includes(seed.origin + '/ar/'));
const robots = await (await fetch(base + '/robots.txt')).text();
assert.ok(robots.includes('Disallow: /admin/'));
assert.ok(robots.includes(seed.origin + '/sitemap.xml'));
fs.mkdirSync('qa', { recursive: true });
fs.writeFileSync(
  'qa/next-http-results.json',
  JSON.stringify({ checkedAt: new Date().toISOString(), base, results }, null, 2),
);
console.log(
  '36 pages: preserved text, language, metadata, images, structured data and links. Root redirect, 404, sitemap and unauthorized administration checks passed.',
);
