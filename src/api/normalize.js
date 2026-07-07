// Normalize Wikimedia API responses to the item shape the design expects.
//
// SAMPLE_UPLOADS in data.js defines the canonical item shape: id, status,
// filename, title, description, bytes, mime, width, height, uploadedAt,
// expiresAt, dateTaken, author, source, license, categories, depicts,
// camera, lens, iso, aperture, shutter, focal, thumbColor, thumbAccent,
// issues, etc. The API returns a flatter shape; these helpers fill in
// what's derivable (expiresAt from uploadedAt, EXIF fields from metadata,
// thumbColor from a filename hash) and leave the rest empty.

import { STASH_EXPIRY_HOURS } from '../config.js';

// EXIF metadata values can be: a primitive, an object {name, value}, or an
// array of those. Flatten to a single string.
export function flattenMetaValue(v) {
  if (v == null) return null;
  if (typeof v === 'string' || typeof v === 'number') return String(v);
  if (Array.isArray(v)) {
    return (
      v
        .filter((i) => i && i.name !== '_type')
        .map((i) => flattenMetaValue(i.value))
        .filter(Boolean)
        .join(', ') || null
    );
  }
  if (typeof v === 'object' && 'value' in v) return flattenMetaValue(v.value);
  return null;
}

// EXIF metadata is an array of {name, value}. Look up by name.
function exifField(metadata, name) {
  const entry = metadata?.find?.((m) => m?.name === name);
  return entry ? flattenMetaValue(entry.value) : null;
}

