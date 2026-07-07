// Upload a single file to the user's Commons stash.
//
// Uses XMLHttpRequest (not fetch) because fetch can't report upload progress
// — and a chunked-byte progress bar is one of the headline UX bits of the
// design's "stash-uploading" state.
//
// v1 sends the whole file in one POST. The MediaWiki action=upload accepts
// up to ~100 MB this way; chunked uploads (action=upload&offset=…&chunk=…)
// are deferred to v2 (file size limit error surfaces a clear message in v1).

import { COMMONS_API, DEMO_MODE, APP_USER_AGENT } from '../config.js';
import { getAccessToken } from './oauth.js';

// Sanitize a filename for Commons. Removes characters MediaWiki forbids
// in titles ([#<>[]|{}]) and squeezes whitespace.
export function sanitizeFilename(name) {
  return String(name || '')
    .replace(/[#<>[\]|{}]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function uploadFile(file, csrfToken, { onProgress } = {}) {
  if (DEMO_MODE) {
    // Simulate 5 progress ticks then return a fake filekey.
    return new Promise((resolve) => {
      let p = 0;
      const tick = () => {
        p += 20;
        onProgress?.(Math.min(p, 100));
        if (p < 100) {
          setTimeout(tick, 200);
        } else {
          const filekey = `demo.${Date.now()}.${file.name}`;
          resolve({
            filekey,
            filename: file.name,
            warnings: null,
            imageinfo: null,
          });
        }
      };
      tick();
    });
  }

  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated');

  const filename = sanitizeFilename(file.name);
  const fd = new FormData();
  fd.append('action', 'upload');
  fd.append('filename', filename);
  fd.append('stash', '1');
  fd.append('ignorewarnings', '1'); // accept duplicate / bad-title for now; user resolves on publish
  fd.append('format', 'json');
  fd.append('formatversion', '2');
  fd.append('assert', 'user');
  fd.append('token', csrfToken);
  fd.append('file', file, filename);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${COMMONS_API}?crossorigin=`);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.setRequestHeader('Api-User-Agent', APP_USER_AGENT);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        onProgress?.(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      let data;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        reject(new Error('Invalid JSON response from upload API'));
        return;
      }
      if (data.error) {
        reject(new Error(`${data.error.code}: ${data.error.info}`));
        return;
      }
      const u = data.upload;
      if (!u || (u.result !== 'Success' && u.result !== 'Warning')) {
        reject(new Error(`Upload returned: ${u?.result || 'unknown'}`));
        return;
      }
      if (!u.filekey) {
        reject(new Error('Upload succeeded but no filekey returned'));
        return;
      }
      resolve({
        filekey: u.filekey,
        filename: u.filename || filename,
        warnings: u.warnings || null,
        imageinfo: u.imageinfo || null,
      });
    };
    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.onabort = () => reject(new Error('Upload aborted'));
    xhr.send(fd);
  });
}
