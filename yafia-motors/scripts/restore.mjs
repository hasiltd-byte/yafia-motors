import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
const file = process.argv.find((arg, i) => i > 1 && !arg.startsWith('--'));
if (!file) throw Error('Usage: npm run cms:restore -- backups/<snapshot>/snapshot.json [--apply]');
const base = path.resolve('backups'),
  resolved = path.resolve(file);
if (!resolved.startsWith(base + path.sep))
  throw Error('Select a backup inside this project backups directory');
const backup = JSON.parse(await fs.readFile(resolved, 'utf8')),
  site = process.env.SITE_ID || '7a16cdaa-3c97-4791-a412-46775bd4d521';
if (backup.format !== 1 || backup.site_id !== site) throw Error('Backup identity mismatch');
for (const item of backup.media) {
  if (path.basename(item.file) !== item.file) throw Error('Invalid backup file');
  const data = await fs.readFile(path.join(path.dirname(resolved), 'media', item.file));
  if (createHash('sha256').update(data).digest('hex') !== item.sha256)
    throw Error('Backup checksum mismatch');
}
console.log(
  'Validated backup: ' +
    backup.created_at +
    ', ' +
    backup.tables.cms_pages.length +
    ' locale records, ' +
    backup.media.length +
    ' media files.',
);
if (!process.argv.includes('--apply')) {
  console.log('Dry run only. Add --apply to restore. Back up the current database first.');
  process.exit(0);
}
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw Error('Supabase credentials required');
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);
for (const member of backup.tables.cms_memberships) {
  const { data, error } = await db.auth.admin.getUserById(member.user_id);
  if (error || !data.user) throw Error('Restore Auth users before restoring content memberships');
}
for (const item of backup.media) {
  const bytes = await fs.readFile(path.join(path.dirname(resolved), 'media', item.file));
  const { error } = await db.storage
    .from('cms-media')
    .upload(item.path, bytes, { contentType: item.mime, upsert: true });
  if (error) throw Error(error.message);
}
const { error } = await db.rpc('cms_restore_snapshot', { s: site, snapshot: backup.tables });
if (error) throw Error(error.message);
console.log(
  'Snapshot restored. Newer unrelated records were retained. Redeploy or revalidate the site cache before reopening traffic.',
);
