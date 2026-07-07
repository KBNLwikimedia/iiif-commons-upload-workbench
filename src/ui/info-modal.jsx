// Info modal — opens from the topbar "About" button.
//
// Reworked in T426443. The previous layout stacked About → Links →
// Switch version (full ~25-row list) → MRs → Full changelog (every
// release rendered inline), which dominated the modal and buried the
// MR list under a wall of text. The new layout:
//
//   1. About — what this tool is, plus the live tool version chip
//   2. Links — repo, Phabricator, OAuth docs, live site, AND the new
//      "Files uploaded with this tool" Commons-category link
//   3. Versions (foldable accordion, default-open) — compact list of
//      the latest 5 releases; each release row is itself click-to-
//      expand to inline-show its CHANGELOG entry. A "Show all
//      releases" disclosure under the latest 5 reveals the rest.
//   4. Open merge requests — same as before, but no longer buried.
//
// The "Full changelog" wall-of-text section is gone — its content is
// now reachable per-version via the inline accordion.
//
// __APP_VERSION__ and __DEPLOY_TARGET__ are Vite compile-time defines
// (see vite.config.js). __DEPLOY_TARGET__ is one of: "main", "v<X.Y.Z>",
// "mr-<iid>", "dev".

import React from 'react';
import { fetchOpenMergeRequests, fetchChangelogRaw } from '../api/gitlab.js';
import { parseChangelog, renderInline, summarizeSections } from './changelog-parse.jsx';

const Icon = window.Icon;
const { useState, useEffect } = React;

const REPO_URL = 'https://gitlab.wikimedia.org/daanvr/upload-workbench';
const PHAB_PROJECT = 'https://phabricator.wikimedia.org/tag/tool-upload-workbench/';
const PHAB_NEW_TASK = 'https://phabricator.wikimedia.org/maniphest/task/edit/form/default/?projects=tool-upload-workbench';
const LIVE_URL = 'https://upload-workbench.toolforge.org/';
const OAUTH_DOCS = `${REPO_URL}/-/blob/main/docs/oauth-registration.md`;
// Hidden tracking category appended to every published file by publish.js
// (T426405 / v0.26.0). Linking it here lets the user browse all the files
// they (or anyone else) uploaded with the tool.
const COMMONS_CATEGORY = 'https://commons.wikimedia.org/wiki/Category:Uploaded_with_Upload_Workbench';

// All version/MR-preview links go to absolute Toolforge URLs so they work
// the same from local dev (npm run dev) as from the live site or an archived
// build. A bare /v… or /mr-… would 404 on localhost.
const DEPLOY_BASE = 'https://upload-workbench.toolforge.org';

function deployLabel(target) {
  if (target === 'main') return 'Production (main)';
  if (target === 'dev') return 'Local development';
  if (target.startsWith('v')) return `Archived release ${target}`;
  if (target.startsWith('mr-')) return `Merge request preview #${target.slice(3)}`;
  return target;
}

