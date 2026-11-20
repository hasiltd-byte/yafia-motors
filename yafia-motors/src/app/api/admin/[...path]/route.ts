import { NextResponse, type NextRequest } from 'next/server';
import { revalidateTag } from 'next/cache';
import { start } from 'workflow/api';
import { authorize, service, dbCheck, HttpError, audit } from '@/lib/supabase';
import { body, failure } from '@/lib/http';
import {
  SITE_ID,
  ORIGIN,
  validateDocument,
  publicationErrors,
  type Locale,
  type SiteDocument,
} from '@/lib/model';
import { newDocument } from '@/lib/blocks';
import { mediaTypes, validMediaHeader } from '@/lib/media';
import { runResearch } from '@/workflows/research';
type Context = { params: Promise<{ path: string[] }> };
const uuid = (value: unknown) => {
  if (typeof value !== 'string' || !/^[-a-f0-9]{36}$/i.test(value))
    throw new HttpError(400, 'מזהה לא תקין');
  return value;
};
export async function GET(request: NextRequest, context: Context) {
  try {
    const { db, user, role } = await authorize();
    const path = (await context.params).path.join('/');
    let data: unknown;
    if (path === 'session') data = { email: user.email, role, userId: user.id };
    else if (path === 'pages') {
      const r = await db
        .from('cms_pages')
        .select('*')
        .eq('site_id', SITE_ID)
        .order('route')
        .order('locale');
      dbCheck(r.error);
      data = r.data;
    } else if (path === 'revisions') {
      const r = await db
        .from('cms_revisions')
        .select('*')
        .eq('site_id', SITE_ID)
        .eq('page_id', uuid(request.nextUrl.searchParams.get('id')))
        .order('version', { ascending: false })
        .limit(50);
      dbCheck(r.error);
      data = r.data;
    } else if (path === 'media') {
      const r = await db
        .from('cms_media')
        .select('*')
        .eq('site_id', SITE_ID)
        .order('created_at', { ascending: false })
        .limit(500);
      dbCheck(r.error);
      data = r.data;
    } else if (path === 'members') {
      await authorize('admin');
      const r = await db.from('cms_memberships').select('user_id,role').eq('site_id', SITE_ID);
      dbCheck(r.error);
      data = await Promise.all(
        (r.data || []).map(async (m) => {
          const {
            data: { user: u },
          } = await service().auth.admin.getUserById(m.user_id);
          return { ...m, email: u?.email };
        }),
      );
    } else if (path === 'settings') {
      await authorize('admin');
      const [settings, usage] = await Promise.all([
        db.from('cms_sites').select('*').eq('id', SITE_ID).single(),
        db
          .from('cms_usage')
          .select('provider,reserved_usd,actual_usd,created_at')
          .eq('site_id', SITE_ID)
          .gte(
            'created_at',
            new Date(
              Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1),
            ).toISOString(),
          ),
      ]);
      dbCheck(settings.error);
      dbCheck(usage.error);
      data = {
        ...settings.data,
        usage: usage.data,
        providers: {
          openai: Boolean(
            process.env.OPENAI_API_KEY &&
            process.env.OPENAI_MODEL &&
            process.env.OPENAI_INPUT_USD_PER_MILLION &&
            process.env.OPENAI_OUTPUT_USD_PER_MILLION,
          ),
          googleSearch: Boolean(
            process.env.DATAFORSEO_LOGIN &&
            process.env.DATAFORSEO_PASSWORD &&
            process.env.DATAFORSEO_MAX_REQUEST_USD,
          ),
          searchConsole: Boolean(
            process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY,
          ),
        },
      };
    } else if (path === 'tasks') {
      const r = await db
        .from('cms_ai_tasks')
        .select('*')
        .eq('site_id', SITE_ID)
        .order('created_at', { ascending: false })
        .limit(40);
      dbCheck(r.error);
      data = r.data;
    } else if (path === 'audit') {
      await authorize('admin');
      const r = await db
        .from('cms_audit')
        .select('*')
        .eq('site_id', SITE_ID)
        .order('created_at', { ascending: false })
        .limit(100);
      dbCheck(r.error);
      data = r.data;
    } else throw new HttpError(404, 'הפעולה לא נמצאה');
    return NextResponse.json({ data });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: NextRequest, context: Context) {
  try {
    const { db, user, role } = await authorize();
    const input = await body(request),
      path = (await context.params).path.join('/');
    let data: unknown = { ok: true };
    if (path === 'pages/save') {
      if (!Array.isArray(input.items) || !input.items.length || input.items.length > 2)
        throw new HttpError(400, 'בקשת שמירה לא תקינה');
      const items = input.items.map((item: { id: string; version: number; document: unknown }) => ({
        id: uuid(item.id),
        version: item.version,
        document: validateDocument(item.document),
      }));
      const current = await db
        .from('cms_pages')
        .select('id,route')
        .eq('site_id', SITE_ID)
        .in(
          'id',
          items.map((i: { id: string }) => i.id),
        );
      dbCheck(current.error);
      for (const item of items) {
        const p = current.data?.find((p) => p.id === item.id);
        if (!p) throw new HttpError(404, 'העמוד לא נמצא');
        if (item.document.kind !== (p.route === '@shell' ? 'shell' : 'page'))
          throw new HttpError(400, 'סוג עמוד אינו תקין');
      }
      const r = await db.rpc('cms_save_bundle', { s: SITE_ID, items });
      dbCheck(r.error);
      data = r.data;
    } else if (path === 'pages/create') {
      const docs: Record<string, SiteDocument> = {
        he: newDocument('he'),
        ar: newDocument('ar'),
      };
      if (input.sourceRoute !== undefined) {
        const r = await db
          .from('cms_pages')
          .select('locale,draft')
          .eq('site_id', SITE_ID)
          .eq('route', input.sourceRoute);
        dbCheck(r.error);
        for (const p of r.data || []) {
          docs[p.locale] = validateDocument(p.draft);
          if (docs[p.locale].kind !== 'page') throw new HttpError(400, 'ניתן לשכפל דפי תוכן בלבד');
        }
      }
      dbCheck((await db.rpc('cms_create_page', { s: SITE_ID, r: input.route, docs })).error);
    } else if (path === 'pages/publish' || path === 'pages/unpublish') {
      await authorize('admin');
      const id = uuid(input.id),
        remove = path.endsWith('unpublish');
      if (!remove) {
        const r = await db
          .from('cms_revisions')
          .select('document')
          .eq('site_id', SITE_ID)
          .eq('page_id', id)
          .eq('id', uuid(input.revisionId))
          .single();
        dbCheck(r.error);
        const doc = validateDocument(r.data!.document);
        const errors = publicationErrors(doc);
        if (errors.length) throw new HttpError(400, errors.join(' · '));
        const refs = [...JSON.stringify(doc).matchAll(/\/media\/([a-f0-9-]{36})\//g)].map(
          (m) => m[1],
        );
        if (refs.length) {
          const media = await db
            .from('cms_media')
            .select('id')
            .eq('site_id', SITE_ID)
            .eq('ready', true)
            .in('id', refs);
          dbCheck(media.error);
          if (new Set(refs).size !== media.data?.length)
            throw new HttpError(400, 'קובצי המדיה עדיין אינם מוכנים לפרסום');
        }
      }
      dbCheck(
        (
          await db.rpc('cms_publish', {
            s: SITE_ID,
            pid: id,
            revision: remove ? null : input.revisionId,
            expected_version: input.version,
            remove,
          })
        ).error,
      );
      revalidateTag('site-content', { expire: 0 });
    } else if (path === 'pages/restore') {
      const r = await db
        .from('cms_revisions')
        .select('document')
        .eq('site_id', SITE_ID)
        .eq('page_id', uuid(input.id))
        .eq('id', uuid(input.revisionId))
        .single();
      dbCheck(r.error);
      const doc = validateDocument(r.data!.document);
      dbCheck(
        (
          await db.rpc('cms_save_bundle', {
            s: SITE_ID,
            items: [{ id: input.id, version: input.version, document: doc }],
          })
        ).error,
      );
    } else if (path === 'media/begin') {
      const kind = mediaTypes[input.mime];
      if (
        !kind ||
        !Number.isSafeInteger(input.size) ||
        input.size < 1 ||
        input.size > kind.limit ||
        typeof input.name !== 'string'
      )
        throw new HttpError(400, 'קובץ לא נתמך או גדול מהמותר');
      const id = crypto.randomUUID(),
        storagePath = `${SITE_ID}/${user.id}/${id}.${kind.extension}`;
      dbCheck(
        (
          await service()
            .from('cms_media')
            .insert({
              id,
              site_id: SITE_ID,
              owner_id: user.id,
              path: storagePath,
              name: input.name.slice(0, 200),
              mime: input.mime,
              size: input.size,
            })
        ).error,
      );
      data = { id, path: storagePath };
    } else if (path === 'media/finish') {
      const r = await db
        .from('cms_media')
        .select('*')
        .eq('id', uuid(input.id))
        .eq('site_id', SITE_ID)
        .single();
      dbCheck(r.error);
      const m = r.data;
      const signed = await service().storage.from('cms-media').createSignedUrl(m.path, 60);
      dbCheck(signed.error);
      const head = await fetch(signed.data!.signedUrl, { method: 'HEAD' });
      if (!head.ok || Number(head.headers.get('content-length')) !== Number(m.size))
        throw new HttpError(400, 'העלאת הקובץ טרם הושלמה');
      const response = await fetch(signed.data!.signedUrl, {
        headers: { Range: 'bytes=0-63' },
      });
      const reader = response.body?.getReader();
      const first = await reader?.read();
      await reader?.cancel();
      if (!first?.value || !validMediaHeader(m.mime, first.value))
        throw new HttpError(400, 'תוכן הקובץ אינו מתאים לסוג שהוצהר');
      dbCheck(
        (
          await service()
            .from('cms_media')
            .update({ ready: true })
            .eq('site_id', SITE_ID)
            .eq('id', m.id)
        ).error,
      );
      await audit(user.id, 'media_uploaded', m.id);
      data = { url: `/media/${m.id}/` };
    } else if (path === 'media/update') {
      const alt = {
        he: String(input.alt?.he || '').slice(0, 500),
        ar: String(input.alt?.ar || '').slice(0, 500),
      };
      dbCheck(
        (
          await service()
            .from('cms_media')
            .update({ alt, credit: String(input.credit || '').slice(0, 300) })
            .eq('id', uuid(input.id))
            .eq('site_id', SITE_ID)
        ).error,
      );
      await audit(user.id, 'media_updated', input.id);
    } else if (path === 'members/invite' || path === 'members/recovery') {
      await authorize('admin');
      if (
        typeof input.email !== 'string' ||
        !/^\S+@\S+\.\S+$/.test(input.email) ||
        input.email.length > 200
      )
        throw new HttpError(400, 'כתובת דוא״ל לא תקינה');
      if (path.endsWith('recovery')) {
        const list = await db.from('cms_memberships').select('user_id').eq('site_id', SITE_ID);
        const users = await Promise.all(
          (list.data || []).map(
            async (x) => (await service().auth.admin.getUserById(x.user_id)).data.user,
          ),
        );
        if (!users.some((u) => u?.email?.toLowerCase() === input.email.toLowerCase()))
          throw new HttpError(404, 'המשתמש אינו שייך לאתר');
      }
      const type = path.endsWith('recovery') ? 'recovery' : 'invite';
      const r = await service().auth.admin.generateLink({
        type,
        email: input.email,
      });
      if (r.error) throw new HttpError(400, 'לא ניתן ליצור קישור למשתמש הזה');
      if (type === 'invite') {
        dbCheck(
          (
            await service()
              .from('cms_memberships')
              .insert({
                site_id: SITE_ID,
                user_id: r.data!.user.id,
                role: input.role === 'admin' ? 'admin' : 'editor',
              })
          ).error,
        );
      }
      await audit(user.id, 'member_' + type, r.data!.user.id);
      data = {
        link: `${process.env.CMS_ACCESS_ORIGIN?.replace(/\/$/, '') || request.nextUrl.origin}/admin/confirm/?type=${type}&token_hash=${r.data!.properties.hashed_token}`,
      };
    } else if (path === 'members/role') {
      await authorize('admin');
      dbCheck(
        (
          await db.rpc('cms_set_member_role', {
            s: SITE_ID,
            uid: uuid(input.userId),
            new_role: input.role,
          })
        ).error,
      );
    } else if (path === 'cache/reset') {
      await authorize('admin');
      revalidateTag('site-content', { expire: 0 });
      await audit(user.id, 'cache_refreshed', SITE_ID);
    } else if (path === 'settings/save') {
      await authorize('admin');
      if (
        typeof input.budget !== 'number' ||
        !Number.isFinite(input.budget) ||
        input.budget < 0 ||
        input.budget > 10000
      )
        throw new HttpError(400, 'תקציב לא תקין');
      dbCheck(
        (
          await db
            .from('cms_sites')
            .update({
              monthly_budget_usd: input.budget,
              ai_enabled: input.enabled === true,
            })
            .eq('id', SITE_ID)
        ).error,
      );
      await audit(user.id, 'settings_updated', 'budget', {
        budget: input.budget,
        enabled: input.enabled === true,
      });
    } else if (path === 'tasks/start') {
      if (
        typeof input.prompt !== 'string' ||
        input.prompt.trim().length < 5 ||
        input.prompt.length > 4000
      )
        throw new HttpError(400, 'כתבו בקשה באורך 5–4,000 תווים');
      const rate = await service().rpc('cms_claim_rate', {
        s: SITE_ID,
        b: 'ai_tasks',
        maximum: 3,
      });
      dbCheck(rate.error);
      if (!rate.data) throw new HttpError(429, 'אפשר להתחיל עד שלוש משימות בדקה');
      const settings = await db
        .from('cms_sites')
        .select('ai_enabled,monthly_budget_usd')
        .eq('id', SITE_ID)
        .single();
      dbCheck(settings.error);
      if (
        !settings.data!.ai_enabled ||
        settings.data!.monthly_budget_usd <= 0 ||
        !process.env.OPENAI_API_KEY ||
        !process.env.OPENAI_MODEL ||
        !process.env.OPENAI_INPUT_USD_PER_MILLION ||
        !process.env.OPENAI_OUTPUT_USD_PER_MILLION
      )
        throw new HttpError(400, 'יש לחבר ספק AI ולהגדיר תקציב לפני הפעלת משימות');
      const r = await service()
        .from('cms_ai_tasks')
        .insert({
          site_id: SITE_ID,
          created_by: user.id,
          prompt: input.prompt.trim(),
        })
        .select('id')
        .single();
      dbCheck(r.error);
      try {
        const run = await start(runResearch, [r.data!.id]);
        dbCheck(
          (
            await service()
              .from('cms_ai_tasks')
              .update({ run_id: run.runId })
              .eq('id', r.data!.id)
              .eq('site_id', SITE_ID)
          ).error,
        );
      } catch {
        await service()
          .from('cms_ai_tasks')
          .update({ status: 'failed', error: 'לא ניתן להתחיל את המשימה' })
          .eq('id', r.data!.id)
          .eq('site_id', SITE_ID);
        throw new HttpError(502, 'לא ניתן להתחיל את המשימה');
      }
      data = { id: r.data!.id };
    } else if (path === 'tasks/cancel') {
      dbCheck(
        (
          await service()
            .from('cms_ai_tasks')
            .update({
              status: 'cancelled',
              progress: 'בוטל על ידי משתמש',
              updated_at: new Date().toISOString(),
            })
            .eq('site_id', SITE_ID)
            .eq('id', uuid(input.id))
            .in('status', ['queued', 'running'])
        ).error,
      );
      await audit(user.id, 'task_cancelled', input.id);
    } else if (path === 'tasks/apply') {
      const r = await db
        .from('cms_ai_tasks')
        .select('result,status')
        .eq('site_id', SITE_ID)
        .eq('id', uuid(input.id))
        .single();
      dbCheck(r.error);
      if (r.data!.status !== 'completed') throw new HttpError(400, 'המשימה עדיין אינה מוכנה');
      const proposal = r.data!.result?.proposals?.[input.index];
      if (!proposal) throw new HttpError(400, 'הצעה לא נמצאה');
      const doc = validateDocument(proposal.document);
      if (proposal.pageId)
        dbCheck(
          (
            await db.rpc('cms_save_bundle', {
              s: SITE_ID,
              items: [
                {
                  id: proposal.pageId,
                  version: proposal.baseVersion,
                  document: doc,
                },
              ],
            })
          ).error,
        );
      else {
        const docs: Record<string, SiteDocument> = {
          he: newDocument('he'),
          ar: newDocument('ar'),
          [proposal.locale]: doc,
        };
        for (const candidate of r.data!.result.proposals) {
          if (
            !candidate.pageId &&
            candidate.route === proposal.route &&
            ['he', 'ar'].includes(candidate.locale)
          )
            docs[candidate.locale] = validateDocument(candidate.document);
        }
        dbCheck(
          (
            await db.rpc('cms_create_page', {
              s: SITE_ID,
              r: proposal.route,
              docs,
            })
          ).error,
        );
      }
      await audit(user.id, 'ai_proposal_applied', input.id, {
        index: input.index,
      });
    } else throw new HttpError(404, 'הפעולה לא נמצאה');
    return NextResponse.json({ data });
  } catch (e) {
    return failure(e);
  }
}
