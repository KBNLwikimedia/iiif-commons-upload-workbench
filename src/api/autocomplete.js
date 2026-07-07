// Live autocomplete bridge.
//
// The design's editors call `window.matchVocab(window.KNOWN_CATEGORIES, query, …)`
// — instant, synchronous, mock-only. Replacing every call site with a
// React hook would mean editing thousands of lines of nested table code.
//
// Instead this module bridges the gap from the outside:
//
//   1. Override `window.KNOWN_CATEGORIES` and `window.KNOWN_DEPICTS` with
//      getters that return MOCK + LIVE merged on every read.
//   2. Wrap `window.matchVocab` so each call also kicks off a debounced
//      live API search keyed by the query string. Results land in module
//      caches; the next render picks them up via the merged getters.
//   3. Notify subscribers (App) when new live results arrive so we can
//      bump a state value and trigger a fresh render — handy when the user
//      stops typing before the wiki replies.
//
// DEMO_MODE: skip live fetches entirely. Mock vocab is the only source.

import { searchCategories, searchWikidataEntities, fetchWikidataEntity, fetchCategoryInfo, fetchCategoryInfoBatch } from './commons.js';
import { DEMO_MODE } from '../config.js';

const DEBOUNCE_MS = 250;

// Module-level state. Snapshotted from window.* on install so the original
// mock arrays survive even after we replace the window properties.
let mockCategories = [];
let mockDepicts = [];
let mockProperties = [];
const liveCategories = new Map();   // string -> string
const liveDepicts = new Map();      // qid -> {qid, label, desc}
const liveProperties = new Map();   // pid -> {pid, label, datatype, desc}

// Counts shown beside Category autocomplete suggestions ("F<n> C<n>").
// Populated by a single batched prop=categoryinfo call after each
// category search; read synchronously by table.jsx via window.getCategoryCounts.
// Map<categoryName, {files, subcats, pages, missing}>. Negative cache stays
// in the same map (with missing:true), so we don't re-query an empty/missing
// category on the next keystroke.
const categoryCounts = new Map();

const queryTimers = new Map();      // dedupe per "kind:query" key
const subscribers = new Set();

function notify() {
  for (const fn of subscribers) fn();
}

