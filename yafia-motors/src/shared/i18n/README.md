# Reusable multilingual admin content

This module translates authored website content. It does not translate the
admin's buttons/menus or automatically add new public navigation languages.
Elkanoon uses it for Hebrew/Arabic content, products, categories and gift titles.
No member, order, phone, price, coupon-code or credential field is sent to it.

## Reuse in another site

```jsx
import LocalizedField from './shared/i18n/LocalizedField.jsx';
import {createTranslationClient} from './shared/i18n/translation.mjs';

// Create once, outside rendering; use a unique namespace for each business.
const translator = createTranslationClient({
  siteId: 'another-business',
  storage: window.localStorage,
});

<LocalizedField
  label="Description"
  value={content.description}
  onChange={description => setContent(old => ({...old, description}))}
  multiline
  sourceLanguage="he"
  languages={[
    {code:'he', label:'עברית', dir:'rtl'},
    {code:'ar', label:'العربية', dir:'rtl'},
    {code:'en', label:'English', dir:'ltr'},
  ]}
  autoTranslate={true}
  translator={translator}
  onPendingChange={trackPendingTranslation}
/>
```

Keep a field's React `key` stable for the same content item and change it when
switching to a different item. Track `onPendingChange(id, active)` in a Set;
defer save and item/tab navigation while requests are pending. Elkanoon's
Admin.jsx demonstrates this integration. Do not wrap the field in a second
label. For non-browser rendering omit `storage`; its cache is optional.

Values remain backward-compatible locale objects, for example `{he, ar, en}`.
Optional `__i18n[locale] = {manual, source}` stores manual-edit protection and
the machine-translation source fingerprint. Persist this metadata with the
content; public renderers continue to read only the requested locale string.

New metadata also stores `sourceLanguage`. `translationState(value, target,
source)` from `content-state.mjs` returns `missing`, `stale`, `manual`, `current`
or `empty-source`. After a source edit/language change, a manual translation is
retained and visibly marked as needing review. Legacy automatic fingerprints
remain supported; legacy manual locks without a fingerprint conservatively
need review. Manually editing a target acknowledges the current source.
`allowTranslateMissing` adds a per-field button for missing, unlocked targets
without overwriting existing translations, even when automatic mode is off.

## Site configuration and persistence adapter

```jsx
import {createTranslationSite} from './shared/i18n/site.mjs';

const site = createTranslationSite({
  siteId: 'another-business',
  sourceLanguage: 'he',
  languages: [
    {code:'he', label:'עברית'},
    {code:'ar', label:'العربية'},
    {code:'en', label:'English'},
  ],
  storage: window.localStorage,
  // Optional authenticated, asynchronous content adapters:
  // load: async siteId => readOwnSiteContent(siteId),
  // save: async (siteId, content) => saveOwnSiteContent(siteId, content),
  // provider: createHttpProvider({endpoint:'/api/translation', getHeaders}),
});
const content = await site.loadContent(defaultContent);
// Render LocalizedField using site.languages, site.sourceLanguage and
// site.translator. Pass state updates through onChange, and persist them:
await site.saveContent(content);
```

Absent callbacks, persistence uses `<siteId>:translation-content:v1` in the
supplied storage. Load/save errors are propagated so the host can report them;
await loading before enabling edits, serialize remote saves and handle errors.
Create a stable site configuration/client rather than re-creating it on every
keystroke. Changing language configuration cancels obsolete field requests;
mount a fresh key for each content item. At most 12 unique configured languages
are accepted, with the source included; provider support is validated by the
provider itself. This library does not provision server accounts or authorize
access: production callbacks must enforce business isolation server-side.

An independent interactive example is at `/addons/translation/`; its source
is in `client-sites/translation-addon` with a separate build and stylesheet.

Changing source text requests translation on blur, never per keystroke.
Editing a target marks it manual and protects it across saves/reloads. The
explicit replacement button translates again and releases the manual lock.
Existing translations are never erased after an error, quota response or abort.
Changing source text or editing a target aborts obsolete requests. Out-of-order
responses cannot replace the newer value. Clearing a source does not erase targets.

## Providers and resource use

The default adapter uses the documented MyMemory anonymous GET endpoint with
`mt=1`. Text is sent to that external service, with no cookies, account keys,
customer identifiers or referrer. MyMemory currently permits 5,000 anonymous
characters per day; errors/limits are displayed rather than replaced with fake
translations. See the provider's [API](https://mymemory.translated.net/doc/spec.php),
[usage limits](https://mymemory.translated.net/doc/usagelimits.php) and
[terms](https://mymemory.translated.net/doc/tos.php). It is suitable for trying
the demo, not an unlimited production translation guarantee.

The client preserves paragraph separators, splits text below the provider's
500-byte UTF-8 request limit, serializes work and reuses a bounded browser cache.
It never calls MyMemory's contribution/`set` API. Machine output is plain text,
rendered through React, and should be reviewed before publishing.

For a contracted provider, inject `provider` into `createTranslationClient`.
`createHttpProvider({endpoint, getHeaders})` implements an authenticated JSON
POST adapter: request `{text, sourceLanguage, targetLanguage}`, response
`{translation}`. Keep provider keys in the server. It must enforce site-level
authorization, request limits and provider-specific privacy policy. Reusing the
module must not reuse another client's credentials or data store.

When adding public languages, also supply that site's interface strings and
language navigation. Translation of editable content alone is not a complete
localization of the site's checkout or administration interface.

## Checks

The existing Elkanoon Node suite includes engine tests for language pairs,
UTF-8/newlines, cache isolation, cancellation, provider failures, template
variables and a custom server adapter. Browser checks live in
`scripts/verify-elkanoon-translation.mjs`. Set `ELKANOON_BASE_URL` to the preview
and optionally `ELKANOON_LIVE_TRANSLATION=1` for a small real Hebrew/Arabic call;
controlled race/error tests never use the external provider's quota.
