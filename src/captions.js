// Per-language Caption columns (T426422).
//
// On Commons, a file's "caption" is the SDC label — a multilingual map from
// language code → short text. The workbench presents one Caption //column//
// per language the user wants to edit; the user can change a column's
// language or add additional Caption columns for other languages, but two
// visible Caption columns can never share the same language.
//
// Shape:
//   item.descriptions: { [lang]: string }   — per-language captions
//   item.description:  string               — legacy single-string caption,
//                                             treated as English when present
//
// Column-key encoding:
//   "description"           — English caption (legacy key, kept stable so
//                             existing column prefs / drafts don't migrate).
//   "description:<lang>"    — caption in <lang>, where <lang> is a 2-letter
//                             ISO 639-1 code (or a `xx-yy` regional variant
//                             — we don't enforce shape, MediaWiki does).
//
// The "language" of column key `description` is conceptually "en"; we encode
// English under the bare key so the existing `setDraft({ description: ... })`
// path keeps working without per-row migration. The duplicate-language guard
// rejects any visible `description:en` to keep the bare-key invariant.

// Curated catalog of languages we surface in the "Add language" picker.
// This is intentionally short — the most common Commons caption languages —
// and matches the spirit of the licence catalog (a curated v1, expandable
// when concrete user demand warrants more).
//
// Codes are MediaWiki / ISO 639-1 prefixes (the same ones MediaWiki uses
// for `{{en|1=...}}` template names and SDC label keys). Labels are in
// the language itself (the autonym) plus an English gloss for users who
// don't read the script — rendered as "English (en)", "Nederlands (nl)",
// etc., so a beginner picking from the list isn't reading codes.
export const CAPTION_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'nl', label: 'Nederlands (Dutch)' },
  { code: 'de', label: 'Deutsch (German)' },
  { code: 'fr', label: 'Français (French)' },
  { code: 'es', label: 'Español (Spanish)' },
  { code: 'it', label: 'Italiano (Italian)' },
  { code: 'pt', label: 'Português (Portuguese)' },
  { code: 'pl', label: 'Polski (Polish)' },
  { code: 'ru', label: 'Русский (Russian)' },
  { code: 'sv', label: 'Svenska (Swedish)' },
  { code: 'uk', label: 'Українська (Ukrainian)' },
  { code: 'ja', label: '日本語 (Japanese)' },
  { code: 'zh', label: '中文 (Chinese)' },
  { code: 'ko', label: '한국어 (Korean)' },
  { code: 'ar', label: 'العربية (Arabic)' },
  { code: 'he', label: 'עברית (Hebrew)' },
  { code: 'hi', label: 'हिन्दी (Hindi)' },
  { code: 'tr', label: 'Türkçe (Turkish)' },
  { code: 'cs', label: 'Čeština (Czech)' },
  { code: 'da', label: 'Dansk (Danish)' },
  { code: 'fi', label: 'Suomi (Finnish)' },
  { code: 'no', label: 'Norsk (Norwegian)' },
  { code: 'el', label: 'Ελληνικά (Greek)' },
  { code: 'hu', label: 'Magyar (Hungarian)' },
];

const LANGUAGE_LABELS = new Map(CAPTION_LANGUAGES.map((l) => [l.code, l.label]));

// Pretty label for a code, falling back to the bare code so unknown
// languages (e.g. an SDC entity carrying labels in a language we don't
// catalog yet) still render something sane.
export function captionLanguageLabel(code) {
  return LANGUAGE_LABELS.get(code) || code;
}

// Constant for the bare-key encoding of English — used by callers that need
// to special-case the legacy column key. Kept here (not at every call site)
// so a future migration to a fully-suffixed scheme is one constant to flip.
export const DEFAULT_CAPTION_LANG = 'en';

// True if `key` is one of the workbench's caption column keys.
//   isCaptionColKey('description')        // true
//   isCaptionColKey('description:nl')     // true
//   isCaptionColKey('descriptionurl')     // false  (no colon, but not the bare key)
//   isCaptionColKey('description:foo')    // true   (we don't validate the lang here)
export function isCaptionColKey(key) {
  if (typeof key !== 'string') return false;
  if (key === 'description') return true;
  return key.startsWith('description:');
}

