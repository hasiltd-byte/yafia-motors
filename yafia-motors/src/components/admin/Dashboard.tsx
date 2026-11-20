'use client';
import { useEffect, useState } from 'react';
import { api, auth } from './api';
import Editor from './Editor';
import MediaLibrary from './MediaLibrary';
import { fields, safeUrl, type PageRecord, type SiteDocument } from '@/lib/model';
type Task = {
  id: string;
  prompt: string;
  status: string;
  progress: string;
  error?: string;
  result?: {
    report: string;
    sources: {
      url: string;
      title: string;
      accessedAt: string;
      provider: string;
      position?: number;
      query?: string;
      location?: string;
    }[];
    proposals: {
      route: string;
      locale: string;
      document: SiteDocument;
      before?: SiteDocument;
      pageId?: string;
      baseVersion?: number;
    }[];
  };
  created_at: string;
};
const labels: Record<string, string> = {
  pages: 'דפי האתר',
  settingsPage: 'פרטי האתר ותפריטים',
  media: 'תמונות וסרטונים',
  ai: 'עוזר AI ומחקר',
  members: 'משתמשים והרשאות',
  settings: 'חיבורים ותקציב',
  audit: 'יומן פעילות',
};
const taskLabels: Record<string, string> = {
  queued: 'בתור',
  running: 'בביצוע',
  completed: 'מוכן לבדיקה',
  failed: 'נעצר',
  cancelled: 'בוטל',
};
export default function Dashboard({
  identity,
}: {
  identity: { email: string; role: 'admin' | 'editor' };
}) {
  const [editorDirty, setEditorDirty] = useState(false);
  const [tab, setTab] = useState('pages'),
    [pages, setPages] = useState<PageRecord[]>([]),
    [selected, setSelected] = useState<string | null>(null),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false),
    [query, setQuery] = useState(''),
    [create, setCreate] = useState<{
      route: string;
      sourceRoute?: string;
    } | null>(null),
    [tasks, setTasks] = useState<Task[]>([]),
    [prompt, setPrompt] = useState(''),
    [opened, setOpened] = useState<string | null>(null),
    [settings, setSettings] = useState<any>(null),
    [members, setMembers] = useState<any[]>([]),
    [audit, setAudit] = useState<any[]>([]),
    [invite, setInvite] = useState({ email: '', role: 'editor' }),
    [privateLink, setPrivateLink] = useState('');
  const notify = (m: string) => setMessage(m);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const loadPages = async () => setPages(await api('pages'));
  useEffect(() => {
    void run(loadPages);
  }, []);
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(''), 9000);
    return () => clearTimeout(timer);
  }, [message]);
  useEffect(() => {
    let stopped = false;
    const load = async () => {
      try {
        const data = await api<Task[]>('tasks');
        if (!stopped) setTasks(data);
      } catch (e) {
        if (!stopped) notify((e as Error).message);
      }
    };
    if (tab !== 'ai') return;
    void load();
    const timer = setInterval(() => void load(), 5000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [tab]);
  async function navigate(next: string) {
    if (editorDirty && !confirm('יש שינויים שלא נשמרו. לעבור למסך אחר ולוותר עליהם?')) return;
    setEditorDirty(false);
    setSelected(null);
    setTab(next);
    if (next === 'settingsPage') setSelected('@shell');
    if (['settings', 'members', 'audit'].includes(next))
      await run(async () => {
        const data = await api(next);
        if (next === 'settings') setSettings(data);
        else if (next === 'members') setMembers(data);
        else setAudit(data);
      });
  }
  const routes = [...new Set(pages.filter((p) => p.route !== '@shell').map((p) => p.route))].filter(
    (route) =>
      !query ||
      pages.filter((p) => p.route === route).some((p) => (p.route + p.draft.title).includes(query)),
  );
  const active = tasks.find((t) => t.id === opened);
  return (
    <div className="cms-workspace">
      <aside className="cms-sidebar">
        <a href="/he/" target="_blank" rel="noopener" className="cms-brand">
          <img src="/assets/logo.svg" alt="יפיע מוטורס" />
          <span>
            יפיע מוטורס<small>ניהול האתר</small>
          </span>
        </a>
        <nav aria-label="ניווט ממשק הניהול">
          {Object.entries(labels)
            .filter(
              ([key]) =>
                identity.role === 'admin' || !['members', 'settings', 'audit'].includes(key),
            )
            .map(([key, label], i) => (
              <button
                key={key}
                className={tab === key ? 'active' : ''}
                onClick={() => void navigate(key)}
              >
                <span className="cms-nav-number">0{i + 1}</span>
                {label}
              </button>
            ))}
        </nav>
        <div className="cms-sidebar-bottom">
          <small>{identity.email}</small>
          <span>{identity.role === 'admin' ? 'מנהל האתר' : 'עורך תוכן'}</span>
          <a href="/he/" target="_blank" rel="noopener">
            צפייה באתר ↗
          </a>
          <button
            onClick={() =>
              void run(async () => {
                if (editorDirty && !confirm('יש שינויים שלא נשמרו. לצאת מהחשבון ולוותר עליהם?'))
                  return;
                await auth('logout');
                window.location.assign('/admin/login/');
              })
            }
          >
            יציאה מהחשבון
          </button>
        </div>
      </aside>
      <div className="cms-main">
        <header className="cms-topbar">
          <span>סביבת העבודה שלך</span>
          <a href="/he/" target="_blank" rel="noopener">
            פתיחת האתר ↗
          </a>
        </header>
        {message && (
          <div className="cms-toast" role="status">
            <span>{message}</span>
            <button aria-label="סגירת הודעה" onClick={() => setMessage('')}>
              ×
            </button>
          </div>
        )}
        <div className="cms-content">
          {selected && pages.some((p) => p.route === selected) ? (
            <Editor
              key={selected}
              initial={pages.filter((p) => p.route === selected)}
              role={identity.role}
              availablePages={pages.filter((p) => p.locale === 'he' && p.route !== '@shell')}
              onDirty={setEditorDirty}
              onSaved={loadPages}
              notify={notify}
            />
          ) : tab === 'pages' ? (
            <>
              <div className="cms-heading">
                <span className="cms-kicker">האתר שלך, בשליטה שלך</span>
                <h1>כל התוכן. במקום אחד.</h1>
                <p>ערכו את האתר, הכינו דפים חדשים ופרסמו כשאתם מוכנים.</p>
              </div>
              <div className="cms-stats">
                <div>
                  <strong>{routes.length}</strong>
                  <span>דפי תוכן</span>
                </div>
                <div>
                  <strong>
                    {pages.filter((p) => p.route !== '@shell' && p.published_revision).length}
                  </strong>
                  <span>דפים שפורסמו בשתי השפות</span>
                </div>
                <div>
                  <strong>HE / AR</strong>
                  <span>עברית וערבית</span>
                </div>
              </div>
              <section className="cms-panel">
                <div className="cms-toolbar">
                  <input
                    placeholder="חיפוש דף…"
                    aria-label="חיפוש דף"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                  <button className="cms-primary" onClick={() => setCreate({ route: '' })}>
                    ＋ הוספת דף
                  </button>
                </div>
                <div className="cms-page-table">
                  {routes.map((route) => {
                    const pair = pages.filter((p) => p.route === route);
                    return (
                      <article key={route}>
                        <div>
                          <h2>{pair.find((p) => p.locale === 'he')?.draft.title || route}</h2>
                          <bdi>/{route || 'דף הבית'}/</bdi>
                        </div>
                        <div className="cms-statuses">
                          {pair.map((p) => (
                            <span
                              key={p.locale}
                              className={p.published_revision ? 'published' : 'draft'}
                            >
                              {p.locale.toUpperCase()} · {p.published_revision ? 'פורסם' : 'טיוטה'}
                            </span>
                          ))}
                        </div>
                        <div className="cms-row">
                          <button className="cms-primary" onClick={() => setSelected(route)}>
                            עריכה
                          </button>
                          <button onClick={() => setCreate({ route: '', sourceRoute: route })}>
                            שכפול
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
                {!routes.length && (
                  <div className="cms-empty">
                    {busy ? 'טוען דפים…' : 'לא נמצאו דפים. יש לבצע ייבוא ראשוני או ליצור דף חדש.'}
                  </div>
                )}
              </section>
            </>
          ) : null}
          {tab === 'media' && !selected && (
            <>
              <div className="cms-heading">
                <span className="cms-kicker">הסיפור בתמונה</span>
                <h1>תמונות וסרטונים</h1>
                <p>העלו מדיה, הוסיפו תיאורים ובחרו אותה מתוך עורך הדפים.</p>
              </div>
              <section className="cms-panel">
                <MediaLibrary />
              </section>
            </>
          )}
          {tab === 'ai' && !selected && (
            <>
              <div className="cms-heading">
                <span className="cms-kicker">מחקר. תוכן. החלטות שלך.</span>
                <h1>מה נעשה בשביל האתר?</h1>
                <p>בקשו מחקר מתחרים, בדיקת SEO או הכנת תוכן. שינויים מגיעים לבדיקה כטיוטות.</p>
              </div>
              <section className="cms-panel">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void run(async () => {
                      const result = await api<{ id: string }>('tasks/start', {
                        prompt,
                      });
                      setTasks(await api('tasks'));
                      setOpened(result.id);
                      setPrompt('');
                      notify('המשימה התחילה. אפשר להמשיך לעבוד ולחזור לתוצאות.');
                    });
                  }}
                >
                  <label>
                    הבקשה שלך
                    <textarea
                      rows={4}
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      required
                      minLength={5}
                      maxLength={4000}
                      placeholder="בדוק מתחרים באזור נצרת והכן הצעה למאמר חדש על טיפול בגיר"
                    />
                  </label>
                  <button className="cms-primary" disabled={busy}>
                    התחלת משימה ↗
                  </button>
                </form>
              </section>
              <div className="cms-task-layout">
                <section className="cms-panel">
                  <h2>המשימות שלך</h2>
                  {tasks.map((t) => (
                    <button
                      className={'cms-task-button ' + (opened === t.id ? 'active' : '')}
                      key={t.id}
                      onClick={() => setOpened(t.id)}
                    >
                      <strong>{t.prompt}</strong>
                      <span>
                        {taskLabels[t.status]} ·{' '}
                        {new Date(t.created_at).toLocaleDateString('he-IL')}
                      </span>
                    </button>
                  ))}
                  {!tasks.length && <p>כאן יופיעו המחקרים וההצעות שהכנתם.</p>}
                </section>
                {active && (
                  <section className="cms-panel cms-task-result">
                    <span className="cms-badge">{taskLabels[active.status]}</span>
                    <h2>{active.prompt}</h2>
                    <p role="status">{active.progress}</p>
                    {['queued', 'running'].includes(active.status) && (
                      <button
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            await api('tasks/cancel', { id: active.id });
                            setTasks(await api('tasks'));
                          })
                        }
                      >
                        ביטול משימה
                      </button>
                    )}
                    {active.error && <p className="cms-error">{active.error}</p>}
                    {active.result && (
                      <>
                        <div className="cms-report">{active.result.report}</div>
                        {active.result.sources.length > 0 && (
                          <details open>
                            <summary>מקורות ותוצאות שנבדקו</summary>
                            {active.result.sources.map((s, i) => (
                              <div className="cms-source" key={i}>
                                {safeUrl(s.url) && (
                                  <a href={s.url} rel="noopener noreferrer" target="_blank">
                                    {s.title} ↗
                                  </a>
                                )}
                                <small>
                                  {s.provider} · {new Date(s.accessedAt).toLocaleString('he-IL')}
                                  {s.position ? ' · מיקום ' + s.position : ''}
                                  {s.query ? ' · ' + s.query : ''}
                                  {s.location ? ' · ' + s.location : ''}
                                </small>
                              </div>
                            ))}
                          </details>
                        )}
                        {active.result.proposals.map((p, i) => {
                          const before = p.before
                            ? new Map(fields(p.before).map((f) => [f.key, f.value]))
                            : new Map<string, string>();
                          const changes = fields(p.document).filter(
                            (f) => before.get(f.key) !== f.value,
                          );
                          return (
                            <article key={i} className="cms-proposal">
                              <h3>{p.document.title}</h3>
                              <p>
                                <bdi>
                                  /{p.locale}/{p.route}/
                                </bdi>{' '}
                                · {p.pageId ? 'עדכון דף קיים' : 'דף חדש'}
                              </p>
                              <details>
                                <summary>השוואת התוכן לפני ואחרי</summary>
                                {p.before?.title !== p.document.title && (
                                  <div>
                                    <del>{p.before?.title || 'ללא כותרת קודמת'}</del>
                                    <ins>{p.document.title}</ins>
                                  </div>
                                )}
                                {p.before?.description !== p.document.description && (
                                  <div>
                                    <del>{p.before?.description || 'ללא תיאור קודם'}</del>
                                    <ins>{p.document.description}</ins>
                                  </div>
                                )}
                                {changes.map((f) => (
                                  <div key={f.key}>
                                    <del>{before.get(f.key) || 'תוכן חדש'}</del>
                                    <ins>{f.value}</ins>
                                  </div>
                                ))}
                              </details>
                              <button
                                className="cms-primary"
                                disabled={busy}
                                onClick={() =>
                                  void run(async () => {
                                    await api('tasks/apply', {
                                      id: active.id,
                                      index: i,
                                    });
                                    await loadPages();
                                    notify('ההצעה נשמרה כטיוטה. יש לבדוק בעורך לפני פרסום.');
                                  })
                                }
                              >
                                העברה לטיוטה לעריכה
                              </button>
                            </article>
                          );
                        })}
                      </>
                    )}
                  </section>
                )}
              </div>
            </>
          )}
          {tab === 'settings' && settings && !selected && (
            <>
              <div className="cms-heading">
                <h1>חיבורים ותקציב</h1>
                <p>שליטה בשירותי המחקר ובהיקף השימוש.</p>
              </div>
              <section className="cms-panel">
                <h2>חיבורי השירותים</h2>
                {Object.entries(settings.providers).map(([k, v]) => (
                  <p key={k}>
                    <span className={'cms-dot ' + (v ? 'connected' : '')} />
                    {k === 'openai'
                      ? 'עוזר AI'
                      : k === 'googleSearch'
                        ? 'מחקר תוצאות Google'
                        : 'Google Search Console'}{' '}
                    · {v ? 'מחובר' : 'ממתין לחיבור'}
                  </p>
                ))}
                <p>תוסף התרגום מחובר ל־MyMemory ומוגבל למכסת הספק.</p>
              </section>
              <section className="cms-panel">
                <h2>תקציב מחקר חודשי</h2>
                <p>
                  התקציב בדולר, משותף לקריאות AI ולבדיקות Google. התחייבויות למשימות פעילות נכללות
                  בחישוב.
                </p>
                <label>
                  תקציב חודשי בדולר
                  <input
                    type="number"
                    min="0"
                    max="10000"
                    step="0.5"
                    value={settings.monthly_budget_usd}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        monthly_budget_usd: Number(e.target.value),
                      })
                    }
                  />
                </label>
                <label className="cms-check">
                  <input
                    type="checkbox"
                    checked={settings.ai_enabled}
                    onChange={(e) => setSettings({ ...settings, ai_enabled: e.target.checked })}
                  />
                  הפעלת משימות מחקר בתשלום
                </label>
                <p>
                  שימוש והתחייבויות החודש: $
                  {settings.usage
                    .reduce((n: number, u: any) => n + Number(u.actual_usd ?? u.reserved_usd), 0)
                    .toFixed(4)}
                </p>
                <button
                  className="cms-primary"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await api('settings/save', {
                        budget: Number(settings.monthly_budget_usd),
                        enabled: settings.ai_enabled,
                      });
                      notify('ההגדרות נשמרו.');
                    })
                  }
                >
                  שמירת הגדרות
                </button>
                <button
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await api('cache/reset', {});
                      notify('התוכן הציבורי רוענן.');
                    })
                  }
                >
                  רענון האתר לאחר שחזור
                </button>
                <small>
                  תקציב זה חל על קריאות המחקר דרך המערכת; אחסון, תעבורה ומנויי ספקים מחויבים בנפרד.
                </small>
              </section>
            </>
          )}
          {tab === 'members' && !selected && (
            <>
              <div className="cms-heading">
                <h1>משתמשים והרשאות</h1>
                <p>מנהלים מפרסמים ומנהלים גישה; עורכים מכינים תוכן וטיוטות.</p>
              </div>
              <section className="cms-panel">
                <h2>הזמנת משתמש</h2>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void run(async () => {
                      const result = await api<{ link: string }>('members/invite', invite);
                      setPrivateLink(result.link);
                      setMembers(await api('members'));
                    });
                  }}
                >
                  <label>
                    כתובת דוא״ל
                    <input
                      type="email"
                      dir="ltr"
                      value={invite.email}
                      required
                      onChange={(e) => setInvite({ ...invite, email: e.target.value })}
                    />
                  </label>
                  <label>
                    תפקיד
                    <select
                      value={invite.role}
                      onChange={(e) => setInvite({ ...invite, role: e.target.value })}
                    >
                      <option value="editor">עורך תוכן</option>
                      <option value="admin">מנהל</option>
                    </select>
                  </label>
                  <button className="cms-primary" disabled={busy}>
                    יצירת הזמנה אישית
                  </button>
                </form>
                {privateLink && (
                  <div className="cms-notice">
                    <p>קישור אישי חד פעמי — מסרו אותו רק למשתמש שהוזמן.</p>
                    <button
                      onClick={() =>
                        void navigator.clipboard
                          .writeText(privateLink)
                          .then(() => notify('הקישור הועתק.'))
                      }
                    >
                      העתקת הקישור
                    </button>
                    <button onClick={() => setPrivateLink('')}>הסתרה</button>
                  </div>
                )}
              </section>
              <section className="cms-panel">
                {members.map((m) => (
                  <div className="cms-member" key={m.user_id}>
                    <strong>{m.email}</strong>
                    <select
                      aria-label={'תפקיד עבור ' + m.email}
                      value={m.role}
                      disabled={busy}
                      onChange={(e) =>
                        void run(async () => {
                          await api('members/role', {
                            userId: m.user_id,
                            role: e.target.value,
                          });
                          setMembers(await api('members'));
                        })
                      }
                    >
                      <option value="admin">מנהל</option>
                      <option value="editor">עורך תוכן</option>
                    </select>
                    <button
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          const result = await api<{ link: string }>('members/recovery', {
                            email: m.email,
                          });
                          setPrivateLink(result.link);
                          notify('קישור שחזור אישי מוכן להעתקה.');
                        })
                      }
                    >
                      קישור שחזור
                    </button>
                    <button
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          if (confirm('להסיר גישה של משתמש זה?')) {
                            await api('members/role', {
                              userId: m.user_id,
                              role: 'remove',
                            });
                            setMembers(await api('members'));
                          }
                        })
                      }
                    >
                      הסרת גישה
                    </button>
                  </div>
                ))}
              </section>
            </>
          )}
          {tab === 'audit' && !selected && (
            <>
              <div className="cms-heading">
                <h1>יומן פעילות</h1>
                <p>תיעוד עריכות, פרסומים ושינויי הרשאות.</p>
              </div>
              <section className="cms-panel">
                {audit.map((a) => (
                  <div className="cms-audit-row" key={a.id}>
                    <strong>
                      {(
                        {
                          draft_saved: 'שמירת טיוטה',
                          published: 'פרסום דף',
                          unpublished: 'ביטול פרסום',
                          page_created: 'יצירת דף',
                          media_uploaded: 'העלאת מדיה',
                          media_updated: 'עדכון פרטי מדיה',
                          member_invite: 'יצירת הזמנה',
                          member_recovery: 'יצירת קישור שחזור',
                          settings_updated: 'עדכון הגדרות',
                          ai_proposal_applied: 'החלת הצעת AI',
                          task_cancelled: 'ביטול משימה',
                          member_role_changed: 'שינוי הרשאות',
                        } as Record<string, string>
                      )[a.event] || a.event}
                    </strong>
                    <span>{new Date(a.created_at).toLocaleString('he-IL')}</span>
                  </div>
                ))}
              </section>
            </>
          )}
        </div>
      </div>
      {create && (
        <div className="cms-modal-backdrop">
          <div className="cms-modal" role="dialog" aria-modal="true" aria-label="יצירת דף">
            <h2>{create.sourceRoute !== undefined ? 'שכפול דף' : 'דף חדש'}</h2>
            <p>הכתובת תהיה זהה בשתי השפות, לדוגמה services/new-service.</p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  await api('pages/create', create);
                  await loadPages();
                  setTab('pages');
                  setSelected(create.route);
                  setCreate(null);
                  notify('הדף נוצר כטיוטה בשתי השפות.');
                });
              }}
            >
              <label>
                נתיב הדף
                <input
                  dir="ltr"
                  pattern="[a-z0-9-]+(/[a-z0-9-]+)*"
                  required
                  maxLength={180}
                  value={create.route}
                  onChange={(e) => setCreate({ ...create, route: e.target.value })}
                />
              </label>
              <div className="cms-row">
                <button className="cms-primary" disabled={busy}>
                  יצירת טיוטה
                </button>
                <button type="button" onClick={() => setCreate(null)}>
                  ביטול
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
