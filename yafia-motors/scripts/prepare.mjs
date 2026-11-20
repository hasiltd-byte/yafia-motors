import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { parse } from 'parse5';
import { sourceFingerprint } from '../src/shared/i18n/translation.mjs';
const root = path.resolve(import.meta.dirname, '..');
process.chdir(root);
const origin = (process.env.SITE_ORIGIN || 'https://yafia-motors.mybizsite.co').replace(/\/$/, '');
execFileSync(process.execPath, ['build.mjs'], {
  cwd: root,
  env: { ...process.env, SITE_ORIGIN: origin },
  stdio: 'inherit',
});
fs.mkdirSync('.generated', { recursive: true });
fs.mkdirSync('public', { recursive: true });
fs.cpSync('dist/assets', 'public/assets', { recursive: true });
function node(n) {
  if (n.nodeName === '#text') return { text: n.value };
  if (!n.tagName || n.tagName === 'script') return null;
  return {
    tag: n.tagName,
    attrs: Object.fromEntries((n.attrs || []).map((a) => [a.name, a.value])),
    children: (n.childNodes || []).map(node).filter(Boolean),
  };
}
function find(n, tag) {
  if (n.tagName === tag) return n;
  for (const c of n.childNodes || []) {
    const f = find(c, tag);
    if (f) return f;
  }
}
const result = { origin, pages: [], shells: {} };
for (const locale of ['he', 'ar']) {
  const files = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      entry.isDirectory() ? walk(p) : entry.name === 'index.html' && files.push(p);
    }
  }
  walk('dist/' + locale);
  for (const file of files) {
    const route = path.relative('dist/' + locale, path.dirname(file)).replaceAll('\\', '/');
    const ast = parse(fs.readFileSync(file, 'utf8'));
    const head = find(ast, 'head'),
      body = find(ast, 'body');
    const main = find(body, 'main');
    const attr = (n, k) => n.attrs?.find((a) => a.name === k)?.value;
    const meta = (key) =>
      head.childNodes.find(
        (n) => n.tagName === 'meta' && (attr(n, 'name') === key || attr(n, 'property') === key),
      );
    const title = find(head, 'title')
      .childNodes.map((n) => n.value || '')
      .join('');
    const blocks = main.childNodes
      .map(node)
      .filter(Boolean)
      .filter((n) => n.tag || n.text.trim())
      .map((n, i) => ({
        id: 'b' + i,
        kind: 'existing',
        label: n.tag === 'section' ? 'אזור תוכן ' + (i + 1) : 'תוכן מקצועי ' + (i + 1),
        nodes: [n],
      }));
    if (route === 'privacy')
      for (const block of blocks) {
        const visit = (n) => {
          if (
            n.text &&
            n.text.includes(
              locale === 'he'
                ? 'האתר אינו כולל חשבונות משתמשים'
                : 'لا يتضمن الموقع حسابات مستخدمين',
            )
          )
            n.text =
              locale === 'he'
                ? 'הגלישה באתר פתוחה לציבור. ממשק הניהול מיועד למנהלים שהוזמנו בלבד ומשתמש בעוגיות הכרחיות להתחברות. פרטי טופס יצירת הקשר אינם נשמרים בשרת; הטופס פותח הודעה לשליחה בוואטסאפ. ספקי האחסון עשויים לשמור יומנים טכניים לצורך תפעול ואבטחה. תוכן שמנהלים שולחים לתרגום או למחקר AI מועבר לספק השירות שנבחר. קישורי וואטסאפ ו־Google Maps כפופים למדיניות השירותים החיצוניים.'
                : 'الموقع متاح للجمهور. لوحة الإدارة مخصصة للمستخدمين المدعوين وتستخدم ملفات ارتباط ضرورية لتسجيل الدخول. لا تُحفظ بيانات نموذج التواصل على الخادم؛ يفتح النموذج رسالة واتساب. قد يحتفظ مزودو الاستضافة بسجلات تقنية للتشغيل والأمان. يُرسل المحتوى الذي يختاره المسؤول للترجمة أو لأبحاث الذكاء الاصطناعي إلى مزود الخدمة المحدد. تخضع روابط واتساب وخرائط جوجل لسياسات الخدمات الخارجية.';
          (n.children || []).forEach(visit);
        };
        block.nodes.forEach(visit);
      }
    const schema = head.childNodes
      .filter((n) => n.tagName === 'script' && attr(n, 'type') === 'application/ld+json')
      .flatMap((n) => JSON.parse(n.childNodes.map((x) => x.value || '').join('')));
    result.pages.push({
      route,
      locale,
      is_legacy: true,
      document: {
        kind: 'page',
        title,
        description: attr(meta('description'), 'content'),
        ogImage: attr(meta('og:image'), 'content').replace(origin, ''),
        ogAlt: attr(meta('og:image:alt'), 'content'),
        bodyClass: attr(body, 'class'),
        blocks,
        schema,
        translationMeta: {},
      },
    });
    if (!route) {
      const index = body.childNodes.indexOf(main);
      const before = body.childNodes.slice(0, index).map(node).filter(Boolean);
      const after = body.childNodes
        .slice(index + 1)
        .map(node)
        .filter(Boolean);
      const footer = after.find((n) => n.tag === 'footer');
      const add = (n) => {
        if (n.attrs?.class === 'container footer-bottom')
          n.children.push({
            tag: 'a',
            attrs: { href: '/admin/login/', rel: 'nofollow' },
            children: [
              { text: locale === 'he' ? 'ממשק משתמש / ניהול אתר' : 'حساب المستخدم / إدارة الموقع' },
            ],
          });
        (n.children || []).forEach(add);
      };
      add(footer);
      result.shells[locale] = {
        route: '@shell',
        locale,
        is_legacy: true,
        document: {
          kind: 'shell',
          title: 'הגדרות האתר',
          description: '',
          ogImage: '/assets/hero.jpg',
          ogAlt: '',
          blocks: [
            {
              id: 'header',
              kind: 'existing',
              label: 'כותרת עליונה ותפריט',
              slot: 'before',
              nodes: before,
            },
            {
              id: 'footer',
              kind: 'existing',
              label: 'כותרת תחתונה ויצירת קשר',
              slot: 'after',
              nodes: after,
            },
          ],
          schema: [],
          translationMeta: {},
        },
      };
    }
  }
}
const records = [...result.pages, ...Object.values(result.shells)];
function editableFields(doc) {
  const map = {};
  for (const block of doc.blocks) {
    const visit = (nodes, prefix = '') =>
      nodes.forEach((n, i) => {
        const p = prefix ? prefix + '.' + i : String(i);
        if (n.text?.trim()) map[block.id + ':' + p + ':text'] = n.text;
        for (const k of ['alt', 'title', 'placeholder'])
          if (n.attrs?.[k] !== undefined) map[block.id + ':' + p + ':' + k] = n.attrs[k];
        visit(n.children || [], p);
      });
    visit(block.nodes);
  }
  for (const k of ['title', 'description', 'ogAlt']) map['seo.' + k] = doc[k];
  return map;
}
for (const record of records) {
  const source = editableFields(
    records.find((p) => p.route === record.route && p.locale === 'he').document,
  );
  for (const [key, value] of Object.entries(editableFields(record.document)))
    record.document.translationMeta[key] = {
      manual: true,
      source: sourceFingerprint(source[key] || value),
      sourceLanguage: 'he',
    };
}
fs.writeFileSync('.generated/seed.json', JSON.stringify(result));
console.log('Prepared Next.js assets and ' + result.pages.length + ' immutable migration records.');
