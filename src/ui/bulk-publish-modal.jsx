// Bulk publish modal — shows a checklist of selected stash files, lets the
// user kick off a sequential publish, and surfaces per-item status as the
// queue progresses.
//
// Files with blocking issues (missing title / license / author) are listed
// up top under "Can't publish yet" so the user knows what to fix without
// having to open each detail panel. The Publish button only acts on the
// publishable subset.
//
// Per-item state machine while running:
//   queued     — waiting in line
//   publishing — wiki write in flight
//   success    — done; link to the file
//   warning    — Commons returned warnings (duplicate / exists / large file).
//                Per-row "Publish anyway" (ignorewarnings=1) retries just
//                that item.
//   error      — fatal failure; per-row Retry button.

import React from 'react';
import {
  publishMany,
  publishOne,
  blockingIssues,
  makeFinalFilename,
  buildWikitext,
  buildSdcClaims,
} from '../api/publish.js';
import { resolveSequenceTitles, hasSequencePlaceholders } from '../api/sequence.js';
import { cleanupAfterPublish } from './publish-modal.jsx';

const Icon = window.Icon;

// Tiny duplicate of PublishModal's claim renderer — kept inline so this file
// stays self-contained and the bulk modal isn't pulled into a circular import.
//
// Note: P170 (creator) is emitted by buildSdcClaims as a `somevalue` mainsnak
// (no datavalue) with the username carried in qualifiers — see
// selfAuthorClaim in publish.js. Earlier versions of this summary blindly
// dereferenced `c.mainsnak.datavalue.value`, which crashed Review on any row
// where the user is the canonical self-author (T426403). Mirror the safer
// shape used by PublishModal's ClaimSummary: branch on snaktype first, and
// optional-chain the datavalue lookup for the value-typed snaks.
function bulkPublishClaimSummary(claims) {
  if (!claims?.length) return 'No structured data — only the wikitext page will be created.';
  return claims.map((c) => {
    const prop = c.mainsnak.property;
    if (prop === 'P170' && c.mainsnak.snaktype === 'somevalue') {
      const uname = c.qualifiers?.P4174?.[0]?.datavalue?.value || '?';
      return `${prop} creator (uploader: ${uname})`;
    }
    const v = c.mainsnak.datavalue?.value;
    if (v == null) return `${prop} ${c.mainsnak.snaktype || ''}`.trim();
    if (prop === 'P180') return `${prop} depicts ${v.id}`;
    if (prop === 'P625') return `${prop} coordinate ${v.latitude.toFixed(4)}, ${v.longitude.toFixed(4)}`;
    if (prop === 'P1071') return `${prop} location of creation ${v.id}`;
    if (prop === 'P571') return `${prop} inception ${String(v.time).slice(1, 11)}`;
    return `${prop} ${JSON.stringify(v)}`;
  }).join('\n');
}

function StatusIcon({ status }) {
  if (status === 'success') return <Icon name="ok" size={14} />;
  if (status === 'warning') return <Icon name="warn" size={14} />;
  if (status === 'error') return <Icon name="warn" size={14} />;
  if (status === 'publishing') return <span className="bulk-publish__spinner" />;
  return <span className="bulk-publish__queued-dot" />;
}

// Files with a caption that violates SDC label rules can't be published. We
// reuse the same validateCaption helper as the spreadsheet cell editor so the
// gating is identical to what the user sees inline. T426422: with per-language
// caption columns, a row is blocked if *any* of its languages fails the SDC
// rules (otherwise a user could quietly publish an over-limit Dutch caption
// alongside a fine English one).
function captionBlocked(item) {
  const fn = window.validateCaption;
  if (!fn || !item) return false;
  const langs = item.descriptions || {};
  for (const v of Object.values(langs)) {
    if (typeof v === 'string' && v.trim() && !fn(v).valid) return true;
  }
  // Legacy single-string field — only check when descriptions.en isn't already
  // covering it (else we'd validate the same English value twice).
  if (item.description && !langs.en) {
    return !fn(item.description).valid;
  }
  return false;
}