// "2026:04:29 05:42:00" -> "2026-04-29T05:42:00Z"
function exifDateToIso(exif) {
  if (!exif) return null;
  const m = String(exif).match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z` : null;
}

// "35/1" -> 35; "1/250" -> 0.004; "f/2.8" passes through; null otherwise.
function rationalToNumber(s) {
  if (s == null) return null;
  const str = String(s).trim();
  const m = str.match(/^(-?\d+)\/(-?\d+)$/);
  if (m) {
    const num = parseInt(m[1], 10);
    const den = parseInt(m[2], 10);
    return den ? num / den : null;
  }
  const n = parseFloat(str);
  return Number.isFinite(n) ? n : null;
}

function formatAperture(fnumber) {
  const n = rationalToNumber(fnumber);
  return n ? `f/${n.toFixed(n < 10 ? 1 : 0).replace(/\.0$/, '')}` : null;
}

function formatShutter(s) {
  const n = rationalToNumber(s);
  if (!n) return null;
  if (n >= 1) return `${n}s`;
  return `1/${Math.round(1 / n)}`;
}

function formatFocal(f) {
  const n = rationalToNumber(f);
  return n ? `${Math.round(n)}mm` : null;
}

// Deterministic thumb colors derived from a string seed (filename / sha1).
// Picks from a palette that matches the design's visual language.
const THUMB_PALETTE = [
  ['#3a4a6b', '#d8a657'],
  ['#1f3a2e', '#6cae75'],
  ['#5e6e3b', '#c9bf8b'],
  ['#6b5a3c', '#e3d9b8'],
  ['#2d4a55', '#7fb8c4'],
  ['#7a3a2e', '#e0b58e'],
  ['#3e4a5c', '#b8c4d8'],
  ['#8a6f3c', '#e9d5a4'],
  ['#5a2e2e', '#d4a35a'],
  ['#4a3e2a', '#c4ad7a'],
  ['#2a3f4d', '#9cb8c8'],
  ['#1f2a3a', '#d4a35a'],
];
export function thumbColors(seed) {
  if (!seed) seed = 'x';
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  const [thumbColor, thumbAccent] = THUMB_PALETTE[Math.abs(h) % THUMB_PALETTE.length];
  return { thumbColor, thumbAccent };
}

// Some EXIF GPS fields come as DMS rationals: "50/1, 51/1, 12.34/1" or
// as a structured array of three rationals. Convert either to a single
// decimal degree value.
function dmsToDecimal(raw) {
  if (raw == null) return null;
  // Already decimal?
  const direct = parseFloat(raw);
  if (Number.isFinite(direct) && !String(raw).includes(',') && !String(raw).includes('/')) {
    return direct;
  }
  const parts = String(raw)
    .split(/[,;]/)
    .map((s) => rationalToNumber(s.trim()))
    .filter((n) => n != null);
  if (parts.length < 1) return null;
  const [d = 0, m = 0, s = 0] = parts;
  return d + m / 60 + s / 3600;
}

function applyGpsRef(value, ref) {
  if (value == null) return null;
  const r = String(ref || '').toUpperCase();
  return r === 'S' || r === 'W' ? -value : value;
}

// Look up GPS from extmetadata first (it's already decimal + signed),
// fall back to commonmetadata, then to raw EXIF metadata.
function extractGps(metadata, commonmetadata, extmetadata) {
  // extmetadata = { GPSLatitude: { value: "50.853", source: "..."} , ... }
  if (extmetadata) {
    const lat = parseFloat(extmetadata.GPSLatitude?.value);
    const lon = parseFloat(extmetadata.GPSLongitude?.value);
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      // extmetadata signs already if Ref was applied — but some MW versions
      // don't, so re-apply Ref defensively if both fields exist.
      const latRef = extmetadata.GPSLatitudeRef?.value;
      const lonRef = extmetadata.GPSLongitudeRef?.value;
      const finalLat = latRef && Math.abs(lat) === lat ? applyGpsRef(Math.abs(lat), latRef) : lat;
      const finalLon = lonRef && Math.abs(lon) === lon ? applyGpsRef(Math.abs(lon), lonRef) : lon;
      return { lat: finalLat, lon: finalLon };
    }
  }
  // commonmetadata + raw metadata = arrays of {name, value}
  const meta = [...(metadata || []), ...(commonmetadata || [])];
  const latRaw = exifField(meta, 'GPSLatitude');
  const lonRaw = exifField(meta, 'GPSLongitude');
  const latRef = exifField(meta, 'GPSLatitudeRef');
  const lonRef = exifField(meta, 'GPSLongitudeRef');
  if (latRaw == null || lonRaw == null) return null;
  const latDec = dmsToDecimal(latRaw);
  const lonDec = dmsToDecimal(lonRaw);
  if (latDec == null || lonDec == null) return null;
  return {
    lat: applyGpsRef(latDec, latRef),
    lon: applyGpsRef(lonDec, lonRef),
  };
}

// Extract dateTaken / author / camera / lens / etc. from EXIF + commonmetadata.
function extractExif(metadata, commonmetadata, extmetadata) {
  const meta = [...(metadata || []), ...(commonmetadata || [])];
  const dateTaken = exifDateToIso(exifField(meta, 'DateTimeOriginal'))
    || exifDateToIso(exifField(meta, 'DateTime'));
  const author = exifField(meta, 'Artist') || exifField(meta, 'Author') || '';
  const make = exifField(meta, 'Make');
  const model = exifField(meta, 'Model');
  const camera = [make, model].filter(Boolean).join(' ').trim() || undefined;
  const lens = exifField(meta, 'LensModel') || exifField(meta, 'Lens') || undefined;
  const isoStr = exifField(meta, 'ISOSpeedRatings') || exifField(meta, 'PhotographicSensitivity');
  const iso = isoStr ? Number(isoStr) || undefined : undefined;
  const aperture = formatAperture(exifField(meta, 'FNumber'));
  const shutter = formatShutter(exifField(meta, 'ExposureTime'));
  const focal = formatFocal(exifField(meta, 'FocalLength'));
  const gps = extractGps(metadata, commonmetadata, extmetadata);
  return { dateTaken, author, camera, lens, iso, aperture, shutter, focal, gps };
}

// Flatten the raw EXIF + commonmetadata blocks into a single deduplicated
// list of {name, value} pairs. Used by the fixed-EXIF chip popover (T426450)
// to show the user EVERYTHING the file is carrying — not just the seven
// curated fields the table promotes to columns.
//
// Derived-runtime only: we never persist this to the user-store wiki page
// (it'd be derived data the API can hand back any time, and it can be huge
// for raw camera dumps). See CLAUDE.md "Don't persist derived data".
//
// Dedup rule: when the same name appears in both `metadata` and
// `commonmetadata`, prefer the first-seen value. Names matching the seven
// curated EXIF fields are kept (the popover surfaces them as the chip's own
// value AND they remain present in this list as-is from the API — the
// caller decides whether to filter the "self" entry).
function extractRawExif(metadata, commonmetadata) {
  const out = [];
  const seen = new Set();
  for (const block of [metadata, commonmetadata]) {
    if (!Array.isArray(block)) continue;
    for (const entry of block) {
      const name = entry?.name;
      if (!name || name === '_type') continue;
      if (seen.has(name)) continue;
      const value = flattenMetaValue(entry.value);
      if (value == null || value === '') continue;
      out.push({ name, value });
      seen.add(name);
    }
  }
  return out;
}

// Build a Commons thumbnail URL via Special:FilePath. The redirect-target is
// cached by the browser so this is just-as-fast as the canonical thumb URL,
// and it works for any width without us needing the file's MD5 hash.
export function commonsThumbUrl(filename, width = 320) {
  if (!filename) return null;
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(filename)}?width=${width}`;
}