export default function InfoModal({ onClose }) {
  const [mrs, setMrs] = useState(null);
  const [mrsError, setMrsError] = useState(null);
  const [changelog, setChangelog] = useState(null);
  const [changelogError, setChangelogError] = useState(null);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  useEffect(() => {
    let alive = true;
    Promise.allSettled([fetchOpenMergeRequests(), fetchChangelogRaw()]).then(([mrRes, clRes]) => {
      if (!alive) return;
      if (mrRes.status === 'fulfilled') setMrs(mrRes.value);
      else setMrsError(mrRes.reason?.message || String(mrRes.reason));
      if (clRes.status === 'fulfilled') setChangelog(clRes.value);
      else setChangelogError(clRes.reason?.message || String(clRes.reason));
    });
    return () => { alive = false; };
  }, []);

  const target = __DEPLOY_TARGET__;
  const version = __APP_VERSION__;
  const versions = changelog ? parseChangelog(changelog).filter((v) => v.version) : null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal info-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="info-modal-title"
      >
        <header className="modal__head">
          <div>
            <h2 className="modal__title" id="info-modal-title">
              Upload Workbench
              {/* The Beta chip lives in the topbar (with hover tooltip) —
                  no need to duplicate it here. */}
              <span className="info-modal__version-chip" title={`Build target: ${target}`}>
                v{version} · {deployLabel(target)}
              </span>
            </h2>
            <p className="modal__sub">A spreadsheet-style cockpit for your Wikimedia Commons uploads.</p>
          </div>
          <button className="btn btn--quiet btn--icon-only" onClick={onClose} aria-label="Close">
            <Icon name="close" size={16} />
          </button>
        </header>

        <div className="modal__body info-modal__body">
          <Section title="About">
            <p>
              Upload Workbench gives you a spreadsheet view of your Commons upload stash and
              recent history, with bulk metadata editing and one-click publish. Files in your
              stash expire after 48 hours — the workbench surfaces a countdown so nothing is lost.
            </p>
            <p>
              Edits are auto-saved as drafts to your Commons user namespace, so they follow you
              across devices. The tool is open source and built for the Wikimedia community.
            </p>
          </Section>

          <Section title="Links">
            <ul className="info-modal__links">
              <li><a href={LIVE_URL} target="_blank" rel="noopener noreferrer"><Icon name="globe" size={14} /> Live site — {LIVE_URL}</a></li>
              <li><a href={COMMONS_CATEGORY} target="_blank" rel="noopener noreferrer"><Icon name="image" size={14} /> Files uploaded with this tool (on Commons)</a></li>
              <li><a href={REPO_URL} target="_blank" rel="noopener noreferrer"><Icon name="external" size={14} /> Source code on GitLab</a></li>
              <li><a href={PHAB_PROJECT} target="_blank" rel="noopener noreferrer"><Icon name="external" size={14} /> Phabricator project (#tool-upload-workbench)</a></li>
              <li><a href={PHAB_NEW_TASK} target="_blank" rel="noopener noreferrer"><Icon name="warn" size={14} /> Report a bug / request a feature</a></li>
              <li><a href={OAUTH_DOCS} target="_blank" rel="noopener noreferrer"><Icon name="external" size={14} /> OAuth registration docs</a></li>
            </ul>
          </Section>

          <CollapsibleSection title="Versions" defaultOpen={true} count={versions ? versions.length : null}>
            <p className="info-modal__lead">
              Every released version stays accessible at its own URL. Click a version to see
              what shipped in it; click the version's link to switch to that build.
            </p>
            {versions
              ? <VersionList versions={versions} currentTarget={target} />
              : changelogError
                ? <ErrorBlock label="Could not load version list" detail={changelogError} />
                : <LoadingBlock label="Loading versions…" />}
          </CollapsibleSection>

          <Section title="Open merge requests">
            <p className="info-modal__lead">
              Open merge requests are deployed to their own preview URL so you can test
              unreleased changes before they land on <code>main</code>.
            </p>
            {mrs
              ? <MergeRequestList mrs={mrs} currentTarget={target} />
              : mrsError
                ? <ErrorBlock label="Could not load merge requests" detail={mrsError} />
                : <LoadingBlock label="Loading merge requests…" />}
          </Section>
        </div>

        <footer className="modal__foot">
          <span className="modal__hint">Pulled live from GitLab — refreshed every 5 minutes.</span>
          <button className="btn btn--progressive" onClick={onClose}>Close</button>
        </footer>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section className="info-modal__section">
      <h3 className="info-modal__section-title">{title}</h3>
      {children}
    </section>
  );
}

// Foldable section (T426443). Used for the Versions block so the user can
// scroll past it to the MR list when they're not interested in changelog
// content. Section state is local — every modal-open starts fresh; we don't
// persist this preference (would be a one-shot toggle of marginal value).
function CollapsibleSection({ title, children, defaultOpen, count }) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <section className={'info-modal__section info-modal__section--collapsible' + (open ? ' is-open' : '')}>
      <button
        type="button"
        className="info-modal__collapse-head"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name={open ? 'chevron-down' : 'chevron-right'} size={14} />
        <span className="info-modal__section-title info-modal__collapse-title">{title}</span>
        {count !== null && count !== undefined && (
          <span className="info-modal__collapse-count">{count}</span>
        )}
      </button>
      {open && <div className="info-modal__collapse-body">{children}</div>}
    </section>
  );
}

function LoadingBlock({ label }) {
  return <div className="info-modal__placeholder">{label}</div>;
}

function ErrorBlock({ label, detail }) {
  return (
    <div className="info-modal__error">
      <strong>{label}.</strong> {detail}
    </div>
  );
}

// Latest-5 release list with per-row click-to-expand changelog. A
// "Show all releases" disclosure surfaces the older entries in the
// same accordion shape (T426443).
const LATEST_COUNT = 5;

