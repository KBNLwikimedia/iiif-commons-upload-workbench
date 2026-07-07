// Tiny localStorage cache for things we know but the Commons API forgets.
//
// The MediaWiki stash API doesn't preserve the original filename a user
// chose on upload — only the random hash-prefixed `filekey`. We capture
// the filename when our own upload succeeds and look it up on subsequent
// fetchStashedFiles calls so the table shows something readable.
//
// Phase 2 moves this cache into User:<self>/UploadWorkbenchPreferences.js
// so it roams across browsers/devices. Until then, localStorage covers
// the same browser.

const KEY = 'uwb.localStash.v1';

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { filenames: {} };
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : { filenames: {} };
  } catch {
    return { filenames: {} };
  }
}

function write(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Quota exceeded or storage disabled — silently degrade.
  }
}

export function setStashedFilename(filekey, filename) {
  if (!filekey || !filename) return;
  const s = read();
  s.filenames = s.filenames || {};
  s.filenames[filekey] = filename;
  write(s);
}

export function getStashedFilename(filekey) {
  if (!filekey) return null;
  return read().filenames?.[filekey] || null;
}

export function getAllStashedFilenames() {
  return read().filenames || {};
}

export function forgetStashedFilename(filekey) {
  if (!filekey) return;
  const s = read();
  if (s.filenames) {
    delete s.filenames[filekey];
    write(s);
  }
}