// Compute the stash-expiry timestamp from the upload time.
function computeExpiry(uploadedAt) {
  if (!uploadedAt) return null;
  const t = new Date(uploadedAt).getTime();
  if (Number.isNaN(t)) return null;
  return new Date(t + STASH_EXPIRY_HOURS * 60 * 60 * 1000).toISOString();
}

// --- Public normalizers ---

export function normalizeStashItem(file, info) {
  const filename = file?.filename || file?.filekey || info?.filekey || '';
  const seed = info?.sha1 || filename;
  const colors = thumbColors(seed);
  const exif = info ? extractExif(info.metadata, info.commonmetadata, info.extmetadata) : {};
  // rawExif: full {name, value} list of every EXIF / commonmetadata entry the
  // API exposed for this file. Drives the click-to-explain popover on fixed-
  // value chips (T426450). Derived-runtime only — never persisted to user-
  // store. Empty array (not undefined) so consumers can map without guarding.
  const rawExif = info ? extractRawExif(info.metadata, info.commonmetadata) : [];
  const uploadedAt = info?.timestamp || file?.timestamp || null;

  return {
    id: file?.filekey || info?.filekey,
    status: 'stash',
    filekey: file?.filekey || info?.filekey,
    filename,
    // Pre-fill the title with the original filename sans extension. The
    // user is far more likely to tweak a sensible default than to type a
    // descriptive title from scratch; "DSC0001" filenames will get caught
    // by the title validator (camera-name soft warning) so the user knows
    // to replace them.
    title: filename ? filename.replace(/\.[^.]+$/, '') : '',
    // Caption (SDC label). `description` is the legacy single-string field
    // (English by convention); `descriptions` is the per-language map that
    // backs the multi-language Caption columns. Both stay in sync via
    // setCaptionValue (src/captions.js). Initialised empty here — drafts
    // and on-publish wbgetentities labels (see normalizePublishedFile)
    // populate as the user / wiki provides them. (T426422.)
    description: '',
    descriptions: {},
    bytes: info?.size || file?.size || 0,
    mime: info?.mime || file?.mimetype || file?.type || 'application/octet-stream',
    width: info?.width || file?.width || 0,
    height: info?.height || file?.height || 0,
    uploadedAt,
    expiresAt: computeExpiry(uploadedAt),
    sha1: info?.sha1 || null,
    thumburl: info?.thumburl || null,
    url: info?.url || null,
    author: exif.author || '',
    // Source is left empty so the licence-coupling can resolve it at
    // publish time — own-work licences (CC0 / CC BY 4.0 / CC BY-SA 4.0)
    // become `{{own}}`; everything else stays empty until the user fills
    // it in. See `effectiveSource()` in api/publish.js (T425949).
    source: '',
    license: '',
    categories: [],
    depicts: [],
    dateTaken: exif.dateTaken || null,
    camera: exif.camera,
    lens: exif.lens,
    iso: exif.iso,
    aperture: exif.aperture,
    shutter: exif.shutter,
    focal: exif.focal,
    rawExif,
    // GPS from EXIF is the camera location. The user can later set object
    // location (where the depicted thing actually sits) and locationOfCreation
    // (a Wikidata QID for the place) explicitly; those don't come from EXIF.
    coords: exif.gps || null,
    cameraLocation: exif.gps || null,
    objectLocation: null,
    locationOfCreation: null,
    issues: [],
    ...colors,
  };
}

