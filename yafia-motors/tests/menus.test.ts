import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  menuGroups,
  menuItems,
  menuLabel,
  moveMenuItem,
  removeMenuItem,
  addMenuItem,
  setMenuTarget,
} from '../src/lib/menus';
import { fields, validateDocument, type SiteDocument } from '../src/lib/model';
import { translationState } from '../src/shared/i18n/content-state.mjs';
const seed = JSON.parse(fs.readFileSync('.generated/seed.json', 'utf8'));
test('All three shared menus support insertion, destination changes and safe removal', () => {
  for (const locale of ['he', 'ar'] as const) {
    const doc = structuredClone(seed.shells[locale].document) as SiteDocument;
    assert.deepEqual(
      menuGroups(doc).map((g) => menuItems(g).length),
      [6, 5, 5],
    );
    for (const id of ['main', 'footer', 'services']) {
      const before = menuGroups(doc).find((g) => g.id === id)!;
      const count = menuItems(before).length;
      addMenuItem(doc, id, locale);
      const group = menuGroups(doc).find((g) => g.id === id)!;
      assert.equal(menuItems(group).length, count + 1);
      setMenuTarget(doc, id, count, `/${locale}/services/cooling-system/`);
      assert.equal(menuItems(group)[count].attrs?.href, `/${locale}/services/cooling-system/`);
      removeMenuItem(doc, id, count);
      assert.equal(menuItems(menuGroups(doc).find((g) => g.id === id)!).length, count);
    }
    validateDocument(doc);
  }
});
test('Reordering a bilingual menu preserves each translation manual lock and source fingerprint', () => {
  const docs = {
    he: structuredClone(seed.shells.he.document) as SiteDocument,
    ar: structuredClone(seed.shells.ar.document) as SiteDocument,
  };
  const oldMetadata = structuredClone(docs.ar.translationMeta),
    groups = menuGroups(docs.ar),
    group = groups.find((g) => g.id === 'main')!,
    originalLabel = menuLabel(menuItems(group)[0]);
  const oldField = fields(docs.ar).find(
    (f) => f.key.startsWith(group.key + '.0.') && f.type === 'text',
  )!;
  const originalMeta = oldMetadata[oldField.key];
  for (const locale of ['he', 'ar'] as const) moveMenuItem(docs[locale], 'main', 0, 1);
  const moved = menuGroups(docs.ar).find((g) => g.id === 'main')!;
  assert.equal(menuLabel(menuItems(moved)[1]), originalLabel);
  const newField = fields(docs.ar).find(
    (f) => f.key.startsWith(moved.key + '.1.') && f.type === 'text',
  )!;
  assert.deepEqual(docs.ar.translationMeta[newField.key], originalMeta);
  const heLabel = menuLabel(menuItems(menuGroups(docs.he).find((g) => g.id === 'main')!)[1]);
  assert.equal(
    translationState(
      { he: heLabel, ar: originalLabel, __i18n: { ar: docs.ar.translationMeta[newField.key] } },
      'ar',
      'he',
    ),
    'manual',
  );
  for (const locale of ['he', 'ar'] as const) moveMenuItem(docs[locale], 'main', 1, -1);
  assert.deepEqual(docs.ar.translationMeta, oldMetadata);
});
test('Menu changes retain footer headings and prevent deleting the final link', () => {
  const doc = structuredClone(seed.shells.he.document) as SiteDocument;
  const footer = menuGroups(doc).find((g) => g.id === 'footer')!,
    heading = structuredClone(footer.node.children![0]);
  moveMenuItem(doc, 'footer', 0, 1);
  assert.deepEqual(footer.node.children![0], heading);
  while (menuItems(footer).length > 1) removeMenuItem(doc, 'footer', 0);
  removeMenuItem(doc, 'footer', 0);
  assert.equal(menuItems(footer).length, 1);
  assert.deepEqual(footer.node.children![0], heading);
  validateDocument(doc);
});
