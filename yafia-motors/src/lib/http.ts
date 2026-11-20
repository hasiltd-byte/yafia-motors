import { NextResponse, type NextRequest } from 'next/server';
import { HttpError } from './supabase';
export async function body(request: NextRequest) {
  if (request.headers.get('origin') !== request.nextUrl.origin)
    throw new HttpError(403, 'בקשה ממקור לא מורשה');
  if (!request.headers.get('content-type')?.startsWith('application/json'))
    throw new HttpError(415, 'נדרשת בקשת JSON');
  const raw = await request.text();
  if (Buffer.byteLength(raw) > 3_000_000) throw new HttpError(413, 'הבקשה גדולה מדי');
  return JSON.parse(raw);
}
export function failure(e: unknown) {
  if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
  if (e instanceof SyntaxError)
    return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 });
  console.error('CMS request failed:', e instanceof Error ? e.name : 'unknown');
  return NextResponse.json(
    { error: 'לא ניתן להשלים את הפעולה. בדקו את הנתונים או את הגדרות השירות.' },
    { status: 400 },
  );
}