// Strip HTML tags from extmetadata values. Commons returns description, etc.
// pre-rendered with anchor tags and entities; for our table we want plain text.
function stripHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim();
}

// Some extmetadata fields (notably ImageDescription) come back as a multilingual
// object even when iiextmetadatamultilang=0 is requested — that flag only
// suppresses the wrapper for fields that have a single language; multi-lang
// fields still surface the full {en, nl, ..., _type: 'lang'} bag. Pick a
// best-effort string: preferred language → English → first available.
function pickLangString(v, prefLang = 'en') {
  if (v == null) return '';
  if (typeof v === 'string' || typeof v === 'number') return String(v);
  if (typeof v === 'object') {
    if (v[prefLang]) return String(v[prefLang]);
    if (v.en) return String(v.en);
    for (const [k, val] of Object.entries(v)) {
      if (k === '_type') continue;
      if (val) return String(val);
    }
  }
  return '';
}

function ext(extmetadata, key) {
  return stripHtml(pickLangString(extmetadata?.[key]?.value));
}

// extmetadata Categories field is pipe-separated, with underscores for spaces.
function parseCategories(extmetadata) {
  const raw = extmetadata?.Categories?.value;
  if (!raw) return [];
  return String(raw)
    .split('|')
    .map((c) => c.replace(/_/g, ' ').trim())
    .filter(Boolean);
}

// SDC entity claim/statement accessor.
//
// `wbgetentities` returns MediaInfo entities (M-pages) with their claims under
// the `statements` key, NOT `claims` — only Item / Property entities use
// `claims`. Older code in this file looked at `entity.claims.PXX` and silently
// got nothing back, which is why depicts (P180), object location (P625),
// inception (P571), and location-of-creation (P1071) all rendered as missing
// even when present on the file. Look at `statements` first, fall back to
// `claims` so this remains compatible if/when we ever fetch a non-MediaInfo
// entity through the same code path. (See T425885.)
function sdcClaims(entity, pid) {
  if (!entity || !pid) return [];
  return entity.statements?.[pid] || entity.claims?.[pid] || [];
}

// SDC label accessor — returns the best caption string (multilingual labels
// on the M-entity = Commons captions). We prefer the requested language,
// then English, then any first available value. Used both for resolving
// QID labels (so depicts pills don't render as "Q123456") and for the
// caption value itself.
function sdcLabel(entity, prefLang = 'en') {
  const labels = entity?.labels || {};
  if (labels[prefLang]?.value) return String(labels[prefLang].value);
  if (labels.en?.value) return String(labels.en.value);
  for (const v of Object.values(labels)) {
    if (v?.value) return String(v.value);
  }
  return '';
}

// Return every SDC label (caption) on the entity as a plain { lang: text }
// map. Drives the multi-language Caption columns (T426422) so a published
// file with captions in several languages already shows them all.
//
// MediaWiki returns labels as `labels: { en: { language, value }, ... }`.
// We strip the wrapping object and return only non-empty `value` strings.
function sdcLabels(entity) {
  const out = {};
  const labels = entity?.labels || {};
  for (const [lang, entry] of Object.entries(labels)) {
    if (!lang) continue;
    const text = entry?.value;
    if (typeof text === 'string' && text.length > 0) out[lang] = String(text);
  }
  return out;
}

