// Shared CHANGELOG.md parser + inline-markdown renderer.
//
// Used by both <InfoModal> (full per-version expansion + bullets) and
// <VersionChip> (just the latest 5 dates / labels). Pulled out of
// info-modal.jsx so both consumers see the same shape, and so the
// version-chip feed stays light when the modal isn't open.
//
// Grammar we accept (per CLAUDE.md → "Versioning & release workflow"):
//   ## [X.Y.Z] — YYYY-MM-DD     version heading
//   ## [Unreleased]             pending heading
//   ### Added | Changed | Fixed | Removed
//   - bullet line (may contain **bold**, [text](url), `code`)
//   ---                          horizontal rule between versions
// Everything before the first `## ` is a preamble we ignore.

import React from 'react';

export function parseChangelog(text) {
  const lines = text.split('\n');
  const versions = [];
  let cur = null;
  let curSection = null;

  const startVersion = (label, version, date) => {
    cur = { label, version, date, preludeLines: [], sections: [] };
    curSection = null;
    versions.push(cur);
  };

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    if (line.startsWith('## ')) {
      const m = line.match(/^## \[([^\]]+)\](?:\s+—\s+(.+))?$/);
      const label = m ? m[1] : line.slice(3);
      const date = m ? (m[2] || '').trim() : '';
      const semver = /^\d+\.\d+\.\d+$/.test(label) ? label : null;
      startVersion(label, semver, date);
      continue;
    }
    if (!cur) continue;
    if (line.startsWith('### ')) {
      curSection = { heading: line.slice(4).trim(), items: [] };
      cur.sections.push(curSection);
      continue;
    }
    if (line.trim() === '---' || line.trim() === '') continue;
    if (line.startsWith('- ')) {
      const item = line.slice(2);
      if (curSection) curSection.items.push(item);
      else cur.preludeLines.push(item);
      continue;
    }
    // Continuation lines for the previous bullet (rare but possible).
    if (line.startsWith('  ') && curSection && curSection.items.length) {
      curSection.items[curSection.items.length - 1] += ' ' + line.trim();
    } else if (line.startsWith('  ') && cur && cur.preludeLines.length) {
      cur.preludeLines[cur.preludeLines.length - 1] += ' ' + line.trim();
    }
  }
  return versions;
}

// Inline markdown: **bold**, [text](url), `code`. Links open in a new tab.
export function renderInline(text) {
  const tokens = [];
  let i = 0;
  let key = 0;
  while (i < text.length) {
    const rest = text.slice(i);
    let m;
    if ((m = rest.match(/^\*\*([^*]+)\*\*/))) {
      tokens.push(<strong key={key++}>{m[1]}</strong>);
      i += m[0].length;
    } else if ((m = rest.match(/^\[([^\]]+)\]\(([^)]+)\)/))) {
      tokens.push(<a key={key++} href={m[2]} target="_blank" rel="noopener noreferrer">{m[1]}</a>);
      i += m[0].length;
    } else if ((m = rest.match(/^`([^`]+)`/))) {
      tokens.push(<code key={key++}>{m[1]}</code>);
      i += m[0].length;
    } else {
      // Accumulate plain text until the next markup char.
      const next = rest.slice(1).search(/[*\[`]/);
      const len = next < 0 ? rest.length : next + 1;
      tokens.push(rest.slice(0, len));
      i += len;
    }
  }
  return <>{tokens}</>;
}

export function summarizeSections(sections) {
  const parts = [];
  for (const s of sections) {
    if (s.heading && s.items.length) parts.push(`${s.items.length} ${s.heading.toLowerCase()}`);
  }
  return parts.join(', ') || 'release';
}
