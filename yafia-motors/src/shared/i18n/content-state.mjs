import {sourceFingerprint} from './translation.mjs';

// Locale strings stay compatible with existing public renderers.
export function translationState(value, targetLanguage, sourceLanguage) {
  if (!value?.[targetLanguage]?.trim()) return 'missing';
  const meta = value.__i18n?.[targetLanguage];
  if (!value?.[sourceLanguage]?.trim()) return 'empty-source';
  if (meta && ((meta.sourceLanguage && meta.sourceLanguage !== sourceLanguage) ||
    (meta.source && meta.source !== sourceFingerprint(value[sourceLanguage])) ||
    (meta.manual && !meta.source))) return 'stale';
  return meta?.manual ? 'manual' : 'current';
}

export function translationMetadata(text, sourceLanguage, manual = false) {
  return {manual, source:sourceFingerprint(text || ''), sourceLanguage};
}
