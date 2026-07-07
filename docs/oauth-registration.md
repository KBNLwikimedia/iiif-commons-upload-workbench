# OAuth 2.0 Consumer Registration — Upload Workbench

How to register the OAuth consumer this app needs to talk to Wikimedia Commons.

## TL;DR

For hackathon / personal testing, register an **owner-only** consumer — it works immediately, no admin review. Switch to a public consumer later when ready to share with others.

## 1. Open the registration form

You must be logged in to your Wikimedia account first.

```
https://meta.wikimedia.org/wiki/Special:OAuthConsumerRegistration/propose/oauth2
```

## 2. Fill in the form

| Field | Value |
|---|---|
| **Application name** | `Upload Workbench` |
| **Consumer version** | `0.1` |
| **Application description** | (paste the block below) |
| **OAuth "callback" URL** | (see below — pick one) |
| **Allow consumer to specify a callback in requests…** | ✅ **Check this** if you want one consumer to work for both dev and production |
| **Contact email address** | your real email |
| **Applicable project** | `*` (all projects — needed for Commons + Meta auth) |
| **Types of grants** | **Request authorization for specific permissions** |
| **Applicable grants** | ✅ Edit existing pages · ✅ **Edit your user CSS/JSON/JavaScript** · ✅ Create, edit, and move pages · ✅ Upload new files · ✅ Upload, replace, and move files |
| **Public RSA key** | leave blank |
| **Restrict to specific IP ranges** | leave blank |
| **OAuth 2 client type** | **Public client (PKCE only)** — do **not** check "confidential" |
| **This consumer is for use only by [your username]** | ✅ **Check** for owner-only (works immediately). Uncheck only when you want others to use it (requires admin review) |

### Application description (paste)

```
Upload Workbench is a browser-based "spreadsheet" cockpit for Wikimedia Commons contributors. It lets users see their upload stash and recent history side-by-side, fill in metadata across many files at once with a table-style editor, drag-drop new files into the stash, and publish — all from one screen.

The tool runs entirely in the browser (no backend server). Authentication is OAuth 2.0 with PKCE. Source: https://gitlab.wikimedia.org/daanvr/upload-workbench
```

### Callback URL

Wikimedia OAuth 2.0 lets you register one base callback URL, but if you tick "Allow consumer to specify a callback in requests and use 'callback' URL above as a required prefix", any URL that starts with that prefix is accepted. Use that to cover dev + Tailscale + production with one consumer.

| Use case | URL |
|---|---|
| Local dev (this box) | `http://localhost:5175/` |
| Local dev via Tailscale | `http://100.115.199.17:5175/` (your IP may vary) |
| Production (Toolforge, planned) | `https://upload-workbench.toolforge.org/` |
| Production (GitLab Pages, alt) | `https://daanvr.gitlab.io/upload-workbench/` |

**Easiest hackathon setup**: register `http://localhost:5175/` as the callback and tick "Allow consumer to specify a callback…". Then the same consumer also accepts the Tailscale URL.

## 3. Submit and copy your credentials

After submitting:
- **Owner-only** consumer → approved instantly. You'll see a "consumer key" (= `client_id`) and "consumer secret" (= `client_secret`) **once** on the success page.
- **Public** consumer → goes into a queue; you'll get the credentials once an admin approves (a few days to two weeks).

> **Save the secret immediately.** It's shown once. If you lose it you have to register a new consumer.

## 4. Drop into `.env.local`

In the repo root:

```bash
cd /home/dev/workspace/repos/upload-workbench
nano .env.local
```

Paste:

```
VITE_OAUTH_CLIENT_ID=<your-consumer-key>
VITE_OAUTH_CLIENT_SECRET=<your-consumer-secret>
VITE_OWNER_ACCESS_TOKEN=
```

Save (`Ctrl-O`, `Enter`, `Ctrl-X` in nano). Vite hot-reloads automatically.

## Why the secret is in source-fetched env files

This is a **non-confidential (public) client** — it runs in the browser, so there's no real way to keep a secret. PKCE provides the security. However, due to a known Wikimedia limitation ([Phabricator T323855](https://phabricator.wikimedia.org/T323855)), public clients may still need the client secret to use refresh tokens. The Wikimedia developers' official guidance is to ship it alongside the client ID and treat both as public values. `.env.local` is gitignored as defence in depth.

## Required grants (reference)

| Grant | Internal name | Why |
|---|---|---|
| Edit existing pages | `editpage` | Edit file description pages after publish (v2 history-edit) |
| **Edit your user CSS/JSON/JavaScript** | `editmyuserjs` | Save drafts + column config to `User:<self>/UploadWorkbenchPreferences.js`. MediaWiki specially protects `.js`/`.json`/`.css` pages under `User:<self>/`, even from the user themselves — `editpage` alone is not enough. |
| Create, edit, and move pages | `createeditmovepage` | Create new file description pages on publish; create the user-store page first time |
| Upload new files | `uploadfile` | Upload to stash + publish from stash |
| Upload, replace, and move files | `uploadeditmovefile` | Replace / move files (v2 history-edit) |

## Speeding up review (public consumers only)

If a public consumer hasn't been reviewed within a week:
1. Leave a message at [Steward requests/Miscellaneous](https://meta.wikimedia.org/wiki/Steward_requests/Miscellaneous) on Meta-Wiki
2. Ask in `#wikimedia-tech` on Libera.Chat IRC
3. File a Phabricator task

Owner-only consumers don't need any review — perfect for hackathon work.
