import { z } from 'zod';
export const locales = ['he', 'ar'] as const;
export type Locale = (typeof locales)[number];
export type ContentNode = {
  text?: string;
  editable?: boolean;
  marks?: ('strong' | 'em')[];
  tag?: string;
  attrs?: Record<string, string>;
  children?: ContentNode[];
};
export type Block = {
  id: string;
  kind: string;
  label: string;
  slot?: 'before' | 'after';
  nodes: ContentNode[];
};
export type TranslationMeta = Record<
  string,
  { manual: boolean; source?: string; sourceLanguage?: string }
>;
export type SiteDocument = {
  kind: 'page' | 'shell';
  title: string;
  description: string;
  ogImage: string;
  ogAlt: string;
  bodyClass?: string;
  blocks: Block[];
  schema: Record<string, unknown>[];
  translationMeta: TranslationMeta;
};
export type PageRecord = {
  id: string;
  site_id: string;
  route: string;
  locale: Locale;
  is_legacy: boolean;
  draft: SiteDocument;
  version: number;
  published_revision: string | null;
  updated_at: string;
};
export const SITE_ID = process.env.SITE_ID || '7a16cdaa-3c97-4791-a412-46775bd4d521';
export const ORIGIN = (process.env.SITE_ORIGIN || 'https://yafia-motors.mybizsite.co').replace(
  /\/$/,
  '',
);
export const publicPath = (locale: Locale, route: string) =>
  `/${locale}/${route ? route + '/' : ''}`;