// Caption key → language code. `description` → `en`; `description:nl` → `nl`.
// Returns null for non-caption keys so callers can branch.
export function captionLangFromColKey(key) {
  if (!isCaptionColKey(key)) return null;
  if (key === 'description') return DEFAULT_CAPTION_LANG;
  return key.slice('description:'.length);
}

// Language code → caption col key. The English column uses the bare
// `description` key (stable across the existing codebase); every other
// language gets a `description:<lang>` key.
export function captionColKeyFromLang(lang) {
  if (!lang || lang === DEFAULT_CAPTION_LANG) return 'description';
  return `description:${lang}`;
}

// Read the caption value for a given language off an item, transparently
// handling the legacy `description` field as the English value.
//
// Precedence (English):  descriptions.en  →  description
// Precedence (other):    descriptions[lang]  →  ''
//
// Returns the empty string when no value exists, so the consumer can do
// `String(getCaptionValue(item, lang)).trim()` without null-guarding.
export function getCaptionValue(item, lang) {
  if (!item) return '';
  const code = lang || DEFAULT_CAPTION_LANG;
  const fromMap = item.descriptions && item.descriptions[code];
  if (typeof fromMap === 'string') return fromMap;
  if (code === DEFAULT_CAPTION_LANG && typeof item.description === 'string') {
    return item.description;
  }
  return '';
}

// Produce a new item with the caption for `lang` set to `value` (string).
// Always writes through the `descriptions` map so all languages live in
// one place; keeps the legacy `description` field in sync for English so
// any unmigrated read paths (`item.description`) still see the right text.
//
// An empty string clears the slot — for English we set both `description`
// and `descriptions.en` to '' so downstream "is missing?" checks see it
// gone, but we don't *delete* the keys (deleting could surprise anything
// that walks `Object.keys(descriptions)`).
export function setCaptionValue(item, lang, value) {
  const code = lang || DEFAULT_CAPTION_LANG;
  const next = { ...item };
  const text = value == null ? '' : String(value);
  next.descriptions = { ...(item?.descriptions || {}), [code]: text };
  if (code === DEFAULT_CAPTION_LANG) {
    next.description = text;
  }
  return next;
}

// True if any caption (any language) on the item has non-empty text.
// Used by the issues helper so the "missing caption" warning clears as
// soon as the user has filled in *some* language, not just English.
export function hasAnyCaption(item) {
  if (!item) return false;
  if (typeof item.description === 'string' && item.description.trim()) return true;
  const map = item.descriptions || {};
  for (const v of Object.values(map)) {
    if (typeof v === 'string' && v.trim()) return true;
  }
  return false;
}

// Pick a sensible default language for a newly-added Caption column,
// excluding any languages already on the table. Strategy:
//   1. The first item from `CAPTION_LANGUAGES` that isn't in `usedLangs`,
//      AFTER trying the user's browser locale prefix.
//   2. Fall back to the literal first available code from the catalog.
//   3. Fall back to `''` (no available code) — caller must handle this
//      case, e.g. by disabling the "Add language" menu when the user has
//      already enabled every language we know about.
export function defaultNewCaptionLang(usedLangs) {
  const used = new Set(usedLangs || []);

  // Try the browser locale first — a Dutch user adding a second caption
  // column likely wants Dutch; an Italian user, Italian.
  let nav = '';
  try {
    nav = (navigator?.language || navigator?.userLanguage || '').toLowerCase().split(/[-_]/)[0];
  } catch (e) { /* SSR / weird env — drop through */ }
  if (nav && !used.has(nav) && LANGUAGE_LABELS.has(nav)) return nav;

  for (const { code } of CAPTION_LANGUAGES) {
    if (!used.has(code)) return code;
  }
  return '';
}

// Available languages (catalog ∖ used), preserving catalog order. Drives the
// "Add language" picker and the "Change language to…" picker — both want to
// hide what's already on screen so the user can never produce two visible
// caption columns sharing a language (the no-duplicate-language guard).
export function availableCaptionLanguages(usedLangs) {
  const used = new Set(usedLangs || []);
  return CAPTION_LANGUAGES.filter((l) => !used.has(l.code));
}