// Inline per-row review block. Shows the wikitext (editable in `confirm`
// phase) and the SDC payload as a compact text summary. Surfaces a Reset
// button when the user has touched the wikitext, so it's easy to fall back
// to the auto-generated version.
//
// `resolvedTitle` (T425984): when set, the wikitext + SDC are rendered against
// a title-overridden item so templates that reference `|title=` show the
// resolved `<basename> N` instead of the literal `<basename> #` placeholder.
function BulkRowReview({ item, templateConfig, selfUsername, override, editable, onChange, onReset, resolvedTitle = null }) {
  const effectiveItem = React.useMemo(
    () => (resolvedTitle ? { ...item, title: resolvedTitle } : item),
    [item, resolvedTitle],
  );
  const generated = React.useMemo(
    () => buildWikitext(effectiveItem, templateConfig),
    [effectiveItem, templateConfig],
  );
  const claims = React.useMemo(() => buildSdcClaims(effectiveItem, { selfUsername }), [effectiveItem, selfUsername]);
  const value = override != null ? override : generated;
  const dirty = override != null && override !== generated;

  return (
    <div className="bulk-publish__review-body">
      <div className="bulk-publish__review-block">
        <div className="publish-modal__label">
          Wikitext
          {dirty && (
            <button
              type="button"
              className="btn btn--small btn--quiet"
              onClick={onReset}
              style={{ marginLeft: 'var(--spacing-50)' }}
              title="Discard hand-edits and regenerate from the row"
            >
              Reset
            </button>
          )}
        </div>
        {editable ? (
          <textarea
            className="publish-modal__wikitext publish-modal__wikitext--editable"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            spellCheck={false}
            rows={Math.min(16, Math.max(6, value.split('\n').length + 1))}
          />
        ) : (
          <pre className="publish-modal__wikitext">{value}</pre>
        )}
      </div>
      <div className="bulk-publish__review-block">
        <div className="publish-modal__label">Structured data</div>
        <pre className="publish-modal__wikitext publish-modal__wikitext--sdc">{bulkPublishClaimSummary(claims)}</pre>
      </div>
    </div>
  );
}