// Parse P180 (depicts) claims out of an SDC entity. Each entry is a Wikidata
// Q-id reference. We try to resolve the label to a human-readable string from
// the linked entities map (built by fetching the Q-ids via wbgetentities), so
// pills don't read as bare "Q123456".
function parseDepicts(entity, qidLabels) {
  return sdcClaims(entity, 'P180')
    .map((c) => {
      const v = c?.mainsnak?.datavalue?.value;
      if (!v?.id) return null;
      const label = (qidLabels && qidLabels.get(v.id)) || v.id;
      return { qid: v.id, label };
    })
    .filter(Boolean);
}

// Parse P625 (coordinate location) — the location of the depicted subject,
// our `objectLocation` field. SDC values are
// {latitude, longitude, altitude, precision, globe} on the mainsnak datavalue.
// P9149 (coordinates of depicted place) is treated as an alias of P625 — both
// describe where the subject is — and we accept either.
function parseCoordLocation(entity) {
  for (const pid of ['P625', 'P9149']) {
    for (const c of sdcClaims(entity, pid)) {
      const v = c?.mainsnak?.datavalue?.value;
      if (v && Number.isFinite(v.latitude) && Number.isFinite(v.longitude)) {
        return { lat: v.latitude, lon: v.longitude };
      }
    }
  }
  return null;
}

// Parse P1259 (coordinates of the point of view) — the camera's position
// when the photo was taken. Wins over EXIF GPS because the uploader
// explicitly asserted it; EXIF GPS is the camera's automatic record.
function parseCameraLocation(entity) {
  for (const c of sdcClaims(entity, 'P1259')) {
    const v = c?.mainsnak?.datavalue?.value;
    if (v && Number.isFinite(v.latitude) && Number.isFinite(v.longitude)) {
      return { lat: v.latitude, lon: v.longitude };
    }
  }
  return null;
}

// Parse P1071 (location of creation) — a Q-id reference. Resolve label from
// the qidLabels map when available; fall back to the QID so the cell still
// renders something.
function parseLocationOfCreation(entity, qidLabels) {
  for (const c of sdcClaims(entity, 'P1071')) {
    const v = c?.mainsnak?.datavalue?.value;
    if (v?.id) {
      const label = (qidLabels && qidLabels.get(v.id)) || v.id;
      return { qid: v.id, label };
    }
  }
  return null;
}

// Parse P571 (inception). SDC time format is
// {time: "+2023-11-19T00:00:00Z", precision: 11, ...}. We return ISO when the
// precision is at least day-level (11); coarser precisions (year/month) are
// also surfaced as the leading slice so the user sees something meaningful.
function parseInception(entity) {
  for (const c of sdcClaims(entity, 'P571')) {
    const v = c?.mainsnak?.datavalue?.value;
    if (!v?.time) continue;
    // Strip the leading + sign that Wikibase always emits.
    const raw = String(v.time).replace(/^\+/, '');
    // Precision: 9=year, 10=month, 11=day, 12=hour, 13=minute, 14=second.
    if (v.precision >= 11) return raw;
    if (v.precision === 10) return raw.slice(0, 7); // YYYY-MM
    if (v.precision === 9) return raw.slice(0, 4); // YYYY
    return raw;
  }
  return null;
}

// Parse P170 (creator). On Commons SDC this is almost always a `somevalue`
// snak (no direct Q-id) carrying an `author name string` qualifier (P2093)
// and/or a `Wikimedia username` qualifier (P4174). Fall back to the linked
// entity label if the snak is a real value.
function parseCreator(entity, qidLabels) {
  for (const c of sdcClaims(entity, 'P170')) {
    const snak = c?.mainsnak;
    if (!snak) continue;
    if (snak.snaktype === 'value') {
      const id = snak.datavalue?.value?.id;
      if (id) return (qidLabels && qidLabels.get(id)) || id;
    }
    // somevalue: pull the author-name qualifier (P2093 or P4174).
    const qf = c?.qualifiers || {};
    const nameSnak = qf.P2093?.[0] || qf.P4174?.[0];
    const name = nameSnak?.datavalue?.value;
    if (name) return String(name);
  }
  return '';
}

