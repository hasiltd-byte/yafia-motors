import { visitNodes, type ContentNode, type SiteDocument, type Locale } from './model';
export type MenuGroup = {
  id: string;
  label: string;
  key: string;
  blockId: string;
  node: ContentNode;
};
export function menuGroups(doc: SiteDocument) {
  const groups: MenuGroup[] = [];
  for (const block of doc.blocks)
    visitNodes(block.nodes, (node, path) => {
      if (node.tag === 'nav' && node.attrs?.id === 'navigation')
        groups.push({
          id: 'main',
          label: 'תפריט ראשי',
          key: `${block.id}:${path}`,
          blockId: block.id,
          node,
        });
      if (node.attrs?.class?.split(/\s+/).includes('footer-columns')) {
        const columns =
          node.children?.map((n, i) => ({ n, i })).filter((x) => x.n.tag === 'div') || [];
        for (const [index, id, label] of [
          [1, 'footer', 'קישורים בכותרת התחתונה'],
          [2, 'services', 'שירותים בכותרת התחתונה'],
        ] as const) {
          const col = columns[index];
          if (col)
            groups.push({
              id,
              label,
              key: `${block.id}:${path}.${col.i}`,
              blockId: block.id,
              node: col.n,
            });
        }
      }
    });
  return groups;
}
export function menuLabel(node: ContentNode): string {
  return node.text ?? (node.children || []).map(menuLabel).join('');
}
export function menuItems(group: MenuGroup) {
  return (group.node.children || []).filter((n) => n.tag === 'a');
}
function changeChildren(
  doc: SiteDocument,
  id: string,
  change: (children: ContentNode[], indices: number[]) => ContentNode[],
) {
  const group = menuGroups(doc).find((g) => g.id === id);
  if (!group) throw Error('התפריט לא נמצא');
  const before = [...(group.node.children || [])],
    indices = before.map((n, i) => (n.tag === 'a' ? i : -1)).filter((i) => i >= 0);
  const after = change([...before], indices);
  const metadata: SiteDocument['translationMeta'] = {};
  for (const [key, value] of Object.entries(doc.translationMeta)) {
    let matched = false;
    for (let oldIndex = 0; oldIndex < before.length; oldIndex++) {
      const prefix = group.key + '.' + oldIndex;
      if (key.startsWith(prefix + '.') || key.startsWith(prefix + ':')) {
        matched = true;
        const nextIndex = after.indexOf(before[oldIndex]);
        if (nextIndex >= 0)
          metadata[group.key + '.' + nextIndex + key.slice(prefix.length)] = value;
        break;
      }
    }
    if (!matched) metadata[key] = value;
  }
  doc.translationMeta = metadata;
  group.node.children = after;
}
export function moveMenuItem(doc: SiteDocument, id: string, index: number, delta: number) {
  changeChildren(doc, id, (children, indices) => {
    const target = index + delta;
    if (index < 0 || target < 0 || index >= indices.length || target >= indices.length)
      return children;
    [children[indices[index]], children[indices[target]]] = [
      children[indices[target]],
      children[indices[index]],
    ];
    return children;
  });
}
export function removeMenuItem(doc: SiteDocument, id: string, index: number) {
  changeChildren(doc, id, (children, indices) => {
    if (indices.length <= 1 || indices[index] === undefined) return children;
    children.splice(indices[index], 1);
    return children;
  });
}
export function addMenuItem(doc: SiteDocument, id: string, locale: Locale) {
  changeChildren(doc, id, (children) => [
    ...children,
    {
      tag: 'a',
      attrs: { href: `/${locale}/contact/`, class: '' },
      children: [{ text: locale === 'he' ? 'קישור חדש' : 'رابط جديد', editable: true }],
    },
  ]);
}
export function setMenuTarget(doc: SiteDocument, id: string, index: number, href: string) {
  const group = menuGroups(doc).find((g) => g.id === id);
  const item = group && menuItems(group)[index];
  if (item) (item.attrs ??= {}).href = href;
}
