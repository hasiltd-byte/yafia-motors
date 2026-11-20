import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { newDocument } from '../src/lib/blocks';
const A = '7a16cdaa-3c97-4791-a412-46775bd4d521',
  B = 'eeeeeeee-eeee-4eee-aeee-eeeeeeeeeeee';
const admin = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
  editor = 'bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb',
  outsider = 'cccccccc-cccc-4ccc-accc-cccccccccccc',
  otherAdmin = 'dddddddd-dddd-4ddd-addd-dddddddddddd';
test('PostgreSQL CMS workflows, tenant isolation, RLS, publication and budget integration', async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(
    `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema storage;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public,storage to anon,authenticated,service_role;grant execute on function auth.uid() to anon,authenticated,service_role;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;grant select,insert,update,delete on storage.objects to authenticated;create function storage.foldername(name text) returns text[] language sql immutable as $$select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1]$$;`,
  );
  for (const filename of fs.readdirSync('supabase/migrations').sort()) {
    const sql = fs
      .readFileSync('supabase/migrations/' + filename, 'utf8')
      .replace('create extension if not exists pgcrypto;', '');
    await db.exec(sql);
  }
  await db.query('insert into cms_sites(id,name,origin)values($1,$2,$3),($4,$5,$6)', [
    A,
    'Yafia',
    'https://yafia-motors.mybizsite.co',
    B,
    'Other',
    'https://other.example',
  ]);
  for (const id of [admin, editor, outsider, otherAdmin])
    await db.query('insert into auth.users values($1)', [id]);
  await db.query('insert into cms_memberships values($1,$2,$3),($1,$4,$5),($6,$7,$3)', [
    A,
    admin,
    'admin',
    editor,
    'editor',
    B,
    otherAdmin,
  ]);
  const as = async (role: string, user = '') => {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
    await db.exec('set role ' + role);
  };
  const doc = newDocument('he');
  doc.description = 'תיאור מקצועי לבדיקה';
  const ar = newDocument('ar');
  ar.description = 'وصف مهني للاختبار';
  let pageId = '',
    revisionId = '';
  await t.test(
    'Editor can create a bilingual draft; invalid and duplicate routes are rejected',
    async () => {
      await as('authenticated', editor);
      await db.query('select cms_create_page($1,$2,$3)', [A, 'services/test', { he: doc, ar }]);
      const pages = await db.query<any>('select * from cms_pages where site_id=$1', [A]);
      assert.equal(pages.rows.length, 2);
      pageId = pages.rows.find((p) => p.locale === 'he').id;
      await assert.rejects(
        db.query('select cms_create_page($1,$2,$3)', [A, 'services/test', { he: doc, ar }]),
        /duplicate/,
      );
      await assert.rejects(
        db.query('select cms_create_page($1,$2,$3)', [A, 'admin/private', { he: doc, ar }]),
        /INVALID_ROUTE/,
      );
    },
  );
  await t.test(
    'Drafts are invisible to anonymous callers; direct table access is denied',
    async () => {
      await as('anon');
      const r = await db.query<any>('select cms_public_page($1,$2,$3) as document', [
        A,
        'services/test',
        'he',
      ]);
      assert.equal(r.rows[0].document, null);
      await assert.rejects(db.query('select * from cms_pages'), /permission denied/);
      await assert.rejects(db.query('select cms_save_bundle($1,$2)', [A, []]), /permission denied/);
    },
  );
  await t.test(
    'Editors cannot publish, change budget, or write directly around revision checks',
    async () => {
      await as('authenticated', editor);
      const r = await db.query<any>('select id from cms_revisions where page_id=$1', [pageId]);
      revisionId = r.rows[0].id;
      await assert.rejects(
        db.query('select cms_publish($1,$2,$3,$4)', [A, pageId, revisionId, 1]),
        /FORBIDDEN/,
      );
      const result = await db.query('update cms_sites set monthly_budget_usd=50 where id=$1', [A]);
      assert.equal(result.affectedRows, 0);
      await assert.rejects(
        db.query('update cms_pages set version=100 where id=$1', [pageId]),
        /permission denied/,
      );
    },
  );
  await t.test('Other sites and uninvited accounts cannot read or mutate this site', async () => {
    await as('authenticated', otherAdmin);
    assert.equal((await db.query('select * from cms_pages')).rows.length, 0);
    await assert.rejects(
      db.query('select cms_save_bundle($1,$2)', [A, [{ id: pageId, version: 1, document: doc }]]),
      /FORBIDDEN/,
    );
    await as('authenticated', outsider);
    assert.equal((await db.query('select * from cms_memberships')).rows.length, 0);
  });
  await t.test(
    'Only the exact current revision can be published; a saved draft never changes public content',
    async () => {
      await as('authenticated', admin);
      await db.query('select cms_publish($1,$2,$3,$4)', [A, pageId, revisionId, 1]);
      const updated = structuredClone(doc);
      updated.title = 'גרסה חדשה';
      await as('authenticated', editor);
      const saved = await db.query<any>('select cms_save_bundle($1,$2) as saved', [
        A,
        [{ id: pageId, version: 1, document: updated }],
      ]);
      const next = saved.rows[0].saved[0];
      await assert.rejects(
        db.query('select cms_save_bundle($1,$2)', [A, [{ id: pageId, version: 1, document: doc }]]),
        /VERSION_CONFLICT/,
      );
      await as('anon');
      let r = await db.query<any>('select cms_public_page($1,$2,$3) as document', [
        A,
        'services/test',
        'he',
      ]);
      assert.equal(r.rows[0].document.title, doc.title);
      await as('authenticated', admin);
      await assert.rejects(
        db.query('select cms_publish($1,$2,$3,$4)', [A, pageId, revisionId, 2]),
        /VERSION_CONFLICT/,
      );
      await db.query('select cms_publish($1,$2,$3,$4)', [A, pageId, next.revision_id, 2]);
      await as('anon');
      r = await db.query<any>('select cms_public_page($1,$2,$3) as document', [
        A,
        'services/test',
        'he',
      ]);
      assert.equal(r.rows[0].document.title, 'גרסה חדשה');
      revisionId = next.revision_id;
    },
  );
  await t.test(
    'Unpublishing removes the page from public queries and sitemap index, preserving drafts',
    async () => {
      await as('authenticated', admin);
      await db.query('select cms_publish($1,$2,$3,$4,$5)', [A, pageId, null, 2, true]);
      await as('anon');
      assert.equal(
        (await db.query<any>('select cms_public_page($1,$2,$3) as d', [A, 'services/test', 'he']))
          .rows[0].d,
        null,
      );
      assert.equal((await db.query('select * from cms_public_index($1)', [A])).rows.length, 0);
      await as('authenticated', editor);
      assert.equal(
        (await db.query('select * from cms_pages where id=$1', [pageId])).rows.length,
        1,
      );
    },
  );
  await t.test(
    'Both locales save atomically; a stale version rolls back the entire bundle',
    async () => {
      await as('authenticated', editor);
      const arPage = (
        await db.query<any>("select * from cms_pages where site_id=$1 and locale='ar'", [A])
      ).rows[0];
      await assert.rejects(
        db.query('select cms_save_bundle($1,$2)', [
          A,
          [
            { id: arPage.id, version: arPage.version, document: ar },
            { id: pageId, version: 0, document: doc },
          ],
        ]),
        /VERSION_CONFLICT/,
      );
      const row = (await db.query<any>('select version from cms_pages where id=$1', [arPage.id]))
        .rows[0];
      assert.equal(row.version, arPage.version);
    },
  );
  await t.test('The last administrator cannot be removed or demoted', async () => {
    await as('authenticated', admin);
    await assert.rejects(
      db.query('select cms_set_member_role($1,$2,$3)', [A, admin, 'editor']),
      /LAST_ADMIN/,
    );
    await db.query('select cms_set_member_role($1,$2,$3)', [A, editor, 'admin']);
    await db.query('select cms_set_member_role($1,$2,$3)', [A, editor, 'editor']);
  });
  await t.test('Storage upload policies reject cross-site uploads and overwrites', async () => {
    await as('authenticated', editor);
    await db.query('insert into storage.objects(bucket_id,name) values($1,$2)', [
      'cms-media',
      `${A}/${editor}/new.jpg`,
    ]);
    await assert.rejects(
      db.query('insert into storage.objects(bucket_id,name) values($1,$2)', [
        'cms-media',
        `${B}/${editor}/bad.jpg`,
      ]),
      /row-level security/,
    );
    const result = await db.query('update storage.objects set name=$1 where name=$2', [
      'overwritten',
      `${A}/${editor}/new.jpg`,
    ]);
    assert.equal(result.affectedRows, 0);
  });
  await t.test(
    'Budget reservations enforce the aggregate ceiling and cannot be called by an editor',
    async () => {
      await as('authenticated', admin);
      await db.query('update cms_sites set monthly_budget_usd=1,ai_enabled=true where id=$1', [A]);
      await as('authenticated', editor);
      await assert.rejects(
        db.query('select cms_reserve_cost($1,$2,$3)', [A, 'openai', 0.6]),
        /permission denied/,
      );
      await as('service_role');
      await db.query('select cms_reserve_cost($1,$2,$3)', [A, 'openai', 0.6]);
      await assert.rejects(
        db.query('select cms_reserve_cost($1,$2,$3)', [A, 'openai', 0.6]),
        /BUDGET_EXCEEDED/,
      );
      assert.equal(
        (await db.query('select * from cms_usage where site_id=$1', [A])).rows.length,
        1,
      );
    },
  );
  await t.test('Rate limits are shared and fail at the configured maximum', async () => {
    await as('service_role');
    assert.equal(
      (await db.query<any>('select cms_claim_rate($1,$2,$3) as ok', [A, 'translation', 1])).rows[0]
        .ok,
      true,
    );
    assert.equal(
      (await db.query<any>('select cms_claim_rate($1,$2,$3) as ok', [A, 'translation', 1])).rows[0]
        .ok,
      false,
    );
  });
  await t.test(
    'Snapshot restore creates new versions, restores reviewed content and keeps later drafts private',
    async () => {
      await as('authenticated', admin);
      await db.query('select cms_publish($1,$2,$3,$4)', [A, pageId, revisionId, 2]);
      await as('service_role');
      const snapshot = (await db.query<any>('select cms_export_snapshot($1) as snapshot', [A]))
        .rows[0].snapshot;
      await as('authenticated', editor);
      const changed = structuredClone(doc);
      changed.title = 'שינוי לאחר הגיבוי';
      await db.query('select cms_save_bundle($1,$2)', [
        A,
        [{ id: pageId, version: 2, document: changed }],
      ]);
      await db.query('select cms_create_page($1,$2,$3)', [
        A,
        'created-after-backup',
        { he: doc, ar },
      ]);
      await as('service_role');
      await db.query('select cms_restore_snapshot($1,$2)', [A, snapshot]);
      await as('anon');
      const restored = (
        await db.query<any>('select cms_public_page($1,$2,$3) as d', [A, 'services/test', 'he'])
      ).rows[0].d;
      assert.equal(restored.title, 'גרסה חדשה');
      assert.equal(
        (
          await db.query<any>('select cms_public_page($1,$2,$3) as d', [
            A,
            'created-after-backup',
            'he',
          ])
        ).rows[0].d,
        null,
      );
      await assert.rejects(db.query('select cms_export_snapshot($1)', [A]), /permission denied/);
      await as('authenticated', editor);
      const p = (await db.query<any>('select * from cms_pages where id=$1', [pageId])).rows[0];
      assert.ok(p.version > 3);
      await db.query('select cms_save_bundle($1,$2)', [
        A,
        [{ id: pageId, version: p.version, document: changed }],
      ]);
    },
  );
  await t.test(
    'Initial import is atomic and repeatable without republishing a deliberately unpublished page',
    async () => {
      const C = 'ffffffff-ffff-4fff-afff-ffffffffffff';
      await as('service_role');
      await db.query('insert into cms_sites(id,name,origin)values($1,$2,$3)', [
        C,
        'Imported',
        'https://imported.example',
      ]);
      await db.query('insert into cms_memberships values($1,$2,$3)', [C, admin, 'admin']);
      const seed = JSON.parse(fs.readFileSync('.generated/seed.json', 'utf8')),
        entries = [...seed.pages, ...Object.values(seed.shells)];
      assert.equal(
        (await db.query<any>('select cms_import_seed($1,$2) as result', [C, entries])).rows[0]
          .result,
        'imported',
      );
      assert.equal(
        (await db.query('select * from cms_pages where site_id=$1', [C])).rows.length,
        38,
      );
      await as('authenticated', admin);
      const p = (
        await db.query<any>(
          "select * from cms_pages where site_id=$1 and route='' and locale='he'",
          [C],
        )
      ).rows[0];
      await db.query('select cms_publish($1,$2,$3,$4,$5)', [C, p.id, null, 1, true]);
      await as('service_role');
      assert.equal(
        (await db.query<any>('select cms_import_seed($1,$2) as result', [C, entries])).rows[0]
          .result,
        'already_imported',
      );
      assert.equal(
        (await db.query<any>("select cms_public_page($1,'','he') as d", [C])).rows[0].d,
        null,
      );
      assert.equal(
        (await db.query('select * from cms_pages where site_id=$1', [C])).rows.length,
        38,
      );
    },
  );
  await as('postgres');
});
