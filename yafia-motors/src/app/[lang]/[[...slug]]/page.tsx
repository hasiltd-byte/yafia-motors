import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Blocks } from '@/components/Content';
import PublicInteractions from '@/components/PublicInteractions';
import { publicDocument, publicIndex, seedPages } from '@/lib/public-data';
import { locales, ORIGIN, publicPath, type Locale } from '@/lib/model';
import { schemaFor } from '@/lib/seo';
import { collectionDocument } from '@/lib/public-content';
import { navigationDocument } from '@/lib/navigation';
type Props = { params: Promise<{ lang: string; slug?: string[] }> };
async function resolve(params: Props['params']) {
  const p = await params;
  if (!locales.includes(p.lang as Locale)) notFound();
  const locale = p.lang as Locale,
    route = (p.slug || []).join('/');
  if (route.startsWith('@')) notFound();
  const doc = await publicDocument(route, locale);
  if (!doc) notFound();
  return { locale, route, doc };
}
export function generateStaticParams() {
  return seedPages.map((p) => ({ lang: p.locale, slug: p.route ? p.route.split('/') : [] }));
}
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { doc, locale, route } = await resolve(params);
  const index = await publicIndex();
  const languages: Record<string, string> = {};
  for (const l of locales)
    if (index.some((p) => p.route === route && p.locale === l))
      languages[l] = ORIGIN + publicPath(l, route);
  if (languages.he) languages['x-default'] = languages.he;
  return {
    title: doc.title,
    description: doc.description,
    alternates: { canonical: ORIGIN + publicPath(locale, route), languages },
    robots: { index: true, follow: true, 'max-image-preview': 'large' },
    openGraph: {
      title: doc.title,
      description: doc.description,
      url: ORIGIN + publicPath(locale, route),
      siteName: locale === 'he' ? 'יפיע מוטורס' : 'يافا موتورز',
      type: route.startsWith('articles/') ? 'article' : 'website',
      locale: locale === 'ar' ? 'ar_IL' : 'he_IL',
      images: [{ url: doc.ogImage, alt: doc.ogAlt }],
    },
    twitter: {
      card: 'summary_large_image',
      title: doc.title,
      description: doc.description,
      images: [doc.ogImage],
    },
  };
}
export default async function PublicPage({ params }: Props) {
  const { locale, route, doc } = await resolve(params);
  const displayDoc = await collectionDocument(doc, route, locale);
  const sharedShell = await publicDocument('@shell', locale);
  const shell = sharedShell
    ? navigationDocument(sharedShell, route, locale, await publicIndex())
    : null;
  if (!shell) throw Error('יש לייבא את הגדרות האתר לפני פרסום');
  return (
    <div className={doc.bodyClass || 'inner-page'} lang={locale} dir="rtl">
      <Blocks document={shell} slot="before" />
      <main id="main">
        <Blocks document={displayDoc} />
      </main>
      <Blocks document={shell} slot="after" />
      {schemaFor(doc, route, locale).map((schema, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, '\\u003c') }}
        />
      ))}
      <PublicInteractions />
    </div>
  );
}
