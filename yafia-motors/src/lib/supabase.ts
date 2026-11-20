import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { SITE_ID } from './model';
export function configured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}
export function service() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL)
    throw Error('יש להשלים את הגדרות Supabase בשרת');
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
export function anonymous() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
export async function session() {
  const jar = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => jar.getAll(),
        setAll: (items) => {
          try {
            items.forEach(({ name, value, options }) =>
              jar.set(name, value, {
                ...options,
                sameSite: 'lax',
                secure: process.env.NODE_ENV === 'production',
              }),
            );
          } catch {
            /* Server Components cannot write cookies. */
          }
        },
      },
    },
  );
}
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function authorize(required: 'admin' | 'editor' = 'editor') {
  if (!configured())
    throw new HttpError(503, 'ממשק הניהול מוכן. יש לחבר פרויקט Supabase כדי להתחבר.');
  const db = await session();
  const {
    data: { user },
    error,
  } = await db.auth.getUser();
  if (error || !user) throw new HttpError(401, 'נדרשת התחברות');
  const { data: member } = await db
    .from('cms_memberships')
    .select('role')
    .eq('site_id', SITE_ID)
    .eq('user_id', user.id)
    .single();
  if (!member || (required === 'admin' && member.role !== 'admin'))
    throw new HttpError(403, 'אין הרשאה לפעולה');
  return { db, user, role: member.role as 'admin' | 'editor' };
}
export function dbCheck(error: { message: string } | null) {
  if (!error) return;
  if (error.message.includes('VERSION_CONFLICT'))
    throw new HttpError(409, 'הדף נערך בחלון אחר. יש לטעון מחדש לפני שמירה.');
  if (error.message.includes('LAST_ADMIN'))
    throw new HttpError(400, 'לא ניתן להסיר או להוריד הרשאה למנהל האחרון של האתר.');
  throw new HttpError(
    400,
    error.message.includes('duplicate') ? 'הכתובת הזו כבר קיימת' : error.message,
  );
}
export async function audit(actor: string, event: string, subject: string, details: unknown = {}) {
  const { error } = await service()
    .from('cms_audit')
    .insert({ site_id: SITE_ID, actor, event, subject, details });
  dbCheck(error);
}
