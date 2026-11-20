import {createTranslationClient, languageDirection} from './translation.mjs';

/** Portable adapter. load/save may be asynchronous; callers own authorization. */
export function createTranslationSite({siteId, languages, sourceLanguage, provider, storage, load, save}) {
  if (!Array.isArray(languages) || !languages.length || languages.length > 12 ||
      languages.some(l => !/^[a-z]{2,3}(?:-[a-zA-Z0-9]{2,8})*$/.test(l.code) || !l.label) ||
      new Set(languages.map(l => l.code)).size !== languages.length ||
      !languages.some(l => l.code === sourceLanguage)) throw new Error('Choose a source from the configured, unique languages');
  const key = `${siteId}:translation-content:v1`;
  return {
    siteId, sourceLanguage,
    languages:languages.map(l => ({...l, dir:l.dir || languageDirection(l.code)})),
    translator:createTranslationClient({siteId, provider, storage}),
    async loadContent(fallback) {
      const value = load ? await load(siteId) : JSON.parse(storage?.getItem(key) || 'null');
      return value ?? structuredClone(fallback);
    },
    async saveContent(content) {
      if (save) await save(siteId, content);
      else storage?.setItem(key, JSON.stringify(content));
    },
  };
}