export function subscribeAutocompleteUpdates(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

function debounce(key, fn) {
  if (queryTimers.has(key)) clearTimeout(queryTimers.get(key));
  const id = setTimeout(() => {
    queryTimers.delete(key);
    fn();
  }, DEBOUNCE_MS);
  queryTimers.set(key, id);
}

async function fetchCategoriesLive(query) {
  if (DEMO_MODE || !query || query.length < 2) return;
  try {
    const results = await searchCategories(query);
    let added = 0;
    for (const c of results) {
      if (!liveCategories.has(c)) {
        liveCategories.set(c, c);
        added++;
      }
    }
    if (added > 0) notify();

    // Fetch file/subcat counts for the suggestions in a single batch call so
    // the dropdown can render "F<n> C<n>" without per-keystroke fan-out.
    // Skip categories we already have counts for (cache lasts the session).
    const needCounts = results.filter((c) => c && !categoryCounts.has(c));
    if (needCounts.length) {
      try {
        const counts = await fetchCategoryInfoBatch(needCounts);
        let countsAdded = 0;
        for (const [name, info] of counts.entries()) {
          categoryCounts.set(name, info);
          countsAdded++;
        }
        // Mark anything the API skipped (rare, but possible if normalisation
        // diverges) as missing so we don't keep retrying it.
        for (const c of needCounts) {
          if (!categoryCounts.has(c)) {
            categoryCounts.set(c, { files: 0, subcats: 0, pages: 0, missing: true });
          }
        }
        if (countsAdded > 0) notify();
      } catch (e) {
        console.warn('[autocomplete] category counts batch failed:', e);
      }
    }
  } catch (e) {
    console.warn('[autocomplete] category fetch failed:', e);
  }
}

async function fetchDepictsLive(query) {
  if (DEMO_MODE || !query || query.length < 2) return;
  try {
    const results = await searchWikidataEntities(query);
    let added = 0;
    for (const d of results) {
      if (d.qid && !liveDepicts.has(d.qid)) {
        liveDepicts.set(d.qid, d);
        added++;
      }
    }
    if (added > 0) notify();
  } catch (e) {
    console.warn('[autocomplete] depicts fetch failed:', e);
  }
}

// matchVocab gets called with the pool + query. We can't tell category
// queries apart from depicts queries by the call signature alone, but we
// CAN tell by the shape of the items: strings = categories, objects with
// a qid field = depicts, objects with a pid field = properties.
function detectKind(items) {
  if (!items?.length) return null;
  const sample = items[0];
  if (typeof sample === 'string') return 'category';
  if (sample && typeof sample === 'object') {
    if (sample.qid) return 'depicts';
    if (sample.pid) return 'property';
  }
  return null;
}

export function installLiveAutocomplete() {
  if (typeof window === 'undefined') return;

  // Snapshot the originals.
  mockCategories = Array.isArray(window.KNOWN_CATEGORIES) ? [...window.KNOWN_CATEGORIES] : [];
  mockDepicts = Array.isArray(window.KNOWN_DEPICTS) ? [...window.KNOWN_DEPICTS] : [];
  mockProperties = Array.isArray(window.KNOWN_PROPERTIES) ? [...window.KNOWN_PROPERTIES] : [];

  Object.defineProperty(window, 'KNOWN_CATEGORIES', {
    configurable: true,
    get() {
      // Mock first (so popular ones surface even without a query); live appended
      const seen = new Set();
      const out = [];
      for (const c of mockCategories) { if (!seen.has(c)) { seen.add(c); out.push(c); } }
      for (const c of liveCategories.values()) { if (!seen.has(c)) { seen.add(c); out.push(c); } }
      return out;
    },
    set(v) {
      // If somebody overwrites at runtime, treat it as a new mock baseline.
      mockCategories = Array.isArray(v) ? [...v] : [];
    },
  });

  Object.defineProperty(window, 'KNOWN_DEPICTS', {
    configurable: true,
    get() {
      const seen = new Set();
      const out = [];
      for (const d of mockDepicts) { if (!seen.has(d.qid)) { seen.add(d.qid); out.push(d); } }
      for (const d of liveDepicts.values()) { if (!seen.has(d.qid)) { seen.add(d.qid); out.push(d); } }
      return out;
    },
    set(v) {
      mockDepicts = Array.isArray(v) ? [...v] : [];
    },
  });

  Object.defineProperty(window, 'KNOWN_PROPERTIES', {
    configurable: true,
    get() {
      const seen = new Set();
      const out = [];
      for (const p of mockProperties) { if (!seen.has(p.pid)) { seen.add(p.pid); out.push(p); } }
      for (const p of liveProperties.values()) { if (!seen.has(p.pid)) { seen.add(p.pid); out.push(p); } }
      return out;
    },
    set(v) {
      mockProperties = Array.isArray(v) ? [...v] : [];
    },
  });

  // Wrap matchVocab to fire off live searches as a side effect. The
  // synchronous return value comes straight from the original mock matcher
  // — by the time the next render runs, the live cache has more entries to
  // merge in via the getters above.
  const originalMatchVocab = window.matchVocab;
  window.matchVocab = function (items, query, getText, max = 10) {
    const q = String(query || '').trim();
    if (q.length >= 2) {
      const kind = detectKind(items);
      if (kind === 'category') debounce(`cat:${q}`, () => fetchCategoriesLive(q));
      else if (kind === 'depicts') debounce(`dep:${q}`, () => fetchDepictsLive(q));
      // Properties intentionally not auto-searched: the mock list is small
      // and Wikidata property search is noisy.
    }
    return originalMatchVocab(items, q, getText, max);
  };

  // isKnownCategory checks the merged pool too.
  const originalIsKnown = window.isKnownCategory;
  window.isKnownCategory = (name) => {
    const n = String(name || '').trim().toLowerCase();
    if (!n) return false;
    if (mockCategories.some((c) => c.toLowerCase() === n)) return true;
    for (const c of liveCategories.values()) {
      if (c.toLowerCase() === n) return true;
    }
    return originalIsKnown ? originalIsKnown(name) : false;
  };

  // Expose the per-QID Wikidata fetcher to the design files (table.jsx's
  // PillInfoPopover). Updates the live cache so adjacent calls (e.g. cell
  // editor autocomplete) don't refetch the same Q-id.
  window.fetchWikidataEntity = async (qid) => {
    const ent = await fetchWikidataEntity(qid);
    if (ent && !liveDepicts.has(ent.qid)) {
      liveDepicts.set(ent.qid, ent);
      notify();
    }
    return ent;
  };

  // Expose fetchCategoryInfo for the design's table.jsx (no ESM imports there).
  // Used by the category pill info popover; cached by fetchJSON's 5-min TTL.
  window.fetchCategoryInfo = fetchCategoryInfo;

  // Synchronous read of cached category counts for the autocomplete dropdown.
  // Returns {files, subcats, pages, missing} or null if not yet fetched.
  // table.jsx calls this on each render; the bridge re-renders via notify()
  // when fresh counts land.
  window.getCategoryCounts = (name) => {
    if (!name) return null;
    return categoryCounts.get(name) || null;
  };
}

// Seed live caches with values gleaned from the user's history (Phase 1
// loaded their published files). Bumps the visible suggestions in cell
// editors before the user has typed anything.
export function seedFromHistory(items) {
  if (!Array.isArray(items)) return;
  let added = false;
  for (const item of items) {
    if (item.status !== 'published') continue;
    for (const c of item.categories || []) {
      if (c && !liveCategories.has(c)) {
        liveCategories.set(c, c);
        added = true;
      }
    }
    for (const d of item.depicts || []) {
      if (d?.qid && !liveDepicts.has(d.qid)) {
        liveDepicts.set(d.qid, d);
        added = true;
      }
    }
  }
  if (added) notify();
}
