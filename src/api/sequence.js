// Auto-sequence title resolver (T425984).
//
// When the user accepts the "Convert to sequence" suggestion in the title
// editor, all stash rows colliding on a base name get rewritten to
// `<basename> #`. The literal ` #` placeholder lives in the cell until
// publish — at publish time `resolveSequenceTitles` finds the user's
// existing `<basename> N` files on Commons and assigns each placeholder
// row a fresh `N+1`, `N+2`, … in stable order.
//
// "Continue from N+1" matches what an experienced user would do by hand:
// numbering doesn't restart at 1 each session, and a re-publish a week
// later picks up where the last one left off without the user having to
// remember the count.
//
// Ownership matters. `findHighestSequenceNumber` filters allimages results
// by `user === currentUsername` so a sequence collision with someone
// else's file (e.g. they have a `Foo 3.jpg` you don't) doesn't push your
// numbers up. The publish-time uniqueness check still catches the case
// where Commons rejects a specific number — see `publishOne` warning
// handling.

import { COMMONS_API, DEMO_MODE } from '../config.js';
import { fetchJSON } from '../utils.js';
import { extractSequenceBasename, isSequencePlaceholderTitle } from './title-validation.js';

// Source-file extension extractor. The placeholder lives in the title (no
// extension); the actual published filename gets the extension appended.
// Mirrors extOf in title-validation.js — duplicated to avoid a circular
// import (sequence.js imports the placeholder helpers; title-validation.js
// shouldn't import from sequence.js).
function extOf(filename) {
  if (!filename) return '';
  const m = String(filename).match(/\.[^.]+$/);
  return m ? m[0] : '';
}

