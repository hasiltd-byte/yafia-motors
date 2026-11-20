export function adminEndpoint(path: string) {
  const [pathname, query] = path.split('?', 2);
  return '/api/admin/' + pathname.replace(/\/$/, '') + '/' + (query ? '?' + query : '');
}
export async function api<T = any>(path: string, input?: unknown): Promise<T> {
  const response = await fetch(adminEndpoint(path), {
    method: input === undefined ? 'GET' : 'POST',
    headers: input === undefined ? {} : { 'Content-Type': 'application/json' },
    body: input === undefined ? undefined : JSON.stringify(input),
    cache: 'no-store',
  });
  const json = await response.json();
  if (!response.ok) {
    if (response.status === 401) window.location.assign('/admin/login/');
    throw Error(json.error || 'הפעולה לא הושלמה');
  }
  return json.data;
}
export async function auth(action: string, input: Record<string, unknown> = {}) {
  const r = await fetch('/api/auth/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...input }),
  });
  const data = await r.json();
  if (!r.ok) throw Error(data.error);
  return data;
}
