// Detailed history fetch.
//
// Two-step because `generator=allimages` returns pages in pageid order,
// NOT timestamp order, so a single-call generator fetch silently misses
// the user's most recent uploads. Instead we:
//
//   1. `list=allimages` (cheap, sorted by timestamp) — get the latest N
//      filenames + pageids + sha1 + url + dimensions in one call.
//   2. `prop=imageinfo&iiprop=extmetadata&titles=…` (batched ≤50 per call)
//      — enrich with Commons' parsed metadata block (ImageDescription,
//      Artist, LicenseShortName, Categories, DateTime). Wikitext parsing
//      happens server-side; we don't touch it.
//   3. `wbgetentities&ids=M<pageid>|…` (batched ≤50) — SDC P180 depicts.
//
// Steps 2 and 3 are best-effort; we still return the basic fields if
// either fails. Step 1's order is preserved end-to-end.

import { COMMONS_API } from '../config.js';
import { fetchJSON } from '../utils.js';
import { collectReferencedQids, normalizeHistoryDetailedItem } from './normalize.js';

const ALLIMAGES_PER_CALL = 500;
const TITLES_BATCH = 50;
const SDC_BATCH = 50;
// wbgetentities accepts up to 50 ids per request, same as MediaInfo. Used for
// resolving Q-id labels (depicts, P170 creator, P275 license, P1071 location
// of creation) in a single batched pass after we know which Q-ids the SDC
// statements reference.
const WIKIDATA_API = 'https://www.wikidata.org/w/api.php';
const QID_BATCH = 50;

export async function fetchHistoryDetailed(username, { limit = 50 } = {}) {
  const ailimit = Math.min(limit, ALLIMAGES_PER_CALL);

  // Step 1: get the N latest files in correct timestamp order.
  const listParams = new URLSearchParams({
    action: 'query',
    list: 'allimages',
    aiuser: username,
    aisort: 'timestamp',
    aidir: 'older',
    ailimit: String(ailimit),
    aiprop: 'timestamp|url|size|dimensions|mime|sha1|canonicaltitle',
    format: 'json',
    formatversion: '2',
    origin: '*',
  });
  const listData = await fetchJSON(`${COMMONS_API}?${listParams}`, { noCache: true });
  const files = listData.query?.allimages || [];
  if (!files.length) return { items: [], continueToken: listData.continue?.aicontinue || null };

  // Step 2: enrich those exact titles with extmetadata + raw EXIF. Batch by 50.
  // We pull `commonmetadata` (parsed EXIF) so camera/lens/iso/aperture/shutter
  // /focal/GPS surface on history rows — extmetadata strips most raw tags.
  // `metadata` is included as a fallback for older MW versions that surface
  // GPS only there.
  const titlesByCanonical = new Map(); // canonicalTitle -> { pageid, extmetadata, metadata, commonmetadata }
  for (let i = 0; i < files.length; i += TITLES_BATCH) {
    const slice = files.slice(i, i + TITLES_BATCH);
    const titles = slice.map((f) => f.canonicaltitle || `File:${f.name}`).join('|');
    const detailParams = new URLSearchParams({
      action: 'query',
      titles,
      prop: 'info|imageinfo',
      iiprop: 'extmetadata|metadata|commonmetadata',
      iiextmetadatalanguage: 'en',
      iiextmetadatamultilang: '0',
      format: 'json',
      formatversion: '2',
      origin: '*',
    });
    try {
      const detailData = await fetchJSON(`${COMMONS_API}?${detailParams}`, { noCache: true });
      for (const p of detailData.query?.pages || []) {
        if (p.title && !p.missing) {
          const ii = p.imageinfo?.[0] || {};
          titlesByCanonical.set(p.title, {
            pageid: p.pageid,
            extmetadata: ii.extmetadata || {},
            metadata: ii.metadata || null,
            commonmetadata: ii.commonmetadata || null,
          });
        }
      }
    } catch (e) {
      console.warn('extmetadata batch failed:', e.message);
    }
  }

  // Step 3: SDC (claims + captions) for the pageids we now know.
  const pageids = [...titlesByCanonical.values()].map((v) => v.pageid).filter(Boolean);
  const sdcByMid = await fetchSdcBatch(pageids);

  // Step 4: collect every Q-id referenced by depicts/creator/license/loc-of-
  // creation statements across the page set, then resolve their labels in
  // one batched Wikidata wbgetentities call. Without this pass the depicts
  // pills render as bare "Q123456" strings.
  const allQids = new Set();
  for (const ent of sdcByMid.values()) {
    for (const q of collectReferencedQids(ent)) allQids.add(q);
  }
  const qidLabels = await fetchQidLabels([...allQids]);

  // Merge: files (correct order) + extmetadata + SDC.
  const items = files.map((f) => {
    const canonical = f.canonicaltitle || `File:${f.name}`;
    const detail = titlesByCanonical.get(canonical) || {};
    const mergedPage = {
      pageid: detail.pageid,
      title: canonical,
      imageinfo: [
        {
          // basics from list=allimages
          timestamp: f.timestamp,
          sha1: f.sha1,
          url: f.url,
          size: f.size,
          width: f.width,
          height: f.height,
          mime: f.mime,
          // parsed metadata from the titles call
          extmetadata: detail.extmetadata || {},
          metadata: detail.metadata || null,
          commonmetadata: detail.commonmetadata || null,
        },
      ],
    };
    return normalizeHistoryDetailedItem(
      mergedPage,
      sdcByMid.get(`M${detail.pageid}`),
      qidLabels,
    );
  });

  return {
    items,
    continueToken: listData.continue?.aicontinue || null,
  };
}

