// GitLab read-only API helpers.
//
// Used by the in-app info modal to list open merge requests (each backed by a
// preview build at /mr-<iid>/) and to render the latest CHANGELOG.md (so old
// archived versions can still show what shipped after them).
//
// Both endpoints are unauthenticated and CORS-enabled by gitlab.wikimedia.org
// (Access-Control-Allow-Origin: *), so the browser can call them directly.

import { apiCache } from '../utils.js';

const PROJECT_ID = 4464; // gitlab.wikimedia.org/daanvr/upload-workbench
const API = 'https://gitlab.wikimedia.org/api/v4';

export async function fetchOpenMergeRequests() {
  const url = `${API}/projects/${PROJECT_ID}/merge_requests?state=opened&per_page=50&order_by=updated_at&sort=desc`;
  const cached = apiCache.get(url);
  if (cached) return cached;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`GitLab MR fetch failed: HTTP ${r.status}`);
  const data = await r.json();
  apiCache.set(url, data);
  return data;
}

export async function fetchChangelogRaw() {
  // Use the /api/v4/ raw-file endpoint, not /-/raw/main/CHANGELOG.md, because
  // only /api/v4/* sends Access-Control-Allow-Origin (the /-/raw/ path 404s
  // CORS-wise from the browser).
  const url = `${API}/projects/${PROJECT_ID}/repository/files/CHANGELOG.md/raw?ref=main`;
  const cached = apiCache.get(url);
  if (cached) return cached;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Changelog fetch failed: HTTP ${r.status}`);
  const text = await r.text();
  apiCache.set(url, text);
  return text;
}
