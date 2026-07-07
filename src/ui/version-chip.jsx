// VersionChip — topbar version indicator + dropdown navigator.
//
// Replaces the old "· Wikimedia Commons" sub-title slot in the topbar
// (T426443). Shows the running build's version, color-coded by
// __DEPLOY_TARGET__ (a Vite compile-time define from .gitlab-ci.yml's
// VITE_DEPLOY_TARGET — see vite.config.js):
//
//   main         → green   ("you're on the live release")
//   v<X.Y.Z>     → yellow  ("you're on an older archived release")
//   mr-<IID>     → blue    ("you're previewing an unmerged MR")
//   dev          → grey    (npm run dev local build)
//
// Click the chip → small dropdown anchored under it, listing the latest
// 5 releases (parsed from CHANGELOG.md) and every open merge request
// (from GitLab's MR API). Each row is a link to the corresponding
// /v<X.Y.Z>/ or /mr-<IID>/ Toolforge URL.
//
// Both data sources are unauthenticated, CORS-OK, and apiCache-wrapped
// at 5min TTL inside src/api/gitlab.js — same plumbing the About modal
// uses, so opening the modal first warms the cache for the chip and
// vice versa.

import React from 'react';
import { fetchOpenMergeRequests, fetchChangelogRaw } from '../api/gitlab.js';
import { parseChangelog } from './changelog-parse.jsx';

const Icon = window.Icon;
const { useState, useEffect, useRef } = React;

const DEPLOY_BASE = 'https://upload-workbench.toolforge.org';

// Variant key consumed by `.version-chip--<variant>` CSS rules.
function variantFor(target) {
  if (target === 'main') return 'main';
  if (target === 'dev') return 'dev';
  if (target.startsWith('v')) return 'archive';
  if (target.startsWith('mr-')) return 'mr';
  return 'dev';
}

// Chip label varies with the deploy target so a user landing on an MR
// preview sees the MR identifier (not the underlying version number, which
// is whatever the MR was built against and isn't the build they're on).
//   main         → "v<X.Y.Z>"  (current live release)
//   v<X.Y.Z>     → "v<X.Y.Z>"  (this archived release's own number)
//   mr-<IID>     → "MR !<IID>" (the GitLab MR identifier)
//   dev          → "dev"       (npm run dev)
function labelFor(target, version) {
  if (target === 'main') return `v${version}`;
  if (target === 'dev') return 'dev';
  if (target.startsWith('mr-')) return `MR !${target.slice(3)}`;
  if (target.startsWith('v')) return target;
  return `v${version}`;
}

function tooltipFor(target, version) {
  if (target === 'main') return `On the live release (v${version}).`;
  if (target === 'dev') return `Local development build (v${version}).`;
  if (target.startsWith('v')) return `Viewing archived release ${target} — click for the live release.`;
  if (target.startsWith('mr-')) return `Previewing merge request !${target.slice(3)} (built from v${version}) — click for the live release or other previews.`;
  return `Build target: ${target}`;
}

export default function VersionChip() {
  const [open, setOpen] = useState(false);
  const [mrs, setMrs] = useState(null);
  const [mrsError, setMrsError] = useState(null);
  const [versions, setVersions] = useState(null);
  const [versionsError, setVersionsError] = useState(null);
  const wrapRef = useRef(null);

  const target = __DEPLOY_TARGET__;
  const version = __APP_VERSION__;
  const variant = variantFor(target);
  const label = labelFor(target, version);

  // Lazy-load both feeds on first open. Subsequent opens hit apiCache
  // (5min TTL) so they're effectively free.
  useEffect(() => {
    if (!open) return;
    if (versions === null && versionsError === null) {
      fetchChangelogRaw()
        .then((text) => setVersions(parseChangelog(text).filter((v) => v.version)))
        .catch((e) => setVersionsError(e?.message || String(e)));
    }
    if (mrs === null && mrsError === null) {
      fetchOpenMergeRequests()
        .then(setMrs)
        .catch((e) => setMrsError(e?.message || String(e)));
    }
  }, [open, versions, versionsError, mrs, mrsError]);

  // Click-outside / Esc to close. Only wire while open.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const top5 = versions ? versions.slice(0, 5) : null;

  return (
    <div className="version-chip-wrap" ref={wrapRef}>
      <button
        type="button"
        className={`version-chip version-chip--${variant}`}
        title={tooltipFor(target, version)}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="version-chip__dot" aria-hidden="true" />
        <span className="version-chip__label">{label}</span>
        <Icon name="chevron-down" size={14} />
      </button>

      {open && (
        <div className="version-chip__menu" role="menu">
          <div className="version-chip__menu-section">
            <div className="version-chip__menu-head">
              Latest releases
              {target !== 'main' && (
                <a className="version-chip__menu-headlink" href={`${DEPLOY_BASE}/`}>
                  Go to live release
                </a>
              )}
            </div>
            {top5
              ? <ChipList
                  items={top5.map((v) => ({
                    key: `v${v.version}`,
                    label: `v${v.version}`,
                    meta: v.date,
                    href: `${DEPLOY_BASE}/v${v.version}/`,
                    isCurrent: target === `v${v.version}`,
                  }))}
                />
              : versionsError
                ? <div className="version-chip__menu-error">Couldn't load releases.</div>
                : <div className="version-chip__menu-loading">Loading releases…</div>}
          </div>

          <div className="version-chip__menu-section">
            <div className="version-chip__menu-head">Open merge requests</div>
            {mrs
              ? mrs.length
                ? <ChipList
                    items={mrs.map((mr) => ({
                      key: `mr-${mr.iid}`,
                      label: `!${mr.iid}`,
                      meta: mr.title,
                      href: `${DEPLOY_BASE}/mr-${mr.iid}/`,
                      isCurrent: target === `mr-${mr.iid}`,
                      draft: mr.draft,
                    }))}
                  />
                : <div className="version-chip__menu-empty">No open merge requests.</div>
              : mrsError
                ? <div className="version-chip__menu-error">Couldn't load MRs.</div>
                : <div className="version-chip__menu-loading">Loading MRs…</div>}
          </div>
        </div>
      )}
    </div>
  );
}

function ChipList({ items }) {
  return (
    <ul className="version-chip__menu-list">
      {items.map((it) => (
        <li
          key={it.key}
          className={'version-chip__menu-item' + (it.isCurrent ? ' is-current' : '')}
        >
          <a href={it.href} className="version-chip__menu-link">
            <span className="version-chip__menu-label">
              {it.label}
              {it.draft && <span className="chip chip--info version-chip__menu-draft">Draft</span>}
            </span>
            {it.meta && <span className="version-chip__menu-meta">{it.meta}</span>}
          </a>
          {it.isCurrent && <span className="version-chip__menu-here">you are here</span>}
        </li>
      ))}
    </ul>
  );
}
