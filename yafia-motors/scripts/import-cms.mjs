import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { sourceFingerprint } from '../src/shared/i18n/translation.mjs';
const seed = JSON.parse(
  fs.readFileSync(new URL('../.generated/seed.json', import.meta.url), 'utf8'),
);
const id = process.env.SITE_ID || '7a16cdaa-3c97-4791-a412-46775bd4d521';
if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL)
  throw Error('Fill .env.local first');
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);
function check(error) {
  if (error) throw Error(error.message);
}
check(
  (
    await db
      .from('cms_sites')
      .upsert(
        { id, name: 'Yafia Motors', origin: process.env.SITE_ORIGIN || seed.origin },
        { onConflict: 'id', ignoreDuplicates: true },
      )
  ).error,
);
const entries = [...seed.pages, ...Object.values(seed.shells)];
for (const entry of entries) {
  const document = structuredClone(entry.document);
  const source = entries.find((p) => p.route === entry.route && p.locale === 'he').document;
  function texts(doc) {
    const map = {};
    for (const block of doc.blocks) {
      function visit(nodes, prefix = '') {
        nodes.forEach((n, i) => {
          const p = prefix ? prefix + '.' + i : String(i);
          if (n.text?.trim()) map[block.id + ':' + p + ':text'] = n.text;
          for (const k of ['alt', 'title', 'placeholder'])
            if (n.attrs?.[k] !== undefined) map[block.id + ':' + p + ':' + k] = n.attrs[k];
          visit(n.children || [], p);
        });
      }
      visit(block.nodes);
    }
    return map;
  }
  const he = texts(source);
  for (const [key, text] of Object.entries(texts(document)))
    document.translationMeta[key] = {
      manual: true,
      source: sourceFingerprint(he[key] || text),
      sourceLanguage: 'he',
    };
  entry.document = document;
}
check((await db.rpc('cms_import_seed', { s: id, entries })).error);
console.log('Imported 36 locale pages and 2 shared layouts. Existing CMS content was preserved.');
