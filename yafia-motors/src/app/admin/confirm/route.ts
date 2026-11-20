import { NextResponse, type NextRequest } from 'next/server';
import { session, configured } from '@/lib/supabase';
export async function GET(request: NextRequest) {
  if (!configured()) return NextResponse.redirect(new URL('/admin/login/', request.url));
  const token_hash = request.nextUrl.searchParams.get('token_hash'),
    type = request.nextUrl.searchParams.get('type');
  if (!token_hash || !['invite', 'recovery'].includes(type || ''))
    return NextResponse.redirect(new URL('/admin/login/?error=expired', request.url));
  const db = await session();
  const { error } = await db.auth.verifyOtp({ token_hash, type: type as 'invite' | 'recovery' });
  return NextResponse.redirect(
    new URL(error ? '/admin/login/?error=expired' : '/admin/set-password/', request.url),
  );
}
