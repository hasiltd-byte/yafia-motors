'use client';
import { useEffect, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { Upload } from 'tus-js-client';
import { api } from './api';
type Media = {
  id: string;
  name: string;
  mime: string;
  size: number;
  ready: boolean;
  alt: { he: string; ar: string };
  credit: string;
  published: boolean;
};
export default function MediaLibrary({
  onSelect,
}: {
  onSelect?: (url: string, alt: { he: string; ar: string }, mime: string) => void;
}) {
  const [items, setItems] = useState<Media[]>([]),
    [progress, setProgress] = useState<number | null>(null),
    [error, setError] = useState(''),
    [editing, setEditing] = useState<Media | null>(null);
  const load = () =>
    api<Media[]>('media')
      .then(setItems)
      .catch((e) => setError(e.message));
  useEffect(() => {
    void load();
  }, []);
  async function upload(file: File) {
    setError('');
    setProgress(0);
    try {
      const item = await api<{ id: string; path: string }>('media/begin', {
        name: file.name,
        mime: file.type,
        size: file.size,
      });
      const db = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      );
      const { data } = await db.auth.getSession();
      if (!data.session) throw Error('נדרשת התחברות מחדש');
      const endpoint =
        process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/\/$/, '') + '/storage/v1/upload/resumable';
      await new Promise<void>((resolve, reject) => {
        const task = new Upload(file, {
          endpoint,
          retryDelays: [0, 1000, 3000, 5000],
          headers: { authorization: 'Bearer ' + data.session!.access_token, 'x-upsert': 'false' },
          uploadDataDuringCreation: true,
          removeFingerprintOnSuccess: true,
          chunkSize: 6 * 1024 * 1024,
          metadata: {
            bucketName: 'cms-media',
            objectName: item.path,
            contentType: file.type,
            cacheControl: '3600',
          },
          onProgress: (sent, total) => setProgress(Math.round((sent / total) * 100)),
          onError: reject,
          onSuccess: () => resolve(),
        });
        task.start();
      });
      await api('media/finish', { id: item.id });
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setProgress(null);
    }
  }
  return (
    <div className="cms-media">
      <div className="cms-toolbar">
        <div>
          <h2>ספריית מדיה</h2>
          <p>תמונות עד 20MB · סרטוני MP4 ו־WebM עד 200MB</p>
        </div>
        <label className="cms-primary cms-upload">
          העלאת קובץ
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,video/mp4,video/webm"
            disabled={progress !== null}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
              e.target.value = '';
            }}
          />
        </label>
      </div>
      {progress !== null && (
        <div role="status">
          <progress value={progress} max="100" /> {progress}%
        </div>
      )}
      {error && (
        <p className="cms-error" role="alert">
          {error}
        </p>
      )}
      <div className="cms-media-grid">
        {items
          .filter((m) => m.ready)
          .map((m) => (
            <article key={m.id}>
              {m.mime.startsWith('video') ? (
                <video src={`/media/${m.id}/`} controls preload="metadata" />
              ) : (
                <img src={`/media/${m.id}/`} alt={m.alt.he || m.name} />
              )}
              <strong>{m.name}</strong>
              <small>
                {(m.size / 1024 / 1024).toFixed(1)}MB ·{' '}
                {m.published ? 'בשימוש באתר' : 'בספרייה הפרטית'}
              </small>
              <div className="cms-row">
                <button onClick={() => setEditing(structuredClone(m))}>פרטי הקובץ</button>
                {onSelect ? (
                  <button
                    className="cms-primary"
                    onClick={() => onSelect(`/media/${m.id}/`, m.alt, m.mime)}
                  >
                    בחירה
                  </button>
                ) : (
                  <button onClick={() => navigator.clipboard.writeText(`/media/${m.id}/`)}>
                    העתקת כתובת
                  </button>
                )}
              </div>
            </article>
          ))}
      </div>
      {!items.some((m) => m.ready) && (
        <div className="cms-empty">העלו תמונות וסרטונים לשימוש בדפים ובגלריות.</div>
      )}
      {editing && (
        <div className="cms-modal-backdrop">
          <div className="cms-modal" role="dialog" aria-modal="true" aria-label="פרטי הקובץ">
            <h2>פרטי הקובץ</h2>
            <label>
              תיאור תמונה בעברית
              <input
                value={editing.alt.he}
                onChange={(e) =>
                  setEditing({ ...editing, alt: { ...editing.alt, he: e.target.value } })
                }
              />
            </label>
            <label>
              תיאור תמונה בערבית
              <input
                lang="ar"
                value={editing.alt.ar}
                onChange={(e) =>
                  setEditing({ ...editing, alt: { ...editing.alt, ar: e.target.value } })
                }
              />
            </label>
            <label>
              קרדיט
              <input
                value={editing.credit}
                onChange={(e) => setEditing({ ...editing, credit: e.target.value })}
              />
            </label>
            <div className="cms-row">
              <button
                className="cms-primary"
                onClick={async () => {
                  try {
                    await api('media/update', editing);
                    setEditing(null);
                    await load();
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                שמירה
              </button>
              <button onClick={() => setEditing(null)}>סגירה</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
