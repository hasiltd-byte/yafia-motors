'use client';
import { useEffect, useMemo, useState } from 'react';
import { api } from './api';
import MediaLibrary from './MediaLibrary';
import LocalizedField from '@/shared/i18n/LocalizedField';
import { createTranslationClient, createHttpProvider } from '@/shared/i18n/translation.mjs';
import {
  fields,
  fieldValue,
  setField,
  setNodeAttribute,
  getNode,
  visitNodes,
  publicationErrors,
  publicPath,
  type PageRecord,
  type SiteDocument,
  type Locale,
  type ContentNode,
} from '@/lib/model';
import { makeBlock, blockTypes } from '@/lib/blocks';
type Revision = {
  id: string;
  version: number;
  document: SiteDocument;
  created_at: string;
};
export default function Editor({
  initial,
  role,
  onSaved,
  notify,
  onDirty,
}: {
  initial: PageRecord[];
  role: string;
  onSaved: () => Promise<void>;
  notify: (m: string) => void;
  onDirty: (value: boolean) => void;
}) {
  const [pages, setPages] = useState(initial),
    [docs, setDocs] = useState<Record<Locale, SiteDocument>>(
      () =>
        Object.fromEntries(initial.map((p) => [p.locale, structuredClone(p.draft)])) as Record<
          Locale,
          SiteDocument
        >,
    ),
    [locale, setLocale] = useState<Locale>('he'),
    [blockId, setBlockId] = useState(initial[0]?.draft.blocks[0]?.id || ''),
    [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false),
    [auto, setAuto] = useState(false),
    [pending, setPending] = useState(new Set<string>()),
    [search, setSearch] = useState(''),
    [mediaTarget, setMediaTarget] = useState<{
      key: string;
      attr: string;
    } | null>(null),
    [history, setHistory] = useState<Revision[]>([]),
    [showHistory, setShowHistory] = useState(false),
    [newKind, setNewKind] = useState('text');
  const route = initial[0].route,
    current = pages.find((p) => p.locale === locale)!,
    doc = docs[locale] || docs.he;
  const translator = useMemo(
    () =>
      createTranslationClient({
        siteId: 'yafia-motors',
        provider: createHttpProvider({
          endpoint: '/api/translation/',
          fetcher: fetch,
          getHeaders: () => ({}),
        }),
        storage: undefined,
      }),
    [],
  );
  const onPendingChange = (id: string, active: boolean) =>
    setPending((old) => {
      const next = new Set(old);
      active ? next.add(id) : next.delete(id);
      return next;
    });
  useEffect(() => {
    onDirty(dirty);
  }, [dirty, onDirty]);
  useEffect(() => {
    const leave = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', leave);
    return () => window.removeEventListener('beforeunload', leave);
  }, [dirty]);
  const edit = (fn: (next: Record<Locale, SiteDocument>) => void) => {
    setDocs((old) => {
      const next = structuredClone(old);
      fn(next);
      return next;
    });
    setDirty(true);
  };
  async function refresh() {
    const all = await api<PageRecord[]>('pages');
    const pair = all.filter((p) => p.route === route);
    setPages(pair);
    setDocs(
      Object.fromEntries(pair.map((p) => [p.locale, p.draft])) as Record<Locale, SiteDocument>,
    );
    setDirty(false);
    await onSaved();
    return pair;
  }
  async function save() {
    const items = pages.map((p) => ({
      id: p.id,
      version: p.version,
      document: docs[p.locale],
    }));
    await api('pages/save', { items });
    const pair = await refresh();
    notify('הטיוטות נשמרו. האתר הציבורי לא השתנה.');
    return pair;
  }
  async function action(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function pairField(key: string, label: string, seo?: 'title' | 'description' | 'ogAlt') {
    const value: Record<string, any> = {};
    for (const l of ['he', 'ar'] as const) {
      value[l] = seo ? docs[l]?.[seo] : fieldValue(docs[l], key);
    }
    if (value.he === undefined || value.ar === undefined)
      return (
        <label key={key}>
          {label}
          <textarea
            value={seo ? doc[seo] : fieldValue(doc, key) || ''}
            onChange={(e) =>
              edit((next) => {
                if (seo) next[locale][seo] = e.target.value;
                else setField(next[locale], key, e.target.value);
              })
            }
          />
        </label>
      );
    value.__i18n = { ar: docs.ar.translationMeta[key] };
    return (
      <div key={key} className="cms-edit-field">
        <LocalizedField
          label={label}
          value={value}
          multiline={seo !== 'title'}
          sourceLanguage="he"
          autoTranslate={auto}
          translator={translator}
          allowTranslateMissing
          onPendingChange={onPendingChange}
          onChange={(next: Record<string, any>) =>
            edit((copy) => {
              for (const l of ['he', 'ar'] as const) {
                if (seo) copy[l][seo] = next[l];
                else setField(copy[l], key, next[l]);
                if (next.__i18n?.[l]) copy[l].translationMeta[key] = next.__i18n[l];
              }
            })
          }
        />
        {!seo && key.endsWith(':text') && (
          <div className="cms-inline-tools">
            עיצוב בשפה הנבחרת:{' '}
            {(['strong', 'em'] as const).map((mark) => (
              <button
                key={mark}
                type="button"
                aria-pressed={getNode(doc, key)?.marks?.includes(mark) || false}
                onClick={() =>
                  edit((next) => {
                    const n = getNode(next[locale], key);
                    if (n)
                      n.marks = n.marks?.includes(mark)
                        ? n.marks.filter((m) => m !== mark)
                        : [...(n.marks || []), mark];
                  })
                }
              >
                {mark === 'strong' ? 'מודגש' : 'נטוי'}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }
  const block = doc.blocks.find((b) => b.id === blockId);
  const editable = fields(doc).filter(
    (f) => f.key.startsWith(blockId + ':') && (!search || f.value.includes(search)),
  );
  const controls: { key: string; node: ContentNode }[] = [];
  if (block)
    visitNodes(block.nodes, (node, path) => {
      if (
        node.tag &&
        ((node.attrs && ['href', 'src', 'poster'].some((k) => k in node.attrs!)) ||
          /^h[1-6]$/.test(node.tag) ||
          ['ol', 'ul', 'tbody', 'tr', 'details'].includes(node.tag))
      )
        controls.push({ key: `${block.id}:${path}`, node });
    });
  return (
    <div className="cms-editor">
      <div className="cms-toolbar cms-sticky">
        <div>
          <h1>{route === '@shell' ? 'פרטי האתר והתפריטים' : doc.title}</h1>
          <p>
            <bdi>{route === '@shell' ? 'משותף לכל דפי האתר' : publicPath(locale, route)}</bdi> ·
            גרסה {current.version} · {dirty ? 'שינויים שטרם נשמרו' : 'הטיוטה שמורה'}
          </p>
        </div>
        <div className="cms-row">
          <button
            disabled={busy || pending.size > 0}
            onClick={() => {
              const preview = window.open('about:blank', '_blank');
              if (preview) preview.opener = null;
              void action(async () => {
                try {
                  const pair = dirty ? await save() : pages;
                  const p = pair.find((p) => p.locale === locale)!;
                  const revisions = await api<Revision[]>('revisions?id=' + p.id);
                  const url = `/admin/preview/${p.id}/?revision=${revisions[0].id}`;
                  if (preview) preview.location.replace(url);
                  else window.location.assign(url);
                } catch (error) {
                  preview?.close();
                  throw error;
                }
              });
            }}
          >
            תצוגה מקדימה
          </button>
          <button
            className="cms-primary"
            disabled={busy || pending.size > 0 || !dirty}
            onClick={() =>
              void action(async () => {
                await save();
              })
            }
          >
            {busy ? 'שומר…' : 'שמירת טיוטה'}
          </button>
        </div>
      </div>
      <fieldset disabled={busy} className="cms-editor-fieldset">
        <div className="cms-row cms-editor-options">
          <label>
            שפה לתצוגה ומדיה
            <select value={locale} onChange={(e) => setLocale(e.target.value as Locale)}>
              <option value="he">עברית</option>
              <option value="ar">العربية</option>
            </select>
          </label>
          <label className="cms-check">
            <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
            תרגום אוטומטי של שדות לא מוגנים
          </label>
          <small>
            {pending.size
              ? 'מתרגם… המתינו לפני שמירה'
              : 'טקסט לתרגום נשלח ל־MyMemory. יש לבדוק תרגום לפני פרסום.'}
          </small>
        </div>
        <details className="cms-panel">
          <summary>כותרות ומידע לקידום אורגני</summary>
          {pairField('seo.title', 'כותרת SEO', 'title')}
          {pairField('seo.description', 'תיאור בתוצאות החיפוש', 'description')}
          {pairField('seo.ogAlt', 'תיאור תמונת שיתוף', 'ogAlt')}
          <label>
            תמונת שיתוף
            <input
              dir="ltr"
              value={doc.ogImage}
              onChange={(e) =>
                edit((n) => {
                  n[locale].ogImage = e.target.value;
                })
              }
            />
          </label>
          <button onClick={() => setMediaTarget({ key: 'seo', attr: 'ogImage' })} type="button">
            בחירה מספריית המדיה
          </button>
        </details>
        <div className="cms-editor-layout">
          <aside className="cms-block-list">
            <h2>אזורי הדף</h2>
            {doc.blocks.map((b, i) => (
              <div className={'cms-block-row ' + (b.id === blockId ? 'active' : '')} key={b.id}>
                <button
                  type="button"
                  onClick={() => {
                    setBlockId(b.id);
                    setSearch('');
                  }}
                >
                  {b.label}
                </button>
                <div>
                  <button
                    type="button"
                    aria-label="הזזה למעלה"
                    disabled={i === 0 || doc.kind === 'shell'}
                    onClick={() =>
                      edit((next) => {
                        const a = next[locale].blocks;
                        [a[i - 1], a[i]] = [a[i], a[i - 1]];
                      })
                    }
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label="הזזה למטה"
                    disabled={i === doc.blocks.length - 1 || doc.kind === 'shell'}
                    onClick={() =>
                      edit((next) => {
                        const a = next[locale].blocks;
                        [a[i + 1], a[i]] = [a[i], a[i + 1]];
                      })
                    }
                  >
                    ↓
                  </button>
                  {doc.kind !== 'shell' && (
                    <button
                      type="button"
                      aria-label="הסרת אזור"
                      onClick={() => {
                        if (confirm('להסיר את האזור מהטיוטה?'))
                          edit((next) => {
                            next[locale].blocks = next[locale].blocks.filter((x) => x.id !== b.id);
                          });
                      }}
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>
            ))}
            {doc.kind !== 'shell' && (
              <div className="cms-add-block">
                <label>
                  הוספת אזור
                  <select value={newKind} onChange={(e) => setNewKind(e.target.value)}>
                    {Object.entries(blockTypes).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="cms-primary"
                  onClick={() => {
                    const id = crypto.randomUUID().replaceAll('-', '');
                    edit((next) => {
                      for (const l of ['he', 'ar'] as const)
                        next[l].blocks.push(makeBlock(newKind, id, l));
                    });
                    setBlockId(id);
                  }}
                >
                  ＋ הוספה לשתי השפות
                </button>
              </div>
            )}
          </aside>
          <section className="cms-panel cms-field-editor">
            <div className="cms-toolbar">
              <h2>{block?.label || 'בחרו אזור לעריכה'}</h2>
              <input
                aria-label="חיפוש טקסט באזור"
                placeholder="חיפוש טקסט באזור…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {editable.map((f, i) =>
              pairField(
                f.key,
                (f.type === 'alt'
                  ? 'תיאור תמונה'
                  : f.type === 'placeholder'
                    ? 'טקסט עזר'
                    : f.type === 'title'
                      ? 'תיאור רכיב'
                      : 'טקסט') +
                  ' ' +
                  (i + 1),
              ),
            )}
            {!!controls.length && (
              <details>
                <summary>קישורים, תמונות ומבנה</summary>
                {controls.map(({ key, node }) => (
                  <div key={key} className="cms-node-controls">
                    {node.attrs?.src && (
                      <img className="cms-thumb" src={node.attrs.src} alt={node.attrs.alt || ''} />
                    )}{' '}
                    {['src', 'href', 'poster']
                      .filter(
                        (a) =>
                          node.attrs?.[a] !== undefined ||
                          (a === 'src' && node.tag === 'video') ||
                          (a === 'poster' && node.tag === 'video'),
                      )
                      .map((attr) => (
                        <label key={attr}>
                          {attr === 'href'
                            ? 'קישור'
                            : attr === 'poster'
                              ? 'תמונת שער לסרטון'
                              : 'קובץ מדיה'}
                          <input
                            dir="ltr"
                            value={node.attrs?.[attr] || ''}
                            onChange={(e) =>
                              edit((next) => {
                                const n = getNode(next[locale], key);
                                if (n) setNodeAttribute(next[locale], key, attr, e.target.value);
                              })
                            }
                          />
                          {attr !== 'href' && (
                            <button type="button" onClick={() => setMediaTarget({ key, attr })}>
                              בחירה מהספרייה
                            </button>
                          )}
                        </label>
                      ))}
                    {node.tag && /^h[1-6]$/.test(node.tag) && (
                      <label>
                        רמת הכותרת
                        <select
                          value={node.tag}
                          onChange={(e) =>
                            edit((next) => {
                              const n = getNode(next[locale], key);
                              if (n) n.tag = e.target.value;
                            })
                          }
                        >
                          {['h1', 'h2', 'h3', 'h4'].map((t) => (
                            <option key={t}>{t}</option>
                          ))}
                        </select>
                      </label>
                    )}
                    {['ol', 'ul', 'tbody', 'tr'].includes(node.tag || '') && (
                      <div className="cms-row">
                        <span>
                          {node.tag === 'tbody'
                            ? 'שורות בטבלה'
                            : node.tag === 'tr'
                              ? 'תאים בשורה'
                              : 'פריטי רשימה'}
                          : {node.children?.length}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            edit((next) => {
                              const n = getNode(next[locale], key);
                              if (n?.children?.[0])
                                n.children.push(structuredClone(n.children[n.children.length - 1]));
                            })
                          }
                        >
                          הוספת פריט
                        </button>
                        <button
                          type="button"
                          disabled={(node.children?.length || 0) < 2}
                          onClick={() =>
                            edit((next) => {
                              getNode(next[locale], key)?.children?.pop();
                            })
                          }
                        >
                          הסרת האחרון
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </details>
            )}
          </section>
        </div>
      </fieldset>
      <section className="cms-panel cms-publishing">
        <h2>בדיקה ופרסום</h2>
        {publicationErrors(doc).map((e, i) => (
          <p className="cms-error" key={i}>
            {e}
          </p>
        ))}
        <p>
          {current.published_revision
            ? 'קיימת גרסה ציבורית של הדף. שמירה בלבד אינה מחליפה אותה.'
            : 'הדף עדיין לא פורסם בשפה הזו.'}
        </p>
        <div className="cms-row">
          {role === 'admin' && (
            <>
              <button
                className="cms-primary"
                disabled={busy || dirty || pending.size > 0 || publicationErrors(doc).length > 0}
                onClick={() =>
                  void action(async () => {
                    const revisions = await api<Revision[]>('revisions?id=' + current.id);
                    if (confirm('לפרסם את הגרסה השמורה בשפה הנבחרת?')) {
                      await api('pages/publish', {
                        id: current.id,
                        version: current.version,
                        revisionId: revisions[0].id,
                      });
                      await refresh();
                      notify('הדף פורסם בהצלחה.');
                    }
                  })
                }
              >
                פרסום הגרסה השמורה
              </button>
              {current.published_revision && route !== '@shell' && (
                <button
                  disabled={busy || dirty}
                  onClick={() =>
                    void action(async () => {
                      if (confirm('לבטל פרסום? הכתובת תחזיר 404 עד לפרסום מחדש.')) {
                        await api('pages/unpublish', {
                          id: current.id,
                          version: current.version,
                        });
                        await refresh();
                        notify('הפרסום בוטל. הטיוטה נשמרה.');
                      }
                    })
                  }
                >
                  ביטול פרסום
                </button>
              )}
            </>
          )}
          <button
            disabled={busy}
            onClick={() =>
              void action(async () => {
                setHistory(await api('revisions?id=' + current.id));
                setShowHistory(true);
              })
            }
          >
            היסטוריית גרסאות
          </button>
        </div>
      </section>
      {showHistory && (
        <div className="cms-modal-backdrop">
          <div className="cms-modal" role="dialog" aria-modal="true" aria-label="היסטוריית גרסאות">
            <div className="cms-toolbar">
              <h2>היסטוריית גרסאות</h2>
              <button onClick={() => setShowHistory(false)}>סגירה</button>
            </div>
            {history.map((r) => (
              <div key={r.id} className="cms-history-row">
                <span>
                  גרסה {r.version} · {new Date(r.created_at).toLocaleString('he-IL')}
                </span>
                <a
                  target="_blank"
                  rel="noopener"
                  href={`/admin/preview/${current.id}/?revision=${r.id}`}
                >
                  תצוגה
                </a>
                <button
                  disabled={busy || dirty}
                  onClick={() =>
                    void action(async () => {
                      await api('pages/restore', {
                        id: current.id,
                        version: current.version,
                        revisionId: r.id,
                      });
                      await refresh();
                      setShowHistory(false);
                      notify('הגרסה שוחזרה לטיוטה חדשה.');
                    })
                  }
                >
                  שחזור לטיוטה
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      {mediaTarget && (
        <div className="cms-modal-backdrop">
          <div
            className="cms-modal cms-wide"
            role="dialog"
            aria-modal="true"
            aria-label="בחירת מדיה"
          >
            <button onClick={() => setMediaTarget(null)}>סגירה</button>
            <MediaLibrary
              onSelect={(url, alt, mime) => {
                const selectedNode =
                  mediaTarget.key === 'seo' ? null : getNode(doc, mediaTarget.key);
                const video = mediaTarget.attr === 'src' && selectedNode?.tag === 'video';
                if (video !== mime.startsWith('video')) {
                  notify(
                    video ? 'יש לבחור קובץ וידאו באזור הזה.' : 'יש לבחור קובץ תמונה בשדה הזה.',
                  );
                  return;
                }
                edit((next) => {
                  if (mediaTarget.key === 'seo') {
                    next[locale].ogImage = url;
                    next[locale].ogAlt = alt[locale];
                  } else {
                    const n = getNode(next[locale], mediaTarget.key);
                    if (n) {
                      setNodeAttribute(next[locale], mediaTarget.key, mediaTarget.attr, url);
                      if (n.tag === 'img') (n.attrs ??= {}).alt = alt[locale] || '';
                      if (
                        mime.startsWith('video') &&
                        n.tag !== 'video' &&
                        mediaTarget.attr === 'src'
                      )
                        notify('יש לבחור סרטון בתוך אזור וידאו.');
                    }
                  }
                });
                setMediaTarget(null);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
