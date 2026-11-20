type Node = {
  text?: string;
  tag?: string;
  attrs?: Record<string, string | undefined>;
  children?: Node[];
};
type RecordSource = { locale: string; document: { blocks: { nodes: Node[] }[] } };
export function legacyMedia(records: RecordSource[]) {
  const files = new Map<
    string,
    {
      id: string;
      url: string;
      legacy: true;
      name: string;
      mime: string;
      size: number;
      ready: true;
      published: true;
      alt: { he: string; ar: string };
      credit: string;
    }
  >();
  for (const record of records) {
    const walk = (nodes: Node[]) => {
      for (const node of nodes) {
        const url = node.attrs?.src;
        if (
          node.tag === 'img' &&
          url &&
          /^\/assets\/[a-z0-9_.-]+\.(?:jpg|jpeg|png|webp|svg)$/i.test(url)
        ) {
          const ext = url.split('.').pop()!.toLowerCase();
          let file = files.get(url);
          if (!file) {
            file = {
              id: 'legacy-' + url.slice(8),
              url,
              legacy: true,
              name: 'תמונה קיימת',
              mime:
                ext === 'svg'
                  ? 'image/svg+xml'
                  : ext === 'jpg' || ext === 'jpeg'
                    ? 'image/jpeg'
                    : 'image/' + ext,
              size: 0,
              ready: true,
              published: true,
              alt: { he: '', ar: '' },
              credit: '',
            };
            files.set(url, file);
          }
          if (
            (record.locale === 'he' || record.locale === 'ar') &&
            node.attrs?.alt?.trim() &&
            !file.alt[record.locale]
          )
            file.alt[record.locale] = node.attrs.alt;
        }
        walk(node.children || []);
      }
    };
    for (const block of record.document.blocks) walk(block.nodes);
  }
  for (const file of files.values())
    if (file.url === '/assets/logo.svg') {
      file.alt.he ||= 'לוגו המוסך';
      file.alt.ar ||= 'شعار الكراج';
    }
  return [...files.values()].map((file) => ({
    ...file,
    name: file.alt.he ? file.alt.he.slice(0, 65) + (file.alt.he.length > 65 ? '…' : '') : file.name,
  }));
}