// Parse P275 (copyright license) — Q-id reference. Maps to a human label
// where we have it (e.g. Q20007257 → "CC BY-SA 4.0"); falls back to QID.
function parseLicense(entity, qidLabels) {
  for (const c of sdcClaims(entity, 'P275')) {
    const v = c?.mainsnak?.datavalue?.value;
    if (v?.id) return (qidLabels && qidLabels.get(v.id)) || v.id;
  }
  return '';
}

// Collect every Q-id referenced by the claims we care about, so the caller
// can resolve labels in a single batched wbgetentities call.
export function collectReferencedQids(entity) {
  const out = new Set();
  if (!entity) return out;
  const propIds = ['P180', 'P1071', 'P170', 'P275'];
  for (const pid of propIds) {
    for (const c of sdcClaims(entity, pid)) {
      const id = c?.mainsnak?.datavalue?.value?.id;
      if (id) out.add(id);
    }
  }
  return out;
}

// Detailed published item — page from generator=allimages with imageinfo +
// extmetadata + the SDC entity from wbgetentities. All extmetadata fields
// are optional; we fall back to filename for title, etc.
//
// `qidLabels` is an optional Map<qid, label> the caller has prefetched so we
// can render depicts pills and similar Q-id references with real labels
// instead of bare "Q123456" strings.
//
// Per maintainer's T425885 follow-up (2026-05-11): when a value exists in
// SDC AND in extmetadata/wikitext, prefer SDC. SDC is the uploader's
// explicit assertion; extmetadata is parsed from the wikitext template,
// which is often a generic boilerplate string ("Own work", a license
// shortname, etc.). The merge order below reflects that.
export function normalizeHistoryDetailedItem(page, sdcEntity, qidLabels) {
  const filename = (page?.title || '').replace(/^File:/, '');
  const ii = page?.imageinfo?.[0] || {};
  const xm = ii.extmetadata || {};
  const seed = ii.sha1 || filename;
  const colors = thumbColors(seed);

  // EXIF / camera metadata. extmetadata strips most of the raw EXIF tags, so
  // for camera/lens/iso/aperture/shutter/focal/GPS we look at commonmetadata
  // (the parsed-but-not-templated tag list). metadata is the raw form from
  // some MW versions; check both.
  const exif = extractExif(ii.metadata, ii.commonmetadata, xm);
  // Full raw EXIF list for the fixed-EXIF chip popover (T426450). Same
  // derived-runtime treatment as on stash items.
  const rawExif = extractRawExif(ii.metadata, ii.commonmetadata);

  // SDC properties.
  const objectLocation = parseCoordLocation(sdcEntity);
  const sdcCameraLocation = parseCameraLocation(sdcEntity);
  const locationOfCreation = parseLocationOfCreation(sdcEntity, qidLabels);
  const inception = parseInception(sdcEntity);
  const sdcCreator = parseCreator(sdcEntity, qidLabels);
  const sdcLicense = parseLicense(sdcEntity, qidLabels);
  // SDC caption (the M-entity multilingual labels). Per maintainer's
  // 2026-05-11 follow-up, this is what "Description" should now render —
  // the field is being renamed to "Caption" to match Commons terminology.
  // T426422: keep the legacy single-string `description` (English by
  // convention) AND surface every language as a `descriptions` map so the
  // per-language Caption columns can render them without re-fetching.
  const captionLabels = sdcLabels(sdcEntity);
  const caption = captionLabels.en || sdcLabel(sdcEntity);

  // Date precedence: SDC P571 (uploader's explicit "this is when the photo
  // was taken") wins over EXIF DateTimeOriginal (camera-internal clock,
  // sometimes wrong). Fall back to extmetadata's pre-parsed date strings.
  const dateTaken =
    inception ||
    exif.dateTaken ||
    ext(xm, 'DateTimeOriginal') ||
    ext(xm, 'DateTime');

  return {
    id: page?.title || filename,
    pageid: page?.pageid,
    status: 'published',
    filename,
    title: ext(xm, 'ObjectName') || filename.replace(/\.[^.]+$/, ''),
    // "description" is the field key but the column label is "Caption" now.
    // Field key kept stable for back-compat with drafts, app.jsx field order,
    // detail panel switch cases, missing-description issue codes, etc.
    description: caption || ext(xm, 'ImageDescription'),
    // Per-language captions for the multi-language Caption columns
    // (T426422). Keyed by ISO 639-1 lang code (whatever MediaWiki gives us
    // back on the M-entity's labels block). Empty when the file has no
    // SDC captions yet — the table just won't render anything for those
    // languages until the user fills them in.
    descriptions: captionLabels,
    // SDC P170 (creator) wins over extmetadata Artist when both are present.
    author: sdcCreator || ext(xm, 'Artist') || exif.author || '',
    // SDC P275 (copyright license) wins over extmetadata LicenseShortName.
    license: sdcLicense || ext(xm, 'LicenseShortName'),
    source: ext(xm, 'Credit'),
    categories: parseCategories(xm),
    depicts: parseDepicts(sdcEntity, qidLabels),
    dateTaken,
    // EXIF camera fields (none of these come through extmetadata).
    camera: exif.camera,
    lens: exif.lens,
    iso: exif.iso,
    aperture: exif.aperture,
    shutter: exif.shutter,
    focal: exif.focal,
    rawExif,
    // Camera location: SDC P1259 (uploader-asserted point of view) wins
    // over EXIF GPS (camera-internal clock, may be off if GPS hadn't locked).
    // Object location: P625 (or P9149) — coordinate of the depicted subject.
    objectLocation,
    cameraLocation: sdcCameraLocation || exif.gps || null,
    coords: sdcCameraLocation || exif.gps || null,
    locationOfCreation,
    bytes: ii.size || 0,
    mime: ii.mime || 'application/octet-stream',
    width: ii.width || 0,
    height: ii.height || 0,
    sha1: ii.sha1 || null,
    uploadedAt: ii.timestamp,
    publishedAt: ii.timestamp,
    thumburl: commonsThumbUrl(filename, 320),
    largeThumburl: commonsThumbUrl(filename, 1600),
    url: ii.url || null,
    descriptionurl: filename
      ? `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(filename)}`
      : null,
    issues: [],
    _lastSyncedAt: new Date().toISOString(),
    ...colors,
  };
}

export function normalizePublishedItem(f) {
  const filename = (f?.canonicaltitle || f?.name || '').replace(/^File:/, '');
  const title = filename.replace(/\.[^.]+$/, '');
  const seed = f?.sha1 || filename;
  const colors = thumbColors(seed);

  return {
    id: f?.canonicaltitle || f?.name,
    status: 'published',
    filename,
    title,
    bytes: f?.size || 0,
    mime: f?.mime || 'application/octet-stream',
    width: f?.width || 0,
    height: f?.height || 0,
    uploadedAt: f?.timestamp,
    publishedAt: f?.timestamp,
    sha1: f?.sha1 || null,
    // Small thumb (320px) for cards/table; large thumb (1600px) for the
    // lightbox. Both go through Special:FilePath so we don't need the file's
    // MD5 to build a canonical thumb URL.
    thumburl: commonsThumbUrl(filename, 320),
    largeThumburl: commonsThumbUrl(filename, 1600),
    url: f?.url || null,
    descriptionurl:
      f?.descriptionurl ||
      (filename ? `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(filename)}` : null),
    author: '',
    license: '',
    categories: [],
    depicts: [],
    issues: [],
    ...colors,
  };
}
