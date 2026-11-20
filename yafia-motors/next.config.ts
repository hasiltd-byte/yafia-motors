import { withWorkflow } from 'workflow/next';
import type { NextConfig } from 'next';
const config: NextConfig = {
  trailingSlash: true,
  poweredByHeader: false,
  agentRules: false,
  turbopack: { root: process.cwd() },
  serverExternalPackages: ['@supabase/supabase-js'],
  experimental: { globalNotFound: true, serverActions: { bodySizeLimit: '4mb' } },
  async redirects() {
    return [{ source: '/', destination: '/he/', permanent: true }];
  },
  async headers() {
    return [
      ...(process.env.VERCEL_ENV === 'preview'
        ? [{ source: '/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] }]
        : []),
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        ],
      },
      {
        source: '/admin/:path*',
        headers: [
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
          { key: 'Cache-Control', value: 'private, no-store' },
        ],
      },
      { source: '/api/:path*', headers: [{ key: 'Cache-Control', value: 'private, no-store' }] },
    ];
  },
};
export default withWorkflow(config);
