// Shared HTTP + caching utilities for Wikimedia API calls.
// Adapted from upload-stash-viewer/src/utils.js.

import { APP_USER_AGENT } from './config.js';
import { getAccessToken, refreshAccessToken, logout } from './api/oauth.js';

class ApiCache {
  constructor() {
    this.cache = new Map();
  }

  get(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expires) {
      this.cache.delete(key);
      return null;
    }
    return entry.data;
  }

  set(key, data, ttlMs = 300000) {
    this.cache.set(key, { data, expires: Date.now() + ttlMs });
  }
}

export const apiCache = new ApiCache();

export async function fetchJSON(url, options = {}) {
  if (!options.noCache) {
    const cached = apiCache.get(url);
    if (cached) return cached;
  }
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  const data = await response.json();
  if (!options.noCache && (!options.method || options.method === 'GET')) {
    apiCache.set(url, data);
  }
  return data;
}

// Fetch with the current OAuth bearer; on 401 refresh once and retry.
// Backwards-compatible: the legacy 3-arg form (url, token, options) still
// works — the explicit token wins, but a 401 will still try to refresh and
// retry transparently.
export async function fetchWithAuth(url, tokenOrOptions, maybeOptions) {
  let providedToken = null;
  let options;
  if (typeof tokenOrOptions === 'string') {
    providedToken = tokenOrOptions;
    options = maybeOptions || {};
  } else {
    options = tokenOrOptions || {};
  }

  let token = providedToken || (await getAccessToken());
  if (!token) throw new Error('Not authenticated');

  // Wikimedia requires `crossorigin=` (empty) on the URL for authenticated CORS.
  const urlObj = new URL(url);
  urlObj.searchParams.set('crossorigin', '');

  const send = async (t) => {
    const headers = {
      ...options.headers,
      Authorization: `Bearer ${t}`,
      'Api-User-Agent': APP_USER_AGENT,
    };
    return fetch(urlObj.toString(), { ...options, headers });
  };

  let response = await send(token);
  if (response.status === 401) {
    // The owner-only token never expires; user-flow tokens do. Try a refresh
    // once and retry the request before giving up.
    const fresh = await refreshAccessToken();
    if (fresh) {
      response = await send(fresh);
    }
    if (response.status === 401) {
      // Still unauthorized after refresh — session is gone. Force a logout
      // so the next render shows the login screen instead of looping
      // through "Failed to fetch".
      logout();
      throw new Error('Session expired. Please log in again.');
    }
  }
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  return response.json();
}