// Count how many items currently carry a non-empty caption in `lang`. Drives
// the "removing this column will discard N values, are you sure?" confirm in
// the column-header menu and the columns modal eye toggle (T426422 follow-up).
// Reads via getCaptionValue so the legacy bare `description` field is treated
// as English, matching the rest of the caption code paths.
export function countItemsWithCaption(items, lang) {
  if (!Array.isArray(items) || !lang) return 0;
  let n = 0;
  for (const it of items) {
    if (String(getCaptionValue(it, lang) || '').trim()) n++;
  }
  return n;
}

// Extract every language that any item carries a non-empty caption in.
// Returned as a Set (O(1) membership for the auto-promote sweep). Used by
// the App-level effect that ensures `columnState.visible` always covers
// every language the user has typed text in — otherwise a re-upload of a
// previously-edited file would land caption text in slots the user can't
// see. (T426422 follow-up.)
export function collectCaptionLangsFromItems(items) {
  const out = new Set();
  if (!Array.isArray(items)) return out;
  for (const it of items) {
    if (!it) continue;
    if (typeof it.description === 'string' && it.description.trim()) {
      out.add(DEFAULT_CAPTION_LANG);
    }
    const map = it.descriptions || {};
    for (const [code, v] of Object.entries(map)) {
      if (typeof v === 'string' && v.trim() && code) out.add(code);
    }
  }
  return out;
}

// Clear the caption text for `lang` on a single item. Mirrors setCaptionValue
// with an empty-string write but additionally *deletes* the slot from the
// `descriptions` map so the auto-promote sweep won't see it as "user-typed
// content" and re-add the column on the next render. For English we also
// clear the legacy `description` field for the same reason.
//
// Only fires when there's actually non-empty text to clear — returns the
// same item reference otherwise so callers that map/diff over an items
// array can short-circuit with `if (cleared !== it) onUpdate(cleared)` and
// avoid pointless setItems re-renders + draft writes. Empty-string slots
// in the map are left alone (they're harmless and don't trigger the
// auto-promote sweep, since collectCaptionLangsFromItems requires .trim()).
export function clearCaptionFromItem(item, lang) {
  if (!item) return item;
  const code = lang || DEFAULT_CAPTION_LANG;
  const inMap = item.descriptions && typeof item.descriptions[code] === 'string' && item.descriptions[code].trim();
  const inLegacy = code === DEFAULT_CAPTION_LANG && typeof item.description === 'string' && item.description.trim();
  if (!inMap && !inLegacy) return item;
  const next = { ...item };
  if (item.descriptions && Object.prototype.hasOwnProperty.call(item.descriptions, code)) {
    const { [code]: _drop, ...rest } = item.descriptions;
    next.descriptions = rest;
  }
  if (code === DEFAULT_CAPTION_LANG) {
    next.description = '';
  }
  return next;
}

// Expose helpers on window so design-era files (table.jsx etc.) can reach
// them via the project's window-globals pattern (see CLAUDE.md → "The
// design's window-globals pattern"). Module consumers should import
// directly; the window assignment is just the side-effect bridge.
if (typeof window !== 'undefined') {
  window.CAPTION_LANGUAGES = CAPTION_LANGUAGES;
  window.captionLanguageLabel = captionLanguageLabel;
  window.isCaptionColKey = isCaptionColKey;
  window.captionLangFromColKey = captionLangFromColKey;
  window.captionColKeyFromLang = captionColKeyFromLang;
  window.getCaptionValue = getCaptionValue;
  window.setCaptionValue = setCaptionValue;
  window.hasAnyCaption = hasAnyCaption;
  window.defaultNewCaptionLang = defaultNewCaptionLang;
  window.availableCaptionLanguages = availableCaptionLanguages;
  window.countItemsWithCaption = countItemsWithCaption;
  window.collectCaptionLangsFromItems = collectCaptionLangsFromItems;
  window.clearCaptionFromItem = clearCaptionFromItem;
  window.DEFAULT_CAPTION_LANG = DEFAULT_CAPTION_LANG;
}
