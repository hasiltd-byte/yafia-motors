import type { MetadataRoute } from 'next';
import { ORIGIN } from '@/lib/model';
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/admin/', '/api/'] },
    sitemap: ORIGIN + '/sitemap.xml',
  };
}