export function BulkPublishModal({ items, templateConfig, onClose, onItemPublished, selfUsername }) {
  // Partition items by publishability up front. A file is blocked if it has
  // any required-field issue OR an invalid caption.
  const isBlocked = (i) => blockingIssues(i).length > 0 || captionBlocked(i);
  const publishable = items.filter((i) => !isBlocked(i));
  const blocked = items.filter(isBlocked);

  // Per-item status keyed by item.id. Starts as 'queued' for publishable items.
  const [statuses, setStatuses] = React.useState(() => {
    const m = {};
    for (const it of publishable) m[it.id] = { status: 'queued' };
    return m;
  });
  const [phase, setPhase] = React.useState('confirm'); // confirm | running | done

  // Per-item review state. The user can expand any row to see the wikitext
  // + SDC for that file, and edit the wikitext if they want a per-row patch.
  // `wikitextOverrides` only contains entries for rows the user actually
  // touched — items not in the map fall back to buildWikitext at publish.
  const [expandedId, setExpandedId] = React.useState(null);
  const [wikitextOverrides, setWikitextOverrides] = React.useState({});
  const setOverrideFor = (id, text) => {
    setWikitextOverrides((m) => ({ ...m, [id]: text }));
  };
  const resetOverrideFor = (id) => {
    setWikitextOverrides((m) => {
      if (!(id in m)) return m;
      const next = { ...m };
      delete next[id];
      return next;
    });
  };

  // Auto-sequence resolution (T425984). Run once when the publishable set
  // contains any sequence-placeholder rows. Resolution groups by basename
  // and assigns consecutive integers continuing the user's owned series on
  // Commons. Until it completes, we show the literal placeholder in the
  // queue and disable the Publish button — same UX as the per-row Commons
  // duplicate check in single-publish.
  //
  // resolvedTitles: undefined = resolving, Map = ready (may be empty when
  // no rows had placeholders).
  const placeholderCount = React.useMemo(
    () => publishable.filter((i) => i.title && i.title.endsWith(' #')).length,
    [publishable],
  );
  const [resolvedTitles, setResolvedTitles] = React.useState(() => (
    hasSequencePlaceholders(publishable) ? undefined : new Map()
  ));
  React.useEffect(() => {
    if (!hasSequencePlaceholders(publishable)) {
      setResolvedTitles(new Map());
      return;
    }
    let alive = true;
    setResolvedTitles(undefined);
    resolveSequenceTitles(publishable, selfUsername || '')
      .then((map) => {
        if (alive) setResolvedTitles(map);
      })
      .catch((e) => {
        console.warn('[bulk-publish-modal] sequence resolution failed:', e?.message || e);
        if (alive) setResolvedTitles(new Map());
      });
    return () => {
      alive = false;
    };
    // Depend on stable identity of the publishable id-set + the username.
    // The .map of titles may change while the user edits other fields, but
    // for sequence resolution only the placeholder titles matter — and those
    // can't change without leaving the modal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publishable.map((i) => i.id).join(','), selfUsername]);
  const sequenceResolving = resolvedTitles === undefined;

  // Esc closes (only if not running, to avoid abandoning a half-done batch).
  React.useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && phase !== 'running') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [phase, onClose]);

  const updateStatus = React.useCallback((id, partial) => {
    setStatuses((s) => ({ ...s, [id]: { ...(s[id] || {}), ...partial } }));
    if (partial.status === 'success') {
      const item = items.find((i) => i.id === id);
      if (item) {
        cleanupAfterPublish(item);
        onItemPublished?.(item, partial);
      }
    }
  }, [items, onItemPublished]);

  const startPublishAll = async () => {
    setPhase('running');
    await publishMany(publishable, {
      onUpdate: updateStatus,
      selfUsername,
      templateConfig,
      wikitextOverrides,
      // Pre-resolved sequence titles (T425984). publishMany passes through
      // to publishOne, which uses them in makeFinalFilename in place of the
      // literal `<basename> #`.
      resolvedTitles: resolvedTitles || null,
    });
    setPhase('done');
  };

  // Per-row retry (after warning/error). Republishes one specific item.
  const retryOne = async (item, { ignorewarnings = false } = {}) => {
    updateStatus(item.id, { status: 'publishing' });
    try {
      const override = wikitextOverrides[item.id];
      const resolvedTitle = resolvedTitles?.get?.(item.id) || null;
      const res = await publishOne(item, {
        ignorewarnings,
        selfUsername,
        templateConfig,
        ...(override != null ? { wikitext: override } : {}),
        ...(resolvedTitle ? { resolvedTitle } : {}),
      });
      if (res.state === 'success') {
        updateStatus(item.id, {
          status: 'success',
          filename: res.filename,
          descriptionurl: res.descriptionurl,
          sdcError: res.sdcError,
        });
      } else if (res.state === 'warning') {
        updateStatus(item.id, { status: 'warning', warnings: res.warnings });
      } else {
        updateStatus(item.id, { status: 'error', error: res.error });
      }
    } catch (e) {
      updateStatus(item.id, { status: 'error', error: e.message || String(e) });
    }
  };

  const successCount = Object.values(statuses).filter((s) => s.status === 'success').length;
  const errorCount = Object.values(statuses).filter((s) => s.status === 'error' || s.status === 'warning').length;

  return (
    <div className="publish-modal-backdrop" onClick={phase === 'running' ? undefined : onClose}>
      <div className="publish-modal bulk-publish" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Publish many files">
        <header className="publish-modal__head">
          <h2 className="publish-modal__title">
            {phase === 'confirm' && `Publish ${publishable.length} file${publishable.length === 1 ? '' : 's'}`}
            {phase === 'running' && `Publishing… ${successCount} of ${publishable.length}`}
            {phase === 'done' && `Done — ${successCount} published${errorCount ? `, ${errorCount} need attention` : ''}`}
          </h2>
          {phase !== 'running' && (
            <button className="btn btn--quiet btn--icon-only" onClick={onClose} title="Close (Esc)">
              <Icon name="close" size={16} />
            </button>
          )}
        </header>

        <div className="publish-modal__body bulk-publish__body">
          {blocked.length > 0 && phase === 'confirm' && (
            <section className="publish-modal__section">
              <div className="publish-modal__label">Can't publish yet ({blocked.length})</div>
              <ul className="bulk-publish__list">
                {blocked.map((it) => {
                  // Render a friendly per-issue summary. "missing-*"
                  // codes collapse to their bare field name; the
                  // categories-not-on-commons code (T425950) gets a
                  // bespoke phrase since it's not a missing field but
                  // an invalid value. Plus invalid captions (T425878)
                  // and title validation (T425880).
                  const issueCodes = blockingIssues(it);
                  const captionInvalid = captionBlocked(it);
                  const labels = issueCodes.map((c) => {
                    if (c === 'categories-not-on-commons') return 'unknown categories';
                    if (c === 'invalid-title') return 'invalid title';
                    if (c === 'title-taken') return 'title taken on Commons';
                    return c.replace('missing-', '');
                  });
                  const reasons = [
                    ...labels,
                    ...(captionInvalid ? ['invalid caption'] : []),
                  ];
                  return (
                    <li key={it.id} className="bulk-publish__row bulk-publish__row--blocked">
                      <Icon name="warn" size={14} />
                      <span className="bulk-publish__name">{it.title || it.filename}</span>
                      <span className="bulk-publish__missing">
                        {issueCodes.includes('categories-not-on-commons') && issueCodes.length === 1 && !captionInvalid
                          ? 'Has unknown categories'
                          : ((captionInvalid && !issueCodes.length) ? 'Fix: ' : 'Missing: ') + reasons.join(', ')}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <p className="publish-modal__hint">Fill these in via the detail panel and try again, or proceed with just the {publishable.length} ready file{publishable.length === 1 ? '' : 's'}.</p>
            </section>
          )}

          {publishable.length > 0 && (
            <section className="publish-modal__section">
              <div className="publish-modal__label">
                {phase === 'confirm' ? `Will publish (${publishable.length})` : 'Queue'}
              </div>
              {placeholderCount > 0 && (
                <p className="publish-modal__hint" aria-live="polite">
                  {sequenceResolving ? (
                    <><span className="spinner spinner--inline" /> Resolving sequence numbers from your Commons history… ({placeholderCount} placeholder row{placeholderCount === 1 ? '' : 's'})</>
                  ) : (
                    <>Sequence resolved for {placeholderCount} placeholder row{placeholderCount === 1 ? '' : 's'}; final filenames continue your existing series.</>
                  )}
                </p>
              )}
              <ul className="bulk-publish__list">
                {publishable.map((it) => {
                  const st = statuses[it.id] || { status: 'queued' };
                  // Auto-sequence (T425984): show the resolved `<basename> N`
                  // in the queue, not the literal `<basename> #` placeholder.
                  // Falls back to it.title when not a placeholder, or the
                  // generated filename when title is empty.
                  const resolvedTitle = resolvedTitles?.get?.(it.id) || null;
                  const finalName = makeFinalFilename(it, resolvedTitle);
                  const displayName = resolvedTitle
                    || it.title
                    || finalName;
                  const isExpanded = expandedId === it.id;
                  const editable = phase === 'confirm';
                  const hasOverride = it.id in wikitextOverrides;
                  return (
                    <React.Fragment key={it.id}>
                      <li className={`bulk-publish__row bulk-publish__row--${st.status}`}>
                        <StatusIcon status={st.status} />
                        <span className="bulk-publish__name" title={`Will publish as File:${finalName}`}>{displayName}</span>

                        {st.status === 'queued' && phase === 'confirm' && (
                          <button
                            type="button"
                            className="btn btn--small btn--quiet"
                            onClick={() => setExpandedId(isExpanded ? null : it.id)}
                            title="Review the wikitext + structured data for this file"
                          >
                            {isExpanded ? 'Hide review' : (hasOverride ? 'Review (edited)' : 'Review')}
                          </button>
                        )}
                        {st.status === 'success' && st.descriptionurl && (
                          <a href={st.descriptionurl} target="_blank" rel="noopener noreferrer" className="bulk-publish__link">
                            Open <Icon name="external" size={10} />
                          </a>
                        )}
                        {st.status === 'warning' && (
                          <>
                            <span className="bulk-publish__detail">
                              {Object.keys(st.warnings || {}).join(', ')}
                            </span>
                            <button className="btn btn--small btn--quiet" onClick={() => retryOne(it, { ignorewarnings: true })}>
                              Publish anyway
                            </button>
                          </>
                        )}
                        {st.status === 'error' && (
                          <>
                            <span className="bulk-publish__detail" title={st.error}>{st.error}</span>
                            <button className="btn btn--small btn--quiet" onClick={() => retryOne(it)}>
                              Retry
                            </button>
                          </>
                        )}
                      </li>
                      {isExpanded && (
                        <li className="bulk-publish__review">
                          <BulkRowReview
                            item={it}
                            templateConfig={templateConfig}
                            selfUsername={selfUsername}
                            override={wikitextOverrides[it.id]}
                            editable={editable}
                            onChange={(v) => setOverrideFor(it.id, v)}
                            onReset={() => resetOverrideFor(it.id)}
                            resolvedTitle={resolvedTitle}
                          />
                        </li>
                      )}
                    </React.Fragment>
                  );
                })}
              </ul>
            </section>
          )}

          {publishable.length === 0 && (
            <p className="publish-modal__hint">No files are ready to publish. Fill required fields first.</p>
          )}
        </div>

        <footer className="publish-modal__foot">
          {phase === 'confirm' && (
            <>
              <button className="btn btn--quiet" onClick={onClose}>Cancel</button>
              <button
                className="btn btn--progressive"
                onClick={startPublishAll}
                disabled={publishable.length === 0 || sequenceResolving}
                title={sequenceResolving ? 'Resolving sequence numbers — a moment…' : undefined}
              >
                <Icon name="publish" size={14} /> Publish {publishable.length || ''}
              </button>
            </>
          )}
          {phase === 'running' && (
            <span className="publish-modal__hint">Don't close the tab — uploads are in flight.</span>
          )}
          {phase === 'done' && (
            <button className="btn btn--progressive" onClick={onClose}>Done</button>
          )}
        </footer>
      </div>
    </div>
  );
}