const tags = new Set(
  'a article aside b bdi blockquote br button caption circle col colgroup dd defs details dialog div dl dt ellipse em figcaption figure footer form g h1 h2 h3 h4 h5 h6 header hr i img input label li line linearGradient main nav ol optgroup option p path picture polygon polyline rect section select small source span stop strong summary svg table tbody td textarea th thead time tr ul video'.split(
    ' ',
  ),
);
export function safeUrl(value: string) {
  return (
    !/[\u0000-\u0020\\]/.test(value) &&
    (/^(https?:|tel:|mailto:)/i.test(value) || /^\/(?!\/)/.test(value) || value.startsWith('#'))
  );
}
export function validateNodes(nodes: ContentNode[], depth = 0, budget = { count: 0 }) {
  if (depth > 45) throw Error('מבנה התוכן עמוק מדי');
  for (const n of nodes) {
    if (++budget.count > 15000) throw Error('הדף גדול מדי');
    if (n.text !== undefined) {
      if (typeof n.text !== 'string' || n.text.length > 40000) throw Error('טקסט לא תקין');
      continue;
    }
    if (!n.tag || !tags.has(n.tag)) throw Error('רכיב תוכן אינו מורשה');
    for (const [k, v] of Object.entries(n.attrs || {})) {
      if (
        typeof v !== 'string' ||
        v.length > 12000 ||
        /^on/i.test(k) ||
        ['srcdoc', 'action', 'formaction'].includes(k)
      )
        throw Error('מאפיין תוכן אינו מורשה');
      if (['href', 'src', 'poster'].includes(k) && v && !safeUrl(v))
        throw Error('כתובת קישור אינה תקינה');
      if (k === 'style' && /expression|javascript|@import|behavior|[<>]/i.test(v))
        throw Error('סגנון לא תקין');
    }
    validateNodes(n.children || [], depth + 1, budget);
  }
}
export const documentSchema = z.object({
  kind: z.enum(['page', 'shell']),
  title: z.string().min(1).max(180),
  description: z.string().max(500),
  ogImage: z.string().max(2000),
  ogAlt: z.string().max(500),
  bodyClass: z.string().optional(),
  blocks: z
    .array(
      z.object({
        id: z.string().regex(/^[a-zA-Z0-9_-]+$/),
        kind: z.string(),
        label: z.string().max(200),
        slot: z.enum(['before', 'after']).optional(),
        nodes: z.array(z.any()),
      }),
    )
    .max(100),
  schema: z.array(z.record(z.string(), z.unknown())).max(10),
  translationMeta: z.record(
    z.string(),
    z.object({
      manual: z.boolean(),
      source: z.string().optional(),
      sourceLanguage: z.string().optional(),
    }),
  ),
});
export function validateDocument(value: unknown): SiteDocument {
  const doc = documentSchema.parse(value) as SiteDocument;
  const ids = doc.blocks.map((b) => b.id);
  if (new Set(ids).size !== ids.length) throw Error('מזהה אזור כפול');
  for (const b of doc.blocks) validateNodes(b.nodes);
  if (doc.ogImage && !safeUrl(doc.ogImage)) throw Error('תמונת שיתוף לא תקינה');
  return doc;
}
export function visitNodes(
  nodes: ContentNode[],
  fn: (n: ContentNode, path: string) => void,
  prefix = '',
) {
  nodes.forEach((n, i) => {
    const path = prefix ? `${prefix}.${i}` : String(i);
    fn(n, path);
    visitNodes(n.children || [], fn, path);
  });
}
export function publicationErrors(doc: SiteDocument) {
  const errors: string[] = [];
  let h1 = 0;
  for (const b of doc.blocks)
    visitNodes(b.nodes, (n) => {
      if (n.tag === 'h1') {
        h1++;
        const text = (ns: ContentNode[]): string =>
          ns.map((x) => x.text ?? text(x.children || [])).join('');
        if (!text(n.children || []).trim()) errors.push('יש למלא את כותרת H1');
      }
      if (n.tag === 'img' && !('alt' in (n.attrs || {}))) errors.push('יש להוסיף alt לתמונה');
      if (n.tag === 'img' && n.attrs?.src?.startsWith('/media/') && !n.attrs.alt?.trim())
        errors.push('יש להוסיף תיאור לתמונה שהועלתה');
      if (
        n.tag === 'video' &&
        !n.attrs?.src &&
        !n.children?.some((c) => c.tag === 'source' && c.attrs?.src)
      )
        errors.push('יש לבחור קובץ וידאו לפני פרסום');
    });
  if (doc.kind === 'page' && h1 !== 1) errors.push('נדרשת כותרת H1 אחת בדיוק');
  if (doc.kind === 'page' && !doc.description.trim()) errors.push('יש למלא תיאור SEO');
  return errors;
}
export function getNode(doc: SiteDocument, key: string) {
  const [blockId, ...parts] = key.split(':');
  let nodes = doc.blocks.find((b) => b.id === blockId)?.nodes;
  let node: ContentNode | undefined;
  for (const index of parts[0]?.split('.') || []) {
    node = nodes?.[Number(index)];
    nodes = node?.children;
  }
  return node;
}
export function fields(doc: SiteDocument) {
  const found: { key: string; value: string; type: string; label: string }[] = [];
  for (const b of doc.blocks)
    visitNodes(b.nodes, (n, p) => {
      const key = `${b.id}:${p}`;
      if (n.text !== undefined && (n.text.trim() || n.editable))
        found.push({ key: key + ':text', value: n.text, type: 'text', label: b.label });
      for (const name of ['alt', 'title', 'placeholder'])
        if (n.attrs?.[name] !== undefined)
          found.push({ key: key + ':' + name, value: n.attrs[name], type: name, label: b.label });
    });
  return found;
}
export function fieldValue(doc: SiteDocument, key: string) {
  const parts = key.split(':');
  const node = getNode(doc, key);
  return parts[2] === 'text' ? node?.text : node?.attrs?.[parts[2]];
}
export function setField(doc: SiteDocument, key: string, value: string) {
  const node = getNode(doc, key);
  if (!node) return false;
  const name = key.split(':')[2];
  if (name === 'text') {
    node.text = value;
    node.editable = true;
  } else (node.attrs ??= {})[name] = value;
  return true;
}
export function setNodeAttribute(doc: SiteDocument, key: string, attr: string, value: string) {
  const node = getNode(doc, key);
  if (!node) return;
  const previous = node.attrs?.[attr];
  (node.attrs ??= {})[attr] = value;
  if (attr === 'src' && previous)
    for (const b of doc.blocks)
      visitNodes(b.nodes, (n) => {
        if (n.attrs?.['data-photo'] === previous) n.attrs['data-photo'] = value;
      });
}
