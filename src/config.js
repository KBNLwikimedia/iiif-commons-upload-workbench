// Upload Workbench — Configuration
//
// Secrets live in `.env.local` (gitignored). Copy `.env.example` to `.env.local`
// and fill in your values. Vite exposes any var prefixed with `VITE_` to the
// browser via `import.meta.env`.

export const CLIENT_ID = import.meta.env.VITE_OAUTH_CLIENT_ID || '';
export const CLIENT_SECRET = import.meta.env.VITE_OAUTH_CLIENT_SECRET || '';

// Owner-only access token — bypasses the OAuth redirect flow for testing.
// Leave VITE_OWNER_ACCESS_TOKEN unset (or empty) to use the normal PKCE flow.
export const OWNER_ACCESS_TOKEN = import.meta.env.VITE_OWNER_ACCESS_TOKEN || '';

export const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';
export const OAUTH_AUTHORIZE_URL = 'https://meta.wikimedia.org/w/rest.php/oauth2/authorize';
export const OAUTH_TOKEN_URL = 'https://meta.wikimedia.org/w/rest.php/oauth2/access_token';
export const OAUTH_PROFILE_URL = 'https://meta.wikimedia.org/w/rest.php/oauth2/resource/profile';

export const REDIRECT_URI = window.location.origin + '/';

export const STASH_EXPIRY_HOURS = 48;
export const APP_USER_AGENT = 'UploadWorkbench/0.39 (https://gitlab.wikimedia.org/daanvr/upload-workbench)';

// Edit-summary attribution suffix (T425978).
//
// Every write to Commons (action=upload publish, action=edit on File:/User:
// pages, action=wbeditentity for SDC) appends this so a human reading the page
// history can click straight through to the tool and see the exact version
// that wrote the edit. The version is the full SemVer from package.json
// (`__APP_VERSION__` is a Vite compile-time define, see vite.config.js) — not
// the truncated APP_USER_AGENT MAJOR.MINOR — so post-hoc debugging can pinpoint
// behavior precisely.
//
// MediaWiki edit summaries don't support external URLs (a raw URL or `[URL
// text]` renders as plain text, and `[[URL|text]]` is parsed as an internal
// page-title link to the literal URL string and renders as a redlink). Use the
// `toolforge:` interwiki prefix instead — it renders as a clickable extiw
// link, and `iw.toolforge.org/upload-workbench` 301-redirects to the live tool
// for free. Always points at the live root (not a version-pinned /v<X.Y.Z>/
// archive) so a curious editor reading a page history clicks straight through
// to the current tool.
//
// Helper, not a constant, so the build-time `__APP_VERSION__` resolves at the
// call site. Returns the suffix already prefixed with a space so callers can
// just concatenate to whatever summary they already had (or use it standalone
// for writes that have no per-call summary).
export function attributionSuffix() {
  return ` [[:toolforge:upload-workbench|with Upload Workbench]] v${__APP_VERSION__}`;
}

// When no client_id is configured, the app runs against SAMPLE_UPLOADS in data.js
// instead of hitting the live Commons API. Set VITE_OAUTH_CLIENT_ID to switch.
export const DEMO_MODE = !CLIENT_ID;
