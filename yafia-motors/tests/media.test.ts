import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { legacyMedia } from '../src/lib/legacy-media';
const seed = JSON.parse(fs.readFileSync('.generated/seed.json', 'utf8'));
test('The media library includes the original garage photos and logo with unchanged URLs and bilingual descriptions', () => {
  const library = legacyMedia([...seed.pages, ...Object.values(seed.shells)]);
  assert.ok(library.length >= 10);
  assert.equal(new Set(library.map((m) => m.url)).size, library.length);
  for (const file of library) {
    assert.ok(file.url.startsWith('/assets/'));
    assert.ok(fs.existsSync('public' + file.url));
    assert.ok(file.alt.he.trim());
    assert.ok(file.alt.ar.trim());
    assert.equal(file.legacy, true);
  }
  for (const name of [
    'logo.svg',
    'service-engine-v2.jpg',
    'service-transmission-v2.jpg',
    'service-cooling-v2.jpg',
  ])
    assert.ok(
      library.some((m) => m.url === '/assets/' + name),
      name,
    );
});
test('Asset discovery excludes external URLs, private files and executable assets', () => {
  const library = legacyMedia([
    {
      locale: 'he',
      document: {
        blocks: [
          {
            nodes: [
              { tag: 'img', attrs: { src: '/assets/../../.env.local', alt: 'bad' } },
              { tag: 'img', attrs: { src: 'https://other.example/photo.jpg', alt: 'external' } },
              { tag: 'img', attrs: { src: '/assets/app.js', alt: 'script' } },
            ],
          },
        ],
      },
    },
  ]);
  assert.deepEqual(library, []);
});
