export type TranslationRequest={text:string;sourceLanguage:string;targetLanguage:string;signal?:AbortSignal};
export class TranslationError extends Error{code:string;constructor(code:string,message:string);}
export function languageDirection(code:string):'rtl'|'ltr';
export function sourceFingerprint(text:string):string;
export function translationSegments(text:string,maximumBytes?:number):({text:string}|{literal:string})[];
export function createMyMemoryProvider(options?:{fetcher?:typeof fetch;timeoutMs?:number}):(request:TranslationRequest)=>Promise<string>;
export function createHttpProvider(options:{endpoint:string;fetcher?:typeof fetch;getHeaders?:()=>Record<string,string>|Promise<Record<string,string>>}):(request:TranslationRequest)=>Promise<string>;
export function createTranslationClient(options:{siteId:string;provider?:(request:TranslationRequest)=>Promise<string>;storage?:Pick<Storage,'getItem'|'setItem'>;cacheLimit?:number}):{translate:(request:TranslationRequest)=>Promise<string>};
