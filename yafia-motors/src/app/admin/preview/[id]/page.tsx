import { notFound, redirect } from 'next/navigation';
import { authorize, dbCheck } from '@/lib/supabase';
import { SITE_ID, type SiteDocument, type Locale } from '@/lib/model';
import { publicDocument, publicIndex } from '@/lib/public-data';
import { navigationDocument } from '@/lib/navigation';
import { Blocks } from '@/components/Content';
import PublicInteractions from '@/components/PublicInteractions';
export default async function Preview({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ revision?: string }>;
}) {
  let context;
  try {
    context = await authorize();
  } catch {
    redirect('/admin/login/');
  }
  const { id } = await params,
    query = await searchParams;
  const { data: page, error } = await context.db
    .from('cms_pages')
    .select('*')
    .eq('site_id', SITE_ID)
    .eq('id', id)
    .maybeSingle();
  dbCheck(error);
  if (!page) notFound();
  let document = page.draft as SiteDocument;
  if (query.revision) {
    const r = await context.db
      .from('cms_revisions')
      .select('document')
      .eq('site_id', SITE_ID)
      .eq('page_id', id)
      .eq('id', query.revision)
      .maybeSingle();
    if (!r.data) notFound();
    document = r.data.document;
  }
  const shared =
    document.kind === 'shell' ? document : await publicDocument('@shell', page.locale as Locale);
  if (!shared) notFound();
  const shell = navigationDocument(
    shared,
    document.kind === 'shell' ? '' : page.route,
    page.locale,
    await publicIndex(),
  );
  return (
    <>
      <div className="cms-preview-bar">
        <strong>תצוגה מקדימה פרטית · {page.locale === 'he' ? 'עברית' : 'ערבית'}</strong>
        <a href="/admin/">חזרה לניהול ←</a>
      </div>
      <div className={document.bodyClass || 'inner-page'} lang={page.locale}>
        <Blocks document={shell} slot="before" />
        <main id="main">{document.kind === 'page' && <Blocks document={document} />}</main>
        <Blocks document={shell} slot="after" />
        <PublicInteractions />
      </div>
    </>
  );
}
