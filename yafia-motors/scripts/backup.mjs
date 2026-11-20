import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
const site = process.env.SITE_ID || '7a16cdaa-3c97-4791-a412-46775bd4d521';
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw Error('Supabase credentials required');
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);
const directory = path.resolve('backups', new Date().toISOString().replace(/[:.]/g, '-'));
await fs.mkdir(path.join(directory, 'media'), { recursive: true });
const snapshot = {
  format: 1,
  site_id: site,
  created_at: new Date().toISOString(),
  tables: {},
  media: [],
};
const { data: tables, error } = await db.rpc('cms_export_snapshot', { s: site });
if (error) throw Error(error.message);
snapshot.tables = tables;
for (const item of snapshot.tables.cms_media) {
  if (!item.ready) continue;
  const { data, error } = await db.storage.from('cms-media').download(item.path);
  if (error) throw Error(error.message);
  const bytes = Buffer.from(await data.arrayBuffer()),
    filename = item.id + '.bin';
  await fs.writeFile(path.join(directory, 'media', filename), bytes, { mode: 0o600 });
  snapshot.media.push({
    id: item.id,
    path: item.path,
    mime: item.mime,
    file: filename,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  });
}
await fs.writeFile(path.join(directory, 'snapshot.json'), JSON.stringify(snapshot, null, 2), {
  mode: 0o600,
});
console.log(
  'Private backup created: ' +
    directory +
    ' (content + media). Store an encrypted off-device copy.',
);
