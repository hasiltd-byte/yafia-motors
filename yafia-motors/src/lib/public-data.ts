import 'server-only';
import { unstable_cache } from 'next/cache';
import seed from '../../.generated/seed.json';
import { anonymous, configured, dbCheck } from './supabase';
import { SITE_ID, type Locale, type SiteDocument } from './model';
export const seedPages = seed.pages;
const backendKey = configured() ? process.env.NEXT_PUBLIC_SUPABASE_URL! : 'seed-only';
export const publicIndex = unstable_cache(
  async () => {
    if (!configured())
      return seed.pages.map((p) => ({
        route: p.route,
        locale: p.locale as Locale,
        updated_at: null,
        title: p.document.title,
        description: p.document.description,
      }));
    const { data, error } = await anonymous().rpc('cms_public_index', { s: SITE_ID });
    dbCheck(error);
    return (data || []) as {
      route: string;
      locale: Locale;
      updated_at: string | null;
      title: string;
      description: string;
    }[];
  },
  ['public-index', SITE_ID, backendKey],
  { tags: ['site-content'], revalidate: 3600 },
);
export const publicDocument = unstable_cache(
  async (route: string, locale: Locale): Promise<SiteDocument | null> => {
    if (!configured()) {
      const p =
        route === '@shell'
          ? seed.shells[locale]
          : seed.pages.find((p) => p.route === route && p.locale === locale);
      return p ? (structuredClone(p.document) as SiteDocument) : null;
    }
    const { data, error } = await anonymous().rpc('cms_public_page', {
      s: SITE_ID,
      r: route,
      l: locale,
    });
    dbCheck(error);
    return data as SiteDocument | null;
  },
  ['public-document', SITE_ID, backendKey],
  { tags: ['site-content'], revalidate: 3600 },
);
