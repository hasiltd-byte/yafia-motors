import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
const email = process.env.CMS_OWNER_EMAIL,
  site = process.env.SITE_ID || '7a16cdaa-3c97-4791-a412-46775bd4d521';
if (!email || !process.env.SUPABASE_SERVICE_ROLE_KEY)
  throw Error('Set CMS_OWNER_EMAIL and Supabase credentials first');
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);
const check = (e) => {
  if (e) throw Error(e.message);
};
const { data: admins, error } = await db
  .from('cms_memberships')
  .select('user_id')
  .eq('site_id', site)
  .eq('role', 'admin');
check(error);
if (admins.length) throw Error('An administrator already exists. Use the admin invitation screen.');
const { data, error: e } = await db.auth.admin.generateLink({ type: 'invite', email });
check(e);
check(
  (await db.from('cms_memberships').insert({ site_id: site, user_id: data.user.id, role: 'admin' }))
    .error,
);
const origin = (process.env.CMS_ACCESS_ORIGIN || 'http://localhost:4173').replace(/\/$/, '');
const link = `${origin}/admin/confirm/?type=invite&token_hash=${data.properties.hashed_token}`;
fs.mkdirSync('qa', { recursive: true });
fs.writeFileSync('qa/owner-access.txt', link + '\n', { mode: 0o600 });
console.log(
  'One-time owner access link saved privately to qa/owner-access.txt. Do not commit or share it.',
);
