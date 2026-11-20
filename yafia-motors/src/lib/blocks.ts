import type { Block, ContentNode, Locale, SiteDocument } from './model';
const el = (tag: string, text: string, attrs: Record<string, string> = {}): ContentNode => ({
  tag,
  attrs,
  children: [{ text }],
});
export const blockTypes = {
  hero: 'כותרת פתיחה',
  text: 'טקסט עשיר',
  image: 'תמונה',
  video: 'וידאו',
  gallery: 'גלריה',
  cards: 'כרטיסים',
  table: 'טבלה',
  steps: 'שלבי עבודה',
  faq: 'שאלות ותשובות',
  cta: 'כפתור פעולה',
};
export function makeBlock(
  kind: string,
  id = crypto.randomUUID().replaceAll('-', ''),
  locale: Locale = 'he',
): Block {
  const title = locale === 'he' ? 'כותרת חדשה' : 'عنوان جديد',
    paragraph = locale === 'he' ? 'תוכן חדש לעריכה' : 'محتوى جديد للتحرير';
  let nodes: ContentNode[] = [];
  if (kind === 'hero')
    nodes = [
      {
        tag: 'section',
        attrs: { class: 'page-hero' },
        children: [
          {
            tag: 'div',
            attrs: { class: 'container' },
            children: [el('h1', title), el('p', paragraph)],
          },
        ],
      },
    ];
  else if (kind === 'image')
    nodes = [
      {
        tag: 'figure',
        children: [
          {
            tag: 'img',
            attrs: { src: '/assets/hero.jpg', alt: paragraph, loading: 'lazy' },
            children: [],
          },
          el('figcaption', paragraph),
        ],
      },
    ];
  else if (kind === 'video')
    nodes = [
      {
        tag: 'video',
        attrs: { controls: '', preload: 'metadata', poster: '/assets/hero.jpg' },
        children: [
          el('p', locale === 'he' ? 'בחרו סרטון מספריית המדיה' : 'اختاروا فيديو من مكتبة الوسائط'),
        ],
      },
    ];
  else if (kind === 'gallery')
    nodes = [
      {
        tag: 'div',
        attrs: { class: 'gallery-grid' },
        children: [1, 2, 3].map(() => ({
          tag: 'img',
          attrs: { src: '/assets/hero.jpg', alt: paragraph, loading: 'lazy' },
          children: [],
        })),
      },
    ];
  else if (kind === 'table')
    nodes = [
      el('h2', title),
      {
        tag: 'table',
        children: [
          {
            tag: 'thead',
            children: [
              {
                tag: 'tr',
                children: [el('th', title, { scope: 'col' }), el('th', title, { scope: 'col' })],
              },
            ],
          },
          {
            tag: 'tbody',
            children: [{ tag: 'tr', children: [el('td', paragraph), el('td', paragraph)] }],
          },
        ],
      },
    ];
  else if (kind === 'faq')
    nodes = [
      el('h2', title),
      { tag: 'details', children: [el('summary', title), el('p', paragraph)] },
    ];
  else if (kind === 'steps')
    nodes = [
      el('h2', title),
      { tag: 'ol', children: [el('li', paragraph), el('li', paragraph), el('li', paragraph)] },
    ];
  else if (kind === 'cards')
    nodes = [
      el('h2', title),
      {
        tag: 'div',
        attrs: { class: 'services-grid' },
        children: [1, 2, 3].map(() => ({
          tag: 'article',
          attrs: { class: 'service-card' },
          children: [el('h3', title), el('p', paragraph)],
        })),
      },
    ];
  else if (kind === 'cta')
    nodes = [
      el('h2', title),
      el('p', paragraph),
      el('a', locale === 'he' ? 'דברו איתנו' : 'تواصلوا معنا', {
        class: 'btn',
        href: `/${locale}/contact/`,
      }),
    ];
  else nodes = [el('h2', title), el('p', paragraph)];
  if (kind !== 'hero')
    nodes = [
      {
        tag: 'section',
        attrs: { class: 'section container narrow prose cms-section' },
        children: nodes,
      },
    ];
  return { id, kind, label: blockTypes[kind as keyof typeof blockTypes] || 'אזור תוכן', nodes };
}
export function newDocument(locale: Locale, title?: string): SiteDocument {
  const block = makeBlock('hero', 'hero', locale);
  if (title) block.nodes[0].children![0].children![0].children![0].text = title;
  return {
    kind: 'page',
    title: title || (locale === 'he' ? 'עמוד חדש' : 'صفحة جديدة'),
    description: '',
    ogImage: '/assets/hero.jpg',
    ogAlt: '',
    bodyClass: 'inner-page',
    blocks: [block, makeBlock('text', 'intro', locale)],
    schema: [],
    translationMeta: {},
  };
}
