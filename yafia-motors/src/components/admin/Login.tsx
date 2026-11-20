'use client';
import { useState } from 'react';
import { auth } from './api';
export default function Login({ ready, password = false }: { ready: boolean; password?: boolean }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return (
    <div className="cms-login">
      <a href="/he/" className="cms-login-brand">
        <img src="/assets/logo.svg" alt="יפיע מוטורס" />
        יפיע מוטורס
      </a>
      <div className="cms-login-card">
        <span className="cms-kicker">ניהול האתר</span>
        <h1>{password ? 'בחירת סיסמה' : 'ברוכים הבאים למוסך הדיגיטלי'}</h1>
        <p>
          {password
            ? 'בחרו סיסמה אישית באורך 12 תווים לפחות.'
            : 'כניסה למנהלים ולעורכי תוכן שהוזמנו לאתר.'}
        </p>
        {!ready ? (
          <div className="cms-notice">
            <h2>חיבור המערכת</h2>
            <p>
              יש להשלים חיבור לפרויקט Supabase ייעודי, להריץ את התקנת מסד הנתונים וליצור מנהל ראשון
              לפי הוראות ההתקנה בפרויקט.
            </p>
            <p>עד להשלמת החיבור, האתר הציבורי ממשיך להציג את התוכן הקיים.</p>
          </div>
        ) : (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError('');
              const data = new FormData(e.currentTarget);
              try {
                await auth(password ? 'password' : 'login', {
                  email: data.get('email'),
                  password: data.get('password'),
                });
                window.location.assign('/admin/');
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {!password && (
              <label>
                כתובת דוא״ל
                <input name="email" type="email" required autoComplete="username" dir="ltr" />
              </label>
            )}
            <label>
              סיסמה
              <input
                name="password"
                type="password"
                required
                minLength={password ? 12 : 1}
                maxLength={200}
                autoComplete={password ? 'new-password' : 'current-password'}
                dir="ltr"
              />
            </label>
            {error && (
              <p className="cms-error" role="alert">
                {error}
              </p>
            )}
            <button className="cms-primary" disabled={busy}>
              {busy ? 'מתחבר…' : password ? 'שמירת סיסמה' : 'כניסה לממשק'}
            </button>
            {!password && <small>לשחזור גישה, פנו למנהל האתר לקבלת קישור אישי חד פעמי.</small>}
          </form>
        )}
        <a className="cms-back" href="/he/">
          חזרה לאתר ←
        </a>
      </div>
    </div>
  );
}
