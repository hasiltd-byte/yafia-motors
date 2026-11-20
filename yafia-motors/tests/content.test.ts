import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  validateDocument,
  publicationErrors,
  safeUrl,
  fields,
  fieldValue,
  setField,
  type SiteDocument,
} from '../src/lib/model';
import { newDocument, makeBlock } from '../src/lib/blocks';
import { validMediaHeader } from '../src/lib/media';
import { adminEndpoint } from '../src/components/admin/api';
import {
  createTranslationClient,
  translationSegments,
  sourceFingerprint,
} from '../src/shared/i18n/translation.mjs';
import { translationState, translationMetadata } from '../src/shared/i18n/content-state.mjs';
const seed = JSON.parse(
  fs.readFileSync(new URL('../.generated/seed.json', import.meta.url), 'utf8'),
);
test('Administration endpoints preserve query parameters outside the trailing slash', () => {
  assert.equal(adminEndpoint('pages'), '/api/admin/pages/');
  assert.equal(adminEndpoint('revisions?id=test-id'), '/api/admin/revisions/?id=test-id');
});
test('Clearing a content field keeps its editor available', () => {
  const doc = newDocument('he'),
    key = fields(doc)[0].key;
  setField(doc, key, '');
  assert.ok(fields(doc).some((f) => f.key === key));
  assert.equal(fieldValue(doc, key), '');
});
test('All 36 imported pages and both shared layouts validate without changing their content', () => {
  assert.equal(seed.pages.length, 36);
  assert.equal(new Set(seed.pages.map((p: any) => p.locale + '/' + p.route)).size, 36);
  for (const p of [...seed.pages, ...Object.values(seed.shells)] as any[]) {
    const before = JSON.stringify(p.document);
    validateDocument(p.document);
    assert.deepEqual(publicationErrors(p.document), [], p.locale + '/' + p.route);
    assert.equal(JSON.stringify(p.document), before);
  }
});
test('Unsafe executable nodes and URLs cannot enter content', () => {
  for (const url of [
    'javascript:alert(1)',
    '//evil.example',
    'data:text/html,test',
    'https:\\evil.example',
    '\nhttps://evil.example',
  ])
    assert.equal(safeUrl(url), false);
  const doc = newDocument('he');
  doc.blocks.push({
    id: 'bad',
    label: 'bad',
    kind: 'text',
    nodes: [{ tag: 'script', children: [{ text: 'alert(1)' }] }],
  });
  assert.throws(() => validateDocument(doc));
  const image = makeBlock('image', 'image');
  image.nodes[0].children![0].children![0].attrs!.src = 'javascript:alert(1)';
  doc.blocks = [image];
  assert.throws(() => validateDocument(doc));
});
test('Field edits address one stable node without altering the rest of a page', () => {
  const doc = newDocument('he');
  const items = fields(doc);
  const first = items[0];
  const before = JSON.stringify(doc.blocks[1]);
  assert.ok(setField(doc, first.key, 'כותרת מעודכנת'));
  assert.equal(fieldValue(doc, first.key), 'כותרת מעודכנת');
  assert.equal(JSON.stringify(doc.blocks[1]), before);
});
test('Publishing requires one H1 and a description', () => {
  const doc = newDocument('ar');
  assert.equal(publicationErrors(doc).length, 1);
  doc.description = 'وصف الصفحة';
  assert.deepEqual(publicationErrors(doc), []);
  doc.blocks.push(makeBlock('hero', 'extra', 'ar'));
  assert.match(publicationErrors(doc).join(), /H1/);
});
test('Content, headings, alt and link data are preserved in migration records', () => {
  for (const p of seed.pages) {
    assert.ok(p.document.title);
    assert.ok(p.document.description);
    assert.ok(p.document.ogImage.startsWith('/assets/'));
    assert.ok(fields(p.document).length > 10);
  }
});
test('Media header validation rejects HTML disguised as an image', () => {
  assert.equal(validMediaHeader('image/jpeg', Buffer.from('<script>bad</script>')), false);
  assert.equal(validMediaHeader('image/png', Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), true);
  assert.equal(validMediaHeader('image/webp', Buffer.from('RIFF0000WEBP')), true);
  assert.equal(validMediaHeader('video/mp4', Buffer.from('0000ftypisom')), true);
});
test('Translation retains manual edits and marks them stale after source changes', () => {
  const value = {
    he: 'כותרת',
    ar: 'عنوان',
    __i18n: { ar: translationMetadata('כותרת', 'he', true) },
  };
  assert.equal(translationState(value, 'ar', 'he'), 'manual');
  value.he = 'כותרת חדשה';
  assert.equal(translationState(value, 'ar', 'he'), 'stale');
  assert.equal(value.ar, 'عنوان');
});
test('Translation splits UTF-8 safely, preserves newlines and caches within its own site', async () => {
  let calls = 0;
  const provider = async ({ text }: { text: string }) => {
    calls++;
    return text;
  };
  const client = createTranslationClient({ siteId: 'test-site', provider });
  const text = 'עברית '.repeat(150) + '\nسطر جديد';
  assert.equal(await client.translate({ text, sourceLanguage: 'he', targetLanguage: 'ar' }), text);
  const first = calls;
  await client.translate({ text, sourceLanguage: 'he', targetLanguage: 'ar' });
  assert.equal(calls, first);
  assert.ok(
    translationSegments(text).every((s) => 'literal' in s || Buffer.byteLength(s.text) <= 450),
  );
});
test('Translation provider failure, abort and missing placeholders cannot produce replacement text', async () => {
  const client = createTranslationClient({
    siteId: 'test-fail',
    provider: async () => {
      throw Error('quota');
    },
  });
  await assert.rejects(
    client.translate({ text: 'שלום', sourceLanguage: 'he', targetLanguage: 'ar' }),
    /quota/,
  );
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    client.translate({
      text: 'שלום',
      sourceLanguage: 'he',
      targetLanguage: 'ar',
      signal: controller.signal,
    }),
  );
  const bad = createTranslationClient({
    siteId: 'test-placeholder',
    provider: async () => 'translated',
  });
  await assert.rejects(
    bad.translate({ text: 'Hello {name}', sourceLanguage: 'he', targetLanguage: 'ar' }),
    /משתנה/,
  );
  assert.notEqual(sourceFingerprint('a'), sourceFingerprint('b'));
});