// Match titles of the form `<basename> N` where N is a positive integer
// (no leading zeros, no surrounding whitespace). Returns the integer or
// null on miss. The match is anchored: `Foo 12` matches; `Foo 12a`,
// `Foo 12 (alt)`, `Foo` (no number), and `Foo 0` (zero / leading-zero)
// all miss.
function matchSequenceNumber(filename, basename, ext) {
  // Build a regex per (basename, ext). The basename is user-controlled so
  // it must be regex-escaped; the extension lives in our control but escape
  // it too (the dot is the only metachar realistically present).
  const escBase = basename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escExt = (ext || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // `Foo 1.jpg` → match. `Foo 0.jpg`, `Foo 01.jpg`, `Foo 1a.jpg` → no match.
  const re = new RegExp(`^${escBase} ([1-9]\\d*)${escExt}$`);
  const m = String(filename || '').match(re);
  if (!m) return null;
  return parseInt(m[1], 10);
}

// Cap on how many `<basename>…` files we'll page through when scanning for
// the user's max N. A user with thousands of `Photo N.jpg` files would
// hit this; the scan terminates early and we surface the highest N we
// did see (a few too-low results just mean a slightly out-of-order
// sequence, not a wrong-number bug — Commons would reject collisions at
// publish time anyway). 5 pages × 500 = 2500 names is generous for
// realistic photo sets.
const ALLIMAGES_PAGE_LIMIT = 500;
const ALLIMAGES_PAGE_CAP = 5;

// Pages allimages by `aiprefix=<basename> ` and walks every result, filtering
// to files owned by `username`. Each match is described as { n, filename }
// — n is the parsed sequence number (matchSequenceNumber-form, never 0/null
// here because non-matches are dropped) and filename is the canonical
// title without the `File:` prefix.
//
// Returns { matches, capped }: `matches` is an array of { n, filename };
// `capped` is true when we hit the page cap before exhausting `aicontinue`
// (caller may want to label the result list as "first N").
//
// On total API failure (no pages succeeded), `matches` is null so the caller
// can distinguish "no files" from "we don't know". Otherwise we return
// whatever we managed to read.
async function listOwnedSequenceFiles(basename, ext, username) {
  if (!basename || !username) return { matches: [], capped: false };
  if (DEMO_MODE) return { matches: [], capped: false };

  // `aiprefix` matches the canonical filename (case-sensitive, underscore-
  // normalised). MediaWiki normalises the leading char of a title to upper
  // case anyway, so a basename starting with lowercase will still match.
  // Pull `user` so we can filter for the current user client-side; pull
  // `canonicaltitle` so our regex match operates on the canonical (with
  // underscores → spaces) form.
  const prefix = `${basename} `;
  let aicontinue = null;
  let pages = 0;
  let anySuccess = false;
  const matches = [];
  while (pages < ALLIMAGES_PAGE_CAP) {
    const params = new URLSearchParams({
      action: 'query',
      list: 'allimages',
      aisort: 'name',
      aiprefix: prefix,
      ailimit: String(ALLIMAGES_PAGE_LIMIT),
      aiprop: 'user|canonicaltitle',
      format: 'json',
      formatversion: '2',
      origin: '*',
    });
    if (aicontinue) params.set('aicontinue', aicontinue);

    let data;
    try {
      data = await fetchJSON(`${COMMONS_API}?${params}`);
    } catch (e) {
      console.warn('[sequence] allimages prefix lookup failed:', e?.message || e);
      // Partial result: better to return what we've seen than nothing.
      if (!anySuccess) return { matches: null, capped: false };
      return { matches, capped: false };
    }
    anySuccess = true;
    const list = data?.query?.allimages || [];
    for (const f of list) {
      // Filter for current user; ignore other uploaders' sequence files.
      if (f.user !== username) continue;
      const canonical = (f.canonicaltitle || '').replace(/^File:/, '');
      const n = matchSequenceNumber(canonical, basename, ext);
      if (n != null) matches.push({ n, filename: canonical });
    }
    aicontinue = data?.continue?.aicontinue || null;
    pages += 1;
    if (!aicontinue) break;
  }
  const capped = pages >= ALLIMAGES_PAGE_CAP && !!aicontinue;
  if (capped) {
    console.warn(
      `[sequence] hit ${ALLIMAGES_PAGE_CAP}-page cap scanning "${prefix}*" — list may be incomplete`,
    );
  }
  return { matches, capped };
}

// Public: enumerate the user's existing `<basename> N<ext>` files. Used by
// the title editor's "click chip → see existing files" info popup. Returns
// { files, capped }: `files` is the same array of { n, filename } as
// `listOwnedSequenceFiles.matches` but sorted ascending by n; `capped`
// flags whether the scan hit the page cap.
//
// On API error this returns { files: null, capped: false } so the caller
// can show "couldn't load list" rather than guessing.
export async function findOwnedSequenceFiles(basename, ext, username) {
  const { matches, capped } = await listOwnedSequenceFiles(basename, ext, username);
  if (matches == null) return { files: null, capped };
  matches.sort((a, b) => a.n - b.n);
  return { files: matches, capped };
}

// Find the highest N for `<basename> N<ext>` files owned by `username` on
// Commons. Returns 0 when no such file exists. Returns null on API error
// (the caller should treat this as "unknown — maybe start at 1, but warn").
export async function findHighestSequenceNumber(basename, ext, username) {
  const { matches } = await listOwnedSequenceFiles(basename, ext, username);
  if (matches == null) return null;
  let highest = 0;
  for (const m of matches) if (m.n > highest) highest = m.n;
  return highest;
}

// Resolve every sequence-placeholder title in `items` to a concrete
// `<basename> N` title. Returns Map<itemId, resolvedTitle>; items whose
// title isn't a placeholder are absent from the map (caller should fall
// back to the original title).
//
// Ordering policy: items sharing a basename are assigned consecutive
// integers in the order they appear in `items`. Caller controls the
// order — for the bulk publish flow that's the queue order; for the
// single publish flow it's a one-element array.
//
// `username` may be empty (DEMO_MODE / un-authenticated), in which case we
// start from 0 and just pretend the user has no prior sequence.
export async function resolveSequenceTitles(items, username) {
  const out = new Map();
  if (!Array.isArray(items) || items.length === 0) return out;

  // Group placeholder items by `(basename, ext)`. Different extensions are
  // different sequences (`Foo 1.jpg` and `Foo 1.png` don't collide on
  // Commons), so we key by both.
  const buckets = new Map(); // key -> { basename, ext, items: [] }
  for (const it of items) {
    const basename = extractSequenceBasename(it?.title);
    if (!basename) continue;
    const ext = extOf(it?.filename);
    const key = `${basename}\x00${ext}`;
    if (!buckets.has(key)) buckets.set(key, { basename, ext, items: [] });
    buckets.get(key).items.push(it);
  }
  if (buckets.size === 0) return out;

  // Resolve each bucket sequentially. Sequential keeps API politeness in
  // the spirit of CLAUDE.md ("prefer sequential over parallel for large
  // bursts"); in practice users rarely have more than a handful of distinct
  // basenames in one batch, so the wall-clock impact is tiny.
  for (const { basename, ext, items: bucket } of buckets.values()) {
    const highest = await findHighestSequenceNumber(basename, ext, username);
    // null (API error) → treat as "unknown"; start at 1 but note this in
    // the resolved entry so the caller can warn. We don't currently
    // surface a warning in the UI — the publish-time `exists` warning
    // catches collisions, and the user can ignore-and-retry.
    const start = (highest == null ? 0 : highest);
    bucket.forEach((it, i) => {
      const n = start + i + 1;
      out.set(it.id, `${basename} ${n}`);
    });
  }
  return out;
}

// Synchronous helper: given a stash row's title (which may be a placeholder)
// and a pre-resolved-titles map, return the title that should drive the
// publish. Caller-friendly so the publish modals don't need to repeat the
// fallback logic.
export function effectiveTitle(item, resolvedTitles) {
  if (!item) return '';
  if (resolvedTitles && resolvedTitles.has(item.id)) {
    return resolvedTitles.get(item.id);
  }
  return item.title || '';
}

// True if any of `items` carries a sequence-placeholder title. Lets the
// publish modals decide whether to bother running the resolver at all.
export function hasSequencePlaceholders(items) {
  if (!Array.isArray(items)) return false;
  return items.some((i) => isSequencePlaceholderTitle(i?.title));
}
