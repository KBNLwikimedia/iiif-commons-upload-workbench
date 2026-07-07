// Upload Workbench — OAuth 2.0 PKCE Flow

import {
  CLIENT_ID,
  CLIENT_SECRET,
  OWNER_ACCESS_TOKEN,
  OAUTH_AUTHORIZE_URL,
  OAUTH_TOKEN_URL,
  OAUTH_PROFILE_URL,
  REDIRECT_URI,
  DEMO_MODE,
} from '../config.js';

// When an owner-only access token is configured, we use it directly
// instead of going through the PKCE redirect flow.
const hasOwnerToken = Boolean(OWNER_ACCESS_TOKEN);

const STORAGE_PREFIX = 'uwb_';
const KEYS = {
  accessToken: STORAGE_PREFIX + 'access_token',
  tokenExpires: STORAGE_PREFIX + 'token_expires',
  refreshToken: STORAGE_PREFIX + 'refresh_token',
  codeVerifier: STORAGE_PREFIX + 'code_verifier',
  oauthState: STORAGE_PREFIX + 'oauth_state',
};

// --- PKCE Helpers ---

function base64urlEncode(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function generateCodeVerifier() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return base64urlEncode(array);
}

async function generateCodeChallenge(verifier) {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return base64urlEncode(digest);
}

function generateState() {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return base64urlEncode(array);
}

// --- Token Storage ---

function storeTokens(tokenData) {
  sessionStorage.setItem(KEYS.accessToken, tokenData.access_token);
  sessionStorage.setItem(
    KEYS.tokenExpires,
    String(Date.now() + tokenData.expires_in * 1000)
  );
  if (tokenData.refresh_token) {
    localStorage.setItem(KEYS.refreshToken, tokenData.refresh_token);
  }
}

function clearTokens() {
  sessionStorage.removeItem(KEYS.accessToken);
  sessionStorage.removeItem(KEYS.tokenExpires);
  sessionStorage.removeItem(KEYS.codeVerifier);
  sessionStorage.removeItem(KEYS.oauthState);
  localStorage.removeItem(KEYS.refreshToken);
}

// --- Public API ---

export async function login() {
  if (DEMO_MODE || hasOwnerToken) return;

  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  const state = generateState();

  sessionStorage.setItem(KEYS.codeVerifier, codeVerifier);
  sessionStorage.setItem(KEYS.oauthState, state);

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state,
  });

  window.location.href = `${OAUTH_AUTHORIZE_URL}?${params}`;
}

export async function handleCallback() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const returnedState = params.get('state');

  if (!code) return false;

  const savedState = sessionStorage.getItem(KEYS.oauthState);
  if (returnedState !== savedState) {
    console.error('OAuth state mismatch — possible CSRF attack');
    clearTokens();
    return false;
  }

  const codeVerifier = sessionStorage.getItem(KEYS.codeVerifier);
  if (!codeVerifier) {
    console.error('No code verifier found in session');
    return false;
  }

  try {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      code_verifier: codeVerifier,
      code_challenge_method: 'S256',
    });

    const response = await fetch(OAUTH_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    if (!response.ok) {
      throw new Error(`Token exchange failed: ${response.status}`);
    }

    const tokenData = await response.json();
    storeTokens(tokenData);

    // Clean URL
    const cleanUrl = window.location.origin + window.location.pathname;
    history.replaceState(null, '', cleanUrl);

    return true;
  } catch (err) {
    console.error('OAuth callback error:', err);
    clearTokens();
    return false;
  }
}

export async function refreshAccessToken() {
  const refreshToken = localStorage.getItem(KEYS.refreshToken);
  if (!refreshToken) return null;

  try {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: CLIENT_ID,
    });

    // Include client_secret if available (T323855 workaround)
    if (CLIENT_SECRET) {
      body.set('client_secret', CLIENT_SECRET);
    }

    const response = await fetch(OAUTH_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    if (!response.ok) return null;

    const tokenData = await response.json();
    storeTokens(tokenData);
    return tokenData.access_token;
  } catch {
    return null;
  }
}

export async function getAccessToken() {
  if (DEMO_MODE) return null;

  // Owner-only token takes priority
  if (hasOwnerToken) return OWNER_ACCESS_TOKEN;

  const token = sessionStorage.getItem(KEYS.accessToken);
  const expires = sessionStorage.getItem(KEYS.tokenExpires);

  if (token && expires && Date.now() < Number(expires)) {
    return token;
  }

  // Try refresh
  return refreshAccessToken();
}

export function isAuthenticated() {
  if (DEMO_MODE) return false;
  if (hasOwnerToken) return true;
  const token = sessionStorage.getItem(KEYS.accessToken);
  const expires = sessionStorage.getItem(KEYS.tokenExpires);
  return Boolean(token && expires && Date.now() < Number(expires));
}

export async function fetchUserProfile() {
  if (DEMO_MODE) return window.SAMPLE_USER;

  const token = await getAccessToken();
  if (!token) return null;

  const response = await fetch(OAUTH_PROFILE_URL, {
    headers: { 'Authorization': `Bearer ${token}` },
  });

  if (!response.ok) return null;
  return response.json();
}

export function logout() {
  clearTokens();
  window.location.reload();
}
