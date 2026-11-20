import { NextResponse, type NextRequest } from 'next/server';
import { body, failure } from '@/lib/http';
import { configured, session, authorize, HttpError } from '@/lib/supabase';
export async function POST(request: NextRequest) {
  try {
    const input = await body(request);
    if (!configured()) throw new HttpError(503, 'נדרש חיבור Supabase לפני התחברות');
    const db = await session();
    if (input.action === 'login') {
      if (
        typeof input.email !== 'string' ||
        typeof input.password !== 'string' ||
        input.password.length > 200
      )
        throw new HttpError(400, 'פרטי התחברות לא תקינים');
      const { error } = await db.auth.signInWithPassword({
        email: input.email,
        password: input.password,
      });
      if (error) throw new HttpError(401, 'כתובת הדוא״ל או הסיסמה אינם נכונים');
      try {
        await authorize();
      } catch (e) {
        await db.auth.signOut();
        throw e;
      }
    } else if (input.action === 'logout') await db.auth.signOut();
    else if (input.action === 'password') {
      await authorize();
      if (
        typeof input.password !== 'string' ||
        input.password.length < 12 ||
        input.password.length > 200
      )
        throw new HttpError(400, 'יש לבחור סיסמה באורך 12 תווים לפחות');
      const { error } = await db.auth.updateUser({ password: input.password });
      if (error) throw new HttpError(400, 'לא ניתן לעדכן את הסיסמה');
    } else throw new HttpError(400, 'פעולה לא מוכרת');
    return NextResponse.json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
