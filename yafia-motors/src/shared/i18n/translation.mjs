export class TranslationError extends Error {
  constructor(code, message) {super(message); this.name = 'TranslationError'; this.code = code;}
}
export const languageDirection = code => /^(ar|he|fa|ur|ps|dv|yi)(-|$)/i.test(code) ? 'rtl' : 'ltr';
export const sourceFingerprint = text => {let hash = 2166136261; for (const char of text) {hash ^= char.codePointAt(0); hash = Math.imul(hash, 16777619);} return (hash >>> 0).toString(36);};
const language = code => typeof code === 'string' && /^[a-z]{2,3}(?:-[a-zA-Z0-9]{2,8})*$/.test(code);
const bytes = text => new TextEncoder().encode(text).length;
const aborted = signal => {if (signal?.aborted) throw new DOMException('Translation cancelled', 'AbortError');};
const decode = text => text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (match, entity) => {
  const named = {amp:'&', lt:'<', gt:'>', quot:'"', apos:"'", nbsp:' '};
  if (entity[0] !== '#') return named[entity.toLowerCase()] ?? match;
  const n = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
  return Number.isInteger(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : match;
});

// MyMemory accepts at most 500 UTF-8 bytes per query. Split at word boundaries
// and retain original whitespace/newlines outside the translated segments.
export function translationSegments(text, maximumBytes = 450) {
  if (!Number.isInteger(maximumBytes) || maximumBytes < 4 || maximumBytes > 500) throw new RangeError('Segment size must be between 4 and 500 UTF-8 bytes');
  const result = [];
  for (const paragraph of text.split(/(\r?\n)/)) {
    if (!paragraph.trim()) {if (paragraph) result.push({literal: paragraph}); continue;}
    const leading = paragraph.match(/^\s*/)[0], trailing = paragraph.match(/\s*$/)[0];
    if (leading) result.push({literal: leading});
    let rest = paragraph.trim();
    while (rest) {
      if (bytes(rest) <= maximumBytes) {result.push({text: rest}); break;}
      let candidate = '', size = 0;
      for (const char of rest) {const length = bytes(char); if (size + length > maximumBytes) break; candidate += char; size += length;}
      let boundary = Math.max(candidate.lastIndexOf(' '), candidate.lastIndexOf('\t'));
      if (boundary < 1) boundary = candidate.length;
      else while (boundary > 0 && /\s/.test(rest[boundary - 1])) boundary--;
      const chunk = rest.slice(0, boundary).trimEnd();
      result.push({text: chunk}); rest = rest.slice(boundary);
      const separator = rest.match(/^\s*/)[0]; if (separator) {result.push({literal: separator}); rest = rest.slice(separator.length);}
    }
    if (trailing) result.push({literal: trailing});
  }
  return result;
}