// Fetch a single file's detailed metadata — used for per-row Refresh.
export async function fetchHistoryOne(filename) {
  const title = filename.startsWith('File:') ? filename : `File:${filename}`;
  const params = new URLSearchParams({
    action: 'query',
    titles: title,
    prop: 'info|imageinfo',
    // Include metadata + commonmetadata so EXIF (camera/lens/iso/aperture/
    // shutter/focal) and GPS coordinates that don't surface in extmetadata
    // make it onto the per-row refresh result. See fetchHistoryDetailed.
    iiprop: 'timestamp|url|size|dimensions|mime|sha1|extmetadata|metadata|commonmetadata',
    iiurlwidth: '320',
    iiextmetadatalanguage: 'en',
    iiextmetadatamultilang: '0',
    format: 'json',
    formatversion: '2',
    origin: '*',
  });
  const data = await fetchJSON(`${COMMONS_API}?${params}`, { noCache: true });
  const page = data.query?.pages?.[0];
  if (!page || page.missing) return null;

  const sdcByMid = await fetchSdcBatch([page.pageid].filter(Boolean));
  const entity = sdcByMid.get(`M${page.pageid}`);
  // Resolve referenced Q-id labels for this single row.
  const qids = [...collectReferencedQids(entity)];
  const qidLabels = await fetchQidLabels(qids);
  return normalizeHistoryDetailedItem(page, entity, qidLabels);
}

// wbgetentities supports up to 50 ids per call. Chunk if more.
//
// We request `claims|labels` so we get both the SDC statements (depicts,
// P625, P571, P170, P275, P1071, P1259, P9149) AND the M-entity labels
// (Commons captions). Asking for both in one round-trip is cheaper than
// two separate calls.
async function fetchSdcBatch(pageids) {
  if (!pageids.length) return new Map();
  const out = new Map();
  for (let i = 0; i < pageids.length; i += SDC_BATCH) {
    const slice = pageids.slice(i, i + SDC_BATCH);
    const ids = slice.map((id) => `M${id}`).join('|');
    const params = new URLSearchParams({
      action: 'wbgetentities',
      ids,
      props: 'claims|labels',
      format: 'json',
      formatversion: '2',
      origin: '*',
    });
    try {
      const data = await fetchJSON(`${COMMONS_API}?${params}`);
      for (const [mid, entity] of Object.entries(data.entities || {})) {
        out.set(mid, entity);
      }
    } catch (e) {
      console.warn('SDC batch failed for', slice, e.message);
    }
  }
  return out;
}

// Resolve Wikidata Q-id labels to human strings. Used to turn depicts,
// creator, license and location-of-creation Q-ids into readable pill text.
// Batched 50 per call. Returns Map<qid, labelString>.
async function fetchQidLabels(qids) {
  const out = new Map();
  if (!qids?.length) return out;
  for (let i = 0; i < qids.length; i += QID_BATCH) {
    const slice = qids.slice(i, i + QID_BATCH);
    const params = new URLSearchParams({
      action: 'wbgetentities',
      ids: slice.join('|'),
      props: 'labels',
      languages: 'en',
      languagefallback: '1',
      format: 'json',
      formatversion: '2',
      origin: '*',
    });
    try {
      const data = await fetchJSON(`${WIKIDATA_API}?${params}`);
      for (const [qid, ent] of Object.entries(data.entities || {})) {
        const labels = ent?.labels || {};
        const lbl = labels.en?.value || Object.values(labels)[0]?.value;
        if (lbl) out.set(qid, String(lbl));
      }
    } catch (e) {
      console.warn('QID label batch failed:', e.message);
    }
  }
  return out;
}