function VersionList({ versions, currentTarget }) {
  const latest = versions.slice(0, LATEST_COUNT);
  const rest = versions.slice(LATEST_COUNT);

  return (
    <>
      <ul className="info-modal__versions">
        <li className={'info-modal__version' + (currentTarget === 'main' ? ' is-current' : '')}>
          <a href={`${DEPLOY_BASE}/`} className="info-modal__version-link">
            <span className="info-modal__version-name">main</span>
            <span className="info-modal__version-meta">latest production build</span>
          </a>
          {currentTarget === 'main' && <span className="info-modal__current-tag">you are here</span>}
        </li>
        {latest.map((v) => (
          <VersionRow key={v.version} v={v} currentTarget={currentTarget} />
        ))}
      </ul>

      {rest.length > 0 && (
        <details className="info-modal__more">
          <summary className="info-modal__more-summary">
            Show {rest.length} older release{rest.length === 1 ? '' : 's'}
          </summary>
          <ul className="info-modal__versions">
            {rest.map((v) => (
              <VersionRow key={v.version} v={v} currentTarget={currentTarget} />
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

function VersionRow({ v, currentTarget }) {
  const [open, setOpen] = useState(false);
  const isCurrent = currentTarget === `v${v.version}`;
  // Maintainer feedback on !55: the row click should ONLY expand the
  // changelog — it shouldn't also navigate. The actual "switch to this
  // build" affordance is now an explicit link inside the expanded body
  // (read first, then decide whether to switch). The whole row is the
  // toggle (keyboard-accessible via a single <button>); a tiny chevron
  // mirrors the open/closed state. The "open this version" link inside
  // stops propagation so clicking it doesn't also collapse the row.
  return (
    <li className={'info-modal__version' + (isCurrent ? ' is-current' : '') + (open ? ' is-expanded' : '')}>
      <button
        type="button"
        className="info-modal__version-row info-modal__version-toggle-row"
        aria-expanded={open}
        onClick={() => setOpen((x) => !x)}
        title={open ? 'Hide changelog' : 'Show changelog'}
      >
        <span className="info-modal__version-toggle" aria-hidden="true">
          <Icon name={open ? 'chevron-down' : 'chevron-right'} size={12} />
        </span>
        <span className="info-modal__version-link">
          <span className="info-modal__version-name">v{v.version}</span>
          <span className="info-modal__version-meta">{v.date} · {summarizeSections(v.sections)}</span>
        </span>
        {isCurrent && <span className="info-modal__current-tag">you are here</span>}
      </button>
      {open && (
        <div className="info-modal__version-changelog">
          {v.preludeLines.length > 0 && (
            <ul className="info-modal__cl-prelude">
              {v.preludeLines.map((line, i) => <li key={i}>{renderInline(line)}</li>)}
            </ul>
          )}
          {v.sections.length === 0 && v.preludeLines.length === 0 && (
            <p className="info-modal__placeholder">No changelog entries.</p>
          )}
          {v.sections.map((s, i) => (
            <div key={i} className="info-modal__cl-section">
              {s.heading && <h5 className="info-modal__cl-subhead">{s.heading}</h5>}
              <ul>
                {s.items.map((item, j) => <li key={j}>{renderInline(item)}</li>)}
              </ul>
            </div>
          ))}
          {!isCurrent && (
            <div className="info-modal__version-cta">
              <a
                className="btn btn--progressive btn--small info-modal__version-open"
                href={`${DEPLOY_BASE}/v${v.version}/`}
              >
                Open this version
                <Icon name="external" size={14} />
                <span className="info-modal__version-open-url">/v{v.version}/</span>
              </a>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function MergeRequestList({ mrs, currentTarget }) {
  if (!mrs.length) {
    return <p className="info-modal__placeholder">No open merge requests right now.</p>;
  }
  return (
    <ul className="info-modal__mrs">
      {mrs.map((mr) => {
        const isCurrent = currentTarget === `mr-${mr.iid}`;
        return (
          <li key={mr.iid} className={'info-modal__mr' + (isCurrent ? ' is-current' : '')}>
            <a href={`${DEPLOY_BASE}/mr-${mr.iid}/`} className="info-modal__mr-link">
              <span className="info-modal__mr-head">
                <span className="info-modal__mr-iid">!{mr.iid}</span>
                <span className="info-modal__mr-title">{mr.title}</span>
                {mr.draft && <span className="chip chip--info info-modal__mr-chip">Draft</span>}
              </span>
              <span className="info-modal__mr-meta">
                @{mr.author?.username} · <code>{mr.source_branch}</code>
              </span>
            </a>
            <a
              className="info-modal__mr-source"
              href={mr.web_url}
              target="_blank"
              rel="noopener noreferrer"
              title="View merge request on GitLab"
              onClick={(e) => e.stopPropagation()}
            >
              <Icon name="external" size={14} />
            </a>
            {isCurrent && <span className="info-modal__current-tag">you are here</span>}
          </li>
        );
      })}
    </ul>
  );
}
