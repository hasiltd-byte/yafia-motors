import { NextResponse, type NextRequest } from 'next/server';
import { authorize, configured, service } from '@/lib/supabase';
import { SITE_ID } from '@/lib/model';
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!configured()) return new NextResponse(null, { status: 404 });
  const { id } = await params;
  if (!/^[-a-f0-9]{36}$/i.test(id)) return new NextResponse(null, { status: 404 });
  const { data } = await service()
    .from('cms_media')
    .select('path,ready,published')
    .eq('site_id', SITE_ID)
    .eq('id', id)
    .maybeSingle();
  if (!data?.ready) return new NextResponse(null, { status: 404 });
  if (!data.published) {
    try {
      await authorize();
    } catch {
      return new NextResponse(null, { status: 404 });
    }
  }
  const signed = await service().storage.from('cms-media').createSignedUrl(data.path, 60);
  if (!signed.data) return new NextResponse(null, { status: 404 });
  return NextResponse.redirect(signed.data.signedUrl, {
    status: 307,
    headers: {
      'Cache-Control': 'private, no-store',
      'X-Robots-Tag': data.published ? 'index' : 'noindex',
    },
  });
}
