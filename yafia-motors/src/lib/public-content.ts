import 'server-only';
import { publicDocument, publicIndex, seedPages } from './public-data';
import { publicPath, visitNodes, type ContentNode, type SiteDocument, type Locale } from './model';
export async function collectionDocument(original: SiteDocument, route: string, locale: Locale) {
  const index = await publicIndex(),
    published = new Set(
      index.filter((p) => p.locale === locale).map((p) => publicPath(locale, p.route)),
    );
  const doc = structuredClone(original);
  const templateCards: Record<string, ContentNode> = {};
  for (const b of doc.blocks)
    visitNodes(b.nodes, (n) => {
      if (n.attrs?.class === 'article-grid' && n.children?.[0])
        templateCards.articles = n.children[0];
      if (n.attrs?.class === 'services-grid' && n.children?.[0])
        templateCards.services = n.children[0];
    });
  function filter(nodes: ContentNode[]): ContentNode[] {
    return nodes
      .filter((n) => {
        if (!/\b(service-card|article-card)\b/.test(n.attrs?.class || '')) return true;
        let link = n.attrs?.href;
        visitNodes(n.children || [], (c) => {
          if (!link && c.tag === 'a') link = c.attrs?.href;
        });
        return !link || published.has(link);
      })
      .map((n) => ({ ...n, ...(n.children ? { children: filter(n.children) } : {}) }));
  }
  for (const b of doc.blocks) b.nodes = filter(b.nodes);
  if (!['articles', 'services'].includes(route) || !templateCards[route]) return doc;
  const added = index.filter(
    (p) =>
      p.locale === locale &&
      p.route.startsWith(route + '/') &&
      !seedPages.some((s) => s.locale === locale && s.route === p.route),
  );
  const cards: ContentNode[] = [];
  for (const p of added) {
    const target = await publicDocument(p.route, locale);
    if (!target) continue;
    const card = structuredClone(templateCards[route]);
    let heading = target.title;
    for (const b of target.blocks)
      visitNodes(b.nodes, (n) => {
        if (n.tag === 'h1') {
          const text = (ns: ContentNode[]): string =>
            ns.map((x) => x.text ?? text(x.children || [])).join('');
          heading = text(n.children || []);
        }
      });
    visitNodes([card], (n) => {
      if (n.tag === 'a') (n.attrs ??= {}).href = publicPath(locale, p.route);
      if (n.tag === 'img') n.attrs = { ...n.attrs, src: target.ogImage, alt: target.ogAlt };
      if (n.tag === 'p') n.children = [{ text: target.description }];
      if (n.tag === 'h3') {
        if (n.children?.[0]?.tag === 'a') n.children[0].children = [{ text: heading }];
        else n.children = [{ text: heading }];
      }
      if (n.attrs?.class === 'service-index')
        n.children = [{ text: String(8 + cards.length).padStart(2, '0') }];
    });
    cards.push(card);
  }
  for (const b of doc.blocks)
    visitNodes(b.nodes, (n) => {
      if (n.attrs?.class === (route === 'articles' ? 'article-grid' : 'services-grid'))
        (n.children ??= []).push(...cards);
    });
  return doc;
}
