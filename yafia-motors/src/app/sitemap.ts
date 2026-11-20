import type { MetadataRoute } from 'next';
import { publicIndex } from '@/lib/public-data';
import { ORIGIN, publicPath } from '@/lib/model';
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return (await publicIndex()).map((p) => ({
    url: ORIGIN + publicPath(p.locale, p.route),
    ...(p.updated_at ? { lastModified: p.updated_at } : {}),
  }));
}
