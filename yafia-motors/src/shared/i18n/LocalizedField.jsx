import React, {useEffect, useId, useRef, useState} from 'react';
import {languageDirection} from './translation.mjs';
import {translationState, translationMetadata} from './content-state.mjs';
import './localized-field.css';

export const HEBREW_ARABIC = [{code:'he', label:'עברית', dir:'rtl'}, {code:'ar', label:'ערבית', dir:'rtl'}];
export default function LocalizedField({label, value = {}, onChange, multiline = false, languages = HEBREW_ARABIC, sourceLanguage = 'he', autoTranslate = true, translator, onPendingChange, allowTranslateMissing = false}) {
  const id = useId(), latest = useRef(value), update = useRef(onChange), pending = useRef(onPendingChange), controllers = useRef(new Map()), alive = useRef(true), handledSource = useRef(value[sourceLanguage] || '');
  const [statuses, setStatuses] = useState({}); latest.current = value; update.current = onChange; pending.current = onPendingChange;
  const source = languages.find(l => l.code === sourceLanguage), targets = languages.filter(l => l.code !== sourceLanguage);
  const commit = next => {latest.current = next; update.current(next);};
  const status = (language, next) => {if (alive.current) setStatuses(old => ({...old, [language]: next}));};
  const cancel = language => {controllers.current.get(language)?.abort(); controllers.current.delete(language); pending.current?.(`${id}:${language}`, false);};
  useEffect(() => {alive.current = true; return () => {alive.current = false; for (const language of controllers.current.keys()) cancel(language);};}, []);
  const languageKey = languages.map(language => language.code).join('|');
  useEffect(() => {
    for (const language of controllers.current.keys()) cancel(language);
    handledSource.current = latest.current[sourceLanguage] || '';
    setStatuses({});
    return () => {for (const language of controllers.current.keys()) cancel(language);};
  }, [sourceLanguage, languageKey]);
  async function translate(targetLanguage, force = false) {
    const text = latest.current[sourceLanguage] || '', before = latest.current[targetLanguage] || '';
    if (!text.trim() || (!force && latest.current.__i18n?.[targetLanguage]?.manual)) return;
    cancel(targetLanguage); const controller = new AbortController(); controllers.current.set(targetLanguage, controller);
    pending.current?.(`${id}:${targetLanguage}`, true); status(targetLanguage, {state:'loading', message:'מתרגם…'});
    try {
      const result = await translator.translate({text, sourceLanguage, targetLanguage, signal:controller.signal});
      if (!alive.current || controller.signal.aborted || latest.current[sourceLanguage] !== text || (latest.current[targetLanguage] || '') !== before || (!force && latest.current.__i18n?.[targetLanguage]?.manual)) return;
      commit({...latest.current, [targetLanguage]: result, __i18n:{...latest.current.__i18n, [targetLanguage]:translationMetadata(text, sourceLanguage)}});
      status(targetLanguage, {state:'translated', message:'תורגם אוטומטית · מומלץ לבדוק לפני שמירה'});
    } catch (error) {if (error.name !== 'AbortError') status(targetLanguage, {state:'error', message:error.message || 'התרגום לא הצליח. הטקסט הקיים לא השתנה.'});}
    finally {if (controllers.current.get(targetLanguage) === controller) {controllers.current.delete(targetLanguage); pending.current?.(`${id}:${targetLanguage}`, false);}}
  }
  const sourceChanged = text => {for (const language of controllers.current.keys()) cancel(language); setStatuses({}); commit({...latest.current, [sourceLanguage]:text});};
  const sourceFinished = () => {
    const text = latest.current[sourceLanguage] || '';
    if (!autoTranslate || !text.trim() || text === handledSource.current) return;
    handledSource.current = text; for (const language of targets) void translate(language.code);
  };
  const missing = targets.filter(language => !value[language.code]?.trim() && !value.__i18n?.[language.code]?.manual);
  return <div className="localized-field" data-localized-field={label}><h3>{label}</h3>{allowTranslateMissing && <button className="text-button translate-missing" type="button" disabled={!value[sourceLanguage]?.trim() || !missing.length || Object.values(statuses).some(s => s.state === 'loading')} onClick={() => {for (const language of missing) void translate(language.code);}}>תרגום השפות החסרות</button>}<div className="form-grid">{[source,...targets].filter(Boolean).map(language => {
    const isSource = language.code === sourceLanguage, manual = value.__i18n?.[language.code]?.manual === true, state = statuses[language.code];
    const stale = translationState(value, language.code, sourceLanguage) === 'stale';
    const element = {id:`${id}-${language.code}`, 'aria-label':`${label} — ${language.label}`, value:value[language.code] || '', lang:language.code, dir:language.dir || languageDirection(language.code), maxLength:6000, onBlur:isSource ? sourceFinished : undefined, onChange:e => {
      if (isSource) sourceChanged(e.target.value);
      else {cancel(language.code); commit({...latest.current, [language.code]:e.target.value, __i18n:{...latest.current.__i18n, [language.code]:translationMetadata(latest.current[sourceLanguage], sourceLanguage, true)}}); status(language.code, {state:'manual', message:'עריכה ידנית מוגנת מתרגום אוטומטי'});}
    }};
    return <div className="localized-language" key={language.code}><label className="field" htmlFor={element.id}><span>{language.label}{isSource && <small>שפת מקור</small>}</span>{multiline ? <textarea {...element} rows={3}/> : <input {...element}/>}</label>{!isSource && <div className="translation-tools"><button type="button" className="text-button" disabled={!value[sourceLanguage]?.trim() || state?.state === 'loading'} onClick={() => void translate(language.code, true)}>{state?.state === 'loading' ? 'מתרגם…' : manual ? 'תרגום מחדש — החלפת העריכה הידנית' : `תרגום מ${source?.label || sourceLanguage} ל${language.label}`}</button>{manual && <label className="translation-lock"><input type="checkbox" checked={manual} onChange={() => {commit({...latest.current, __i18n:{...latest.current.__i18n, [language.code]:{...latest.current.__i18n?.[language.code], manual:false}}}); status(language.code, {state:'ready', message:'תרגום אוטומטי יופעל בעריכת המקור הבאה'});}}/>הגנה על עריכה ידנית</label>}<p className={`translation-status ${state?.state === 'error' ? 'translation-error' : ''}`} role="status">{state?.state === 'loading' || state?.state === 'error' ? state.message : stale ? 'דורש בדיקה · שפת המקור או התוכן השתנו' : state?.message || (manual ? 'עריכה ידנית מוגנת מתרגום אוטומטי' : '')}</p></div>}</div>;
  })}</div></div>;
}
