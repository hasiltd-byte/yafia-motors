import { ORIGIN, publicPath, visitNodes, type SiteDocument, type Locale } from './model';
export function schemaFor(doc: SiteDocument, route: string, locale: Locale) {
  let headline = doc.title;
  for (const b of doc.blocks)
    visitNodes(b.nodes, (n) => {
      if (n.tag === 'h1') {
        const text = (ns: typeof b.nodes): string =>
          ns.map((x) => x.text ?? text(x.children || [])).join('');
        headline = text(n.children || []);
      }
    });
  const url = ORIGIN + publicPath(locale, route);
  const organization = doc.schema.find((s) => s['@type'] === 'AutoRepair') || {
    '@context': 'https://schema.org',
    '@type': 'AutoRepair',
    '@id': ORIGIN + '/#garage',
    name: locale === 'he' ? 'יפיע מוטורס' : 'يافا موتورز',
    url: ORIGIN + publicPath(locale, ''),
    telephone: '+972506520081',
    image: ORIGIN + '/assets/hero.jpg',
  };
  return [
    organization,
    ...(route.startsWith('articles/')
      ? [
          {
            '@context': 'https://schema.org',
            '@type': 'Article',
            inLanguage: locale,
            image: new URL(doc.ogImage, ORIGIN).href,
            author: { '@id': ORIGIN + '/#garage' },
            ...(doc.schema.find((s) => s['@type'] === 'Article') || {}),
            headline: headline,
            mainEntityOfPage: url,
            description: doc.description,
          },
        ]
      : route.startsWith('services/')
        ? [
            {
              '@context': 'https://schema.org',
              '@type': 'Service',
              name: headline,
              description: doc.description,
              url,
              provider: { '@id': ORIGIN + '/#garage' },
            },
          ]
        : []),
    ...(route
      ? [
          {
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            itemListElement: [
              {
                '@type': 'ListItem',
                position: 1,
                name: locale === 'he' ? 'בית' : 'الرئيسية',
                item: ORIGIN + publicPath(locale, ''),
              },
              ...(route.includes('/')
                ? [
                    {
                      '@type': 'ListItem',
                      position: 2,
                      name: route.startsWith('services/')
                        ? locale === 'he'
                          ? 'השירותים שלנו'
                          : 'خدماتنا'
                        : locale === 'he'
                          ? 'מגזין הרכב'
                          : 'مجلة السيارات',
                      item: ORIGIN + publicPath(locale, route.split('/')[0]),
                    },
                  ]
                : []),
              {
                '@type': 'ListItem',
                position: route.includes('/') ? 3 : 2,
                name: headline,
                item: url,
              },
            ],
          },
        ]
      : []),
  ];
}