export function createMyMemoryProvider({fetcher = globalThis.fetch, timeoutMs = 18000} = {}) {
  return async ({text, sourceLanguage, targetLanguage, signal}) => {
    const controller = new AbortController(); let timedOut = false;
    const cancel = () => controller.abort(); aborted(signal); signal?.addEventListener('abort', cancel, {once: true});
    const timer = setTimeout(() => {timedOut = true; controller.abort();}, timeoutMs);
    try {
      const url = new URL('https://api.mymemory.translated.net/get');
      url.searchParams.set('q', text); url.searchParams.set('langpair', `${sourceLanguage}|${targetLanguage}`); url.searchParams.set('mt', '1');
      const response = await fetcher(url.href, {signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer'});
      const body = await response.json();
      if (response.status === 429 || body.quotaFinished || Number(body.responseStatus) === 429 || /quota|limit|next available/i.test(body.responseDetails || '')) throw new TranslationError('quota', 'מכסת שירות התרגום מוצתה. אפשר לערוך ידנית או לנסות מאוחר יותר.');
      if (!response.ok || Number(body.responseStatus) !== 200) throw new TranslationError('provider', 'שירות התרגום אינו זמין עבור הבקשה הזו. הטקסט הקיים לא השתנה.');
      const result = body.responseData?.translatedText;
      if (typeof result !== 'string' || !result.trim()) throw new TranslationError('empty', 'התקבל תרגום ריק. הטקסט הקיים לא השתנה.');
      return decode(result).trim();
    } catch (error) {
      if (signal?.aborted) throw new DOMException('Translation cancelled', 'AbortError');
      if (error instanceof TranslationError) throw error;
      throw new TranslationError(timedOut ? 'timeout' : 'network', 'לא ניתן להשלים את התרגום כרגע. אפשר לנסות שוב או לערוך ידנית.');
    } finally {clearTimeout(timer); signal?.removeEventListener('abort', cancel);}
  };
}

// Adapter for a future authenticated, server-side translator. Secret API keys
// belong in that server, never in this reusable browser module.
export const createHttpProvider = ({endpoint, fetcher = globalThis.fetch, getHeaders = () => ({})}) => async request => {
  const response = await fetcher(endpoint, {method: 'POST', headers: {'Content-Type': 'application/json', ...await getHeaders()}, body: JSON.stringify({text: request.text, sourceLanguage: request.sourceLanguage, targetLanguage: request.targetLanguage}), signal: request.signal});
  if (!response.ok) throw new TranslationError('provider', 'שירות התרגום לא הצליח להשלים את הבקשה');
  const body = await response.json(); if (typeof body.translation !== 'string' || !body.translation.trim()) throw new TranslationError('empty', 'התקבל תרגום ריק');
  return body.translation.trim();
};

export function createTranslationClient({siteId, provider = createMyMemoryProvider(), storage, cacheLimit = 100} = {}) {
  if (!/^[a-z0-9-]+$/i.test(siteId || '')) throw new Error('A separate siteId is required');
  if (!Number.isInteger(cacheLimit) || cacheLimit < 1 || cacheLimit > 500) throw new RangeError('Cache size must be between 1 and 500');
  const key = `${siteId}:translation-cache:v1`, cache = new Map(); let queue = Promise.resolve();
  try {const saved = JSON.parse(storage?.getItem(key) || '[]'); if (Array.isArray(saved)) for (const pair of saved.slice(-cacheLimit)) if (Array.isArray(pair) && typeof pair[0] === 'string' && typeof pair[1] === 'string') cache.set(...pair);} catch { /* Cache is optional. */ }
  const remember = (k, value) => {cache.delete(k); cache.set(k, value); while (cache.size > cacheLimit) cache.delete(cache.keys().next().value); try {storage?.setItem(key, JSON.stringify([...cache]));} catch { /* Translation still works without browser persistence. */ }};
  return {
    translate({text, sourceLanguage, targetLanguage, signal}) {
      if (typeof text !== 'string' || !language(sourceLanguage) || !language(targetLanguage)) return Promise.reject(new TranslationError('language', 'בדקו את הטקסט ואת קודי השפות'));
      if (text.length > 6000) return Promise.reject(new TranslationError('length', 'פצלו טקסט ארוך מ־6,000 תווים למספר שדות'));
      if (!text.trim() || sourceLanguage === targetLanguage) return Promise.resolve(text);
      const run = async () => {
        aborted(signal); const cacheKey = JSON.stringify([sourceLanguage, targetLanguage, text]);
        if (cache.has(cacheKey)) return cache.get(cacheKey);
        const result = [];
        for (const segment of translationSegments(text)) {
          aborted(signal); if ('literal' in segment) {result.push(segment.literal); continue;}
          const translated = await provider({text: segment.text, sourceLanguage, targetLanguage, signal});
          if (typeof translated !== 'string' || !translated.trim()) throw new TranslationError('empty', 'התקבל תרגום ריק');
          result.push(translated.trim());
        }
        aborted(signal); const translated = result.join('');
        for (const placeholder of text.match(/\{[a-zA-Z_][a-zA-Z0-9_]*\}/g) || []) if (!translated.includes(placeholder)) throw new TranslationError('placeholder', 'יש לבדוק את התרגום: משתנה בתבנית לא נשמר');
        remember(cacheKey, translated); return translated;
      };
      const task = queue.then(run); queue = task.catch(() => {}); return task;
    },
  };
}
