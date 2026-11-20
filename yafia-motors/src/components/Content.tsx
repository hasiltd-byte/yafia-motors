import React from 'react';
import { safeUrl, type ContentNode, type SiteDocument } from '@/lib/model';
const names: Record<string, string> = {
  hreflang: 'hrefLang',
  fetchpriority: 'fetchPriority',
  class: 'className',
  for: 'htmlFor',
  tabindex: 'tabIndex',
  maxlength: 'maxLength',
  colspan: 'colSpan',
  rowspan: 'rowSpan',
  srcset: 'srcSet',
  viewbox: 'viewBox',
  'stroke-width': 'strokeWidth',
  'stroke-linecap': 'strokeLinecap',
  'stroke-linejoin': 'strokeLinejoin',
  'fill-rule': 'fillRule',
  'clip-rule': 'clipRule',
  preserveaspectratio: 'preserveAspectRatio',
  autocomplete: 'autoComplete',
  readonly: 'readOnly',
  playsinline: 'playsInline',
  crossorigin: 'crossOrigin',
};
const booleans = new Set([
  'required',
  'disabled',
  'hidden',
  'open',
  'controls',
  'playsinline',
  'muted',
  'loop',
  'readonly',
  'multiple',
  'autofocus',
]);
export function Nodes({ nodes }: { nodes: ContentNode[] }) {
  return (
    <>
      {nodes.map((n, i) => {
        if (n.text !== undefined) {
          let text: React.ReactNode = n.text;
          for (const mark of n.marks || [])
            if (mark === 'strong' || mark === 'em') text = React.createElement(mark, null, text);
          return <React.Fragment key={i}>{text}</React.Fragment>;
        }
        if (
          !n.tag ||
          ['script', 'iframe', 'object', 'embed', 'style', 'link', 'base', 'meta'].includes(n.tag)
        )
          return null;
        const props: Record<string, unknown> = { key: i };
        for (const [key, value] of Object.entries(n.attrs || {})) {
          if (/^on/i.test(key) || ['srcdoc', 'action', 'formaction', 'selected'].includes(key))
            continue;
          if (['href', 'src', 'poster'].includes(key) && !safeUrl(value)) continue;
          if (key === 'style') {
            if (/javascript|expression|@import|behavior/i.test(value)) continue;
            props.style = Object.fromEntries(
              value
                .split(';')
                .filter(Boolean)
                .map((part) => {
                  const idx = part.indexOf(':');
                  const k = part.slice(0, idx).trim();
                  return [
                    k.startsWith('--') ? k : k.replace(/-([a-z])/g, (_, c) => c.toUpperCase()),
                    part.slice(idx + 1).trim(),
                  ];
                }),
            );
          } else props[names[key] || key] = booleans.has(key) ? true : value;
        }
        if (n.tag === 'input') {
          if ('value' in props) {
            props.defaultValue = props.value;
            delete props.value;
          }
          return React.createElement(n.tag, props);
        }
        if (n.tag === 'textarea') {
          props.defaultValue = (n.children || []).map((c) => c.text || '').join('');
          return React.createElement(n.tag, props);
        }
        if (['img', 'br', 'hr', 'source', 'col'].includes(n.tag))
          return React.createElement(n.tag, props);
        return React.createElement(n.tag, props, <Nodes nodes={n.children || []} />);
      })}
    </>
  );
}
export function Blocks({ document, slot }: { document: SiteDocument; slot?: 'before' | 'after' }) {
  return (
    <>
      {document.blocks
        .filter((b) => !slot || b.slot === slot)
        .map((b) => (
          <Nodes key={b.id} nodes={b.nodes} />
        ))}
    </>
  );
}
