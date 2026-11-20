import { publicPath, type SiteDocument, type Locale, type ContentNode } from './model';
/** Keep editable shared navigation while deriving page-specific state at render time. */
export function navigationDocument(
  shared: SiteDocument,
  route: string,
  locale: Locale,
  index: { route: string; locale: Locale }[],
) {
  const shell = structuredClone(shared),
    other: Locale = locale === 'he' ? 'ar' : 'he';
  const target = index.some((p) => p.locale === other && p.route === route) ? route : '';
  const path = publicPath(locale, route),
    home = publicPath(locale, '');
  function walk(nodes: ContentNode[], inNavigation = false) {
    for (const n of nodes) {
      const isNavigation = inNavigation || (n.tag === 'nav' && n.attrs?.id === 'navigation');
      if (n.tag === 'header' && n.attrs?.class?.split(/\s+/).includes('site-header')) {
        const classes = n.attrs.class.split(/\s+/).filter((c) => c !== 'interior-header');
        if (route) classes.push('interior-header');
        n.attrs.class = classes.join(' ');
      }
      if (n.tag === 'a' && n.attrs) {
        if (n.attrs.class?.split(/\s+/).includes('language-switch') || n.attrs.lang === other)
          n.attrs.href = publicPath(other, target);
        if (isNavigation && n.attrs.href?.startsWith(home)) {
          const href = n.attrs.href.split(/[?#]/)[0];
          const active = href === home ? path === home : path === href || path.startsWith(href);
          const classes = (n.attrs.class || '').split(/\s+/).filter((c) => c && c !== 'active');
          if (active) classes.push('active');
          n.attrs.class = classes.join(' ');
        }
      }
      walk(n.children || [], isNavigation);
    }
  }
  for (const b of shell.blocks) walk(b.nodes);
  return shell;
}
