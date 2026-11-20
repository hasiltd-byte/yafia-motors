import { NextResponse, type NextRequest } from 'next/server';
import { body, failure } from '@/lib/http';
import { authorize, service, HttpError, dbCheck } from '@/lib/supabase';
import { SITE_ID } from '@/lib/model';
import { createTranslationClient } from '@/shared/i18n/translation.mjs';
export async function translateText(
  text: string,
  sourceLanguage: string,
  targetLanguage: string,
  signal?: AbortSignal,
) {
  if (
    !['he', 'ar'].includes(sourceLanguage) ||
    !['he', 'ar'].includes(targetLanguage) ||
    text.length > 6000
  )
    throw new HttpError(400, 'זוג השפות או אורך הטקסט אינם נתמכים');
  return createTranslationClient({ siteId: 'yafia-motors-server' }).translate({
    text,
    sourceLanguage,
    targetLanguage,
    signal,
  });
}
export async function POST(request: NextRequest) {
  try {
    await authorize();
    const input = await body(request);
    if (typeof input.text !== 'string') throw new HttpError(400, 'נדרש טקסט');
    const { data, error } = await service().rpc('cms_claim_rate', {
      s: SITE_ID,
      b: 'translation',
      maximum: 20,
    });
    dbCheck(error);
    if (!data) throw new HttpError(429, 'בוצעו בקשות רבות. נסו שוב בעוד דקה.');
    const translation = await translateText(
      input.text,
      input.sourceLanguage,
      input.targetLanguage,
      request.signal,
    );
    return NextResponse.json({ translation });
  } catch (e) {
    if (e instanceof Error && 'code' in e)
      return NextResponse.json({ error: e.message }, { status: 502 });
    return failure(e);
  }
}
