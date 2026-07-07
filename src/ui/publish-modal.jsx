// Single-file publish modal — state machine for the publish workflow.
//
// States:
//   confirm    — preview filename + assembled wikitext + claims; user clicks Publish
//   publishing — spinner; the upload + SDC are in flight
//   warning    — the upload API returned warnings (duplicate / exists / large file).
//                The file is NOT yet on Commons. User can ignore-and-retry, edit, or cancel.
//   success    — file is live on Commons. Link to the description page.
//   error      — fatal failure. Try again or close.
//
// The Publish button on the confirm step is disabled when the item has any
// blocking issue (missing title / license / author). The user is told
// exactly what's missing.

import React from 'react';
import {
  buildWikitext,
  buildSdcClaims,
  makeFinalFilename,
  publishOne,
  blockingIssues,
} from '../api/publish.js';
import { findCommonsFileBySha1 } from '../api/commons.js';
import { deleteDraft, draftKey, unhideFilekey, unhideSha1 } from '../api/user-store.js';
import { isSequencePlaceholderTitle } from '../api/title-validation.js';
import { resolveSequenceTitles } from '../api/sequence.js';

const Icon = window.Icon;

const ISSUE_LABELS = {
  'missing-title': 'Title',
  'missing-license': 'License',
  'missing-author': 'Author',
  'missing-description': 'Caption',
  'missing-categories': 'Categories',
  'categories-not-on-commons': 'Categories — one or more do not exist on Commons',
  'invalid-title': 'Title — invalid (Commons filename rules)',
  'title-taken': 'Title — already exists on Commons',
};

function IssueList({ codes }) {
  if (!codes?.length) return null;
  return (
    <ul className="publish-modal__issues">
      {codes.map((c) => (
        <li key={c}><Icon name="warn" size={12} /> {ISSUE_LABELS[c] || c}</li>
      ))}
    </ul>
  );
}

function ClaimSummary({ claims }) {
  if (!claims?.length) {
    return <p className="publish-modal__hint">No structured data — only the wikitext page will be created.</p>;
  }
  return (
    <ul className="publish-modal__claims">
      {claims.map((c, i) => {
        const prop = c.mainsnak.property;
        let label = '';
        if (prop === 'P170' && c.mainsnak.snaktype === 'somevalue') {
          // Self-author claim — somevalue + P4174 (Wikimedia username) qualifier.
          const uname = c.qualifiers?.P4174?.[0]?.datavalue?.value || '?';
          label = `creator (uploader: ${uname})`;
        } else {
          const v = c.mainsnak.datavalue?.value;
          if (prop === 'P180') label = `depicts ${v?.id}`;
          else if (prop === 'P625') label = `coordinate ${v.latitude.toFixed(4)}, ${v.longitude.toFixed(4)}`;
          else if (prop === 'P1071') label = `location of creation ${v?.id}`;
          else if (prop === 'P571') label = `inception ${String(v?.time).slice(1, 11)}`;
          else label = `${prop} ${JSON.stringify(v)}`;
        }
        return <li key={i}><span className="mono">{prop}</span> · {label}</li>;
      })}
    </ul>
  );
}

export function PublishModal({ item, templateConfig, onClose, onPublished, selfUsername }) {
  const [state, setState] = React.useState('confirm');
  const [warnings, setWarnings] = React.useState(null);
  const [result, setResult] = React.useState(null);
  const [error, setError] = React.useState(null);
  const [confirmedDuplicate, setConfirmedDuplicate] = React.useState(false);

  // Auto-sequence resolution (T425984). If the row's title is a `<basename> #`
  // placeholder, the publish step assigns a concrete `<basename> N` based on
  // the user's existing sequence on Commons. We resolve once when the modal
  // opens (and re-resolve if the row's title or filename changes) so the
  // "Will be published as" preview shows the actual final filename, not the
  // raw placeholder. On publish, the same resolved title is passed through
  // to publishOne via the `resolvedTitle` option.
  //
  // resolvedTitle: undefined = resolving, null = not a placeholder (use item.title),
  //                string    = resolved
  const isPlaceholder = isSequencePlaceholderTitle(item?.title);
  const [resolvedTitle, setResolvedTitle] = React.useState(() => (isPlaceholder ? undefined : null));
  React.useEffect(() => {
    if (!isPlaceholder) {
      setResolvedTitle(null);
      return;
    }
    let alive = true;
    setResolvedTitle(undefined);
    resolveSequenceTitles([item], selfUsername || '')
      .then((map) => {
        if (!alive) return;
        const r = map.get(item.id);
        // null fallback so the publish click isn't blocked forever if the
        // resolver returned no entry (shouldn't happen for a valid placeholder,
        // but be defensive — the user can still publish using the literal
        // basename, and Commons will reject duplicates with `exists`).
        setResolvedTitle(r != null ? r : null);
      })
      .catch((e) => {
        console.warn('[publish-modal] sequence resolution failed:', e?.message || e);
        if (alive) setResolvedTitle(null);
      });
    return () => {
      alive = false;
    };
  }, [item.id, item.title, item.filename, isPlaceholder, selfUsername]);

  const sequenceResolving = isPlaceholder && resolvedTitle === undefined;

  // Source-of-truth wikitext rebuilt from the item + template config. The
  // user can hand-edit it before clicking Publish; we track an explicit
  // `dirty` flag so re-renders don't clobber unsaved edits.
  //
  // For sequence-placeholder rows (T425984), the effective item carries the
  // resolved `<basename> N` so wikitext templates that reference `|title=`
  // render the final value, not the placeholder. The override is applied to
  // both buildWikitext and buildSdcClaims (the SDC builder doesn't currently
  // read item.title, but we keep both paths consistent in case it ever does).
  const effectiveItem = React.useMemo(
    () => (resolvedTitle ? { ...item, title: resolvedTitle } : item),
    [item, resolvedTitle],
  );
  const generatedWikitext = React.useMemo(
    () => buildWikitext(effectiveItem, templateConfig),
    [effectiveItem, templateConfig],
  );
  const [editedWikitext, setEditedWikitext] = React.useState(generatedWikitext);
  const [wikitextDirty, setWikitextDirty] = React.useState(false);
  React.useEffect(() => {
    // If the user hasn't touched the textarea yet, follow whatever the
    // generator produces (so editing the row before clicking Publish flows
    // through). Once they edit, freeze.
    if (!wikitextDirty) setEditedWikitext(generatedWikitext);
  }, [generatedWikitext, wikitextDirty]);

  const claims = React.useMemo(() => buildSdcClaims(effectiveItem, { selfUsername }), [effectiveItem, selfUsername]);

  const filename = React.useMemo(
    () => makeFinalFilename(effectiveItem, null),
    [effectiveItem],
  );
  const issues = blockingIssues(item);

  // Caption (SDC label) validation. A caption that violates the rules would
  // be rejected by the Wikibase API at publish time, so we block here too.
  // T426422: with per-language captions, validate every non-empty language
  // and surface the first failing one (the panel below renders one error
  // bullet per error code, so showing one language at a time is fine — the
  // user fixes it, the next failing language surfaces on the next render).
  const captionResult = React.useMemo(() => {
    const fn = window.validateCaption;
    if (!fn || !item) return { valid: true, errors: [], length: 0 };
    const langs = item.descriptions || {};
    for (const [lang, v] of Object.entries(langs)) {
      if (typeof v === 'string' && v.trim()) {
        const r = fn(v);
        if (!r.valid) return { ...r, lang };
      }
    }
    if (item.description && !langs.en) {
      const r = fn(item.description);
      if (!r.valid) return { ...r, lang: 'en' };
      return r;
    }
    return { valid: true, errors: [], length: 0 };
  }, [item?.description, item?.descriptions]);

  // Re-check duplicates fresh at publish time. The cached existsOnCommons could
  // be stale (someone else uploaded the same bytes after the user opened this
  // session). freshDup is authoritative once the check resolves; while it's
  // pending we fall back to whatever was already on the item.
  const [freshDup, setFreshDup] = React.useState(undefined); // undefined = checking, null = none, object = hit
  React.useEffect(() => {
    let alive = true;
    if (!item?.sha1) {
      setFreshDup(null);
      return;
    }
    setFreshDup(undefined);
    const timeout = new Promise((r) => setTimeout(() => r(undefined), 8000));
    Promise.race([findCommonsFileBySha1(item.sha1, { noCache: true }), timeout])
      .then((hit) => {
        if (!alive) return;
        setFreshDup(hit === undefined ? null : hit);
      })
      .catch(() => {
        if (alive) setFreshDup(null);
      });
    return () => {
      alive = false;
    };
  }, [item?.sha1]);

  // While freshDup is undefined (checking), prefer the item's existing flag so
  // the user isn't presented an "all clear" UI that suddenly turns red. Once
  // resolved, the fresh value wins (could clear a stale hit, or surface a new one).
  const dup = freshDup === undefined ? item?.existsOnCommons || null : freshDup;
  const dupChecking = freshDup === undefined;
  // (The old "twin in stash" check is gone — same-sha1 stash entries are now
  // coalesced into a single logical row at the App level, so by the time the
  // publish modal sees the item there can be no in-stash twin to flag. See
  // T425873 maintainer feedback.)
  const canPublish = issues.length === 0 && captionResult.valid && !dupChecking && !sequenceResolving && (!dup || confirmedDuplicate);

  // Esc closes (except while publishing, to avoid abandoning a half-done write).
  React.useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && state !== 'publishing') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [state, onClose]);

  const doPublish = async (ignorewarnings = false) => {
    setState('publishing');
    setError(null);
    try {
      const res = await publishOne(item, {
        ignorewarnings,
        selfUsername,
        templateConfig,
        // If the user touched the textarea their copy is authoritative;
        // otherwise the publish-time generator runs again (in case e.g. the
        // item state changed since the modal opened).
        ...(wikitextDirty ? { wikitext: editedWikitext } : {}),
        // Sequence-placeholder rows (T425984): pass the pre-resolved
        // `<basename> N` so makeFinalFilename uses it instead of the literal
        // `<basename> #` (which the sanitizer would otherwise turn into
        // `<basename> -`).
        ...(resolvedTitle ? { resolvedTitle } : {}),
      });
      if (res.state === 'warning') {
        setWarnings(res.warnings);
        setState('warning');
      } else if (res.state === 'success') {
        setResult(res);
        setState('success');
        // Notify the parent — it'll remove the item, drop the draft, and
        // prune the hidden list.
        onPublished?.(item, res);
      } else {
        setError(res.error || 'Unknown error');
        setState('error');
      }
    } catch (e) {
      setError(e.message || String(e));
      setState('error');
    }
  };

  return (
    <div className="publish-modal-backdrop" onClick={state === 'publishing' ? undefined : onClose}>
      <div className="publish-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Publish to Commons">
        {state === 'confirm' && (
          <>
            <header className="publish-modal__head">
              <h2 className="publish-modal__title">Publish to Commons</h2>
              <button className="btn btn--quiet btn--icon-only" onClick={onClose} title="Close (Esc)">
                <Icon name="close" size={16} />
              </button>
            </header>

            <div className="publish-modal__body">
              {issues.length > 0 && (
                <div className="publish-modal__block">
                  <strong>Can't publish yet:</strong>
                  <IssueList codes={issues} />
                  <p className="publish-modal__hint">Fix these in the detail panel and try again.</p>
                </div>
              )}

              {!captionResult.valid && (
                <div className="publish-modal__block" role="alert">
                  <strong><Icon name="warn" size={14} /> Caption can't be saved as-is.</strong>
                  <ul className="publish-modal__issues">
                    {captionResult.errors.map((err) => (
                      <li key={err.code}><Icon name="warn" size={12} /> {err.message}</li>
                    ))}
                  </ul>
                  <p className="publish-modal__hint">
                    Captions are stored as the file's Wikibase label and rendered as plain text — fix the issues above and try again.{' '}
                    <a href="https://commons.wikimedia.org/wiki/Commons:File_captions" target="_blank" rel="noopener noreferrer">
                      Caption guidance
                    </a>.
                  </p>
                </div>
              )}

              {dup && (
                <div className="publish-modal__block" role="alert">
                  <strong><Icon name="warn" size={14} /> This file is already on Commons.</strong>
                  <p className="publish-modal__hint">
                    An identical file (same SHA-1) was uploaded
                    {dup.user && <> by <strong>{dup.user}</strong></>}
                    {dup.timestamp && <> on {new Date(dup.timestamp).toLocaleDateString()}</>} as{' '}
                    <a
                      href={dup.descriptionurl || `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(dup.filename)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      File:{dup.filename}
                    </a>
                    . Publishing will create an exact duplicate.
                  </p>
                  <label className="publish-modal__confirm">
                    <input
                      type="checkbox"
                      checked={confirmedDuplicate}
                      onChange={(e) => setConfirmedDuplicate(e.target.checked)}
                    />{' '}
                    I know this file already exists on Commons and want to publish anyway.
                  </label>
                </div>
              )}

              <section className="publish-modal__section">
                <div className="publish-modal__label">Will be published as</div>
                {sequenceResolving ? (
                  <p className="publish-modal__hint" aria-live="polite">
                    <span className="spinner spinner--inline" /> Resolving sequence number from your Commons history…
                  </p>
                ) : (
                  <>
                    <code className="publish-modal__filename">File:{filename}</code>
                    {isPlaceholder && resolvedTitle && (
                      <p className="publish-modal__hint">
                        Sequence resolved from your existing <code>{`${resolvedTitle.replace(/ \d+$/, '')} N`}</code> files on Commons.
                      </p>
                    )}
                  </>
                )}
              </section>

              <section className="publish-modal__section">
                <div className="publish-modal__label">
                  Wikitext
                  {wikitextDirty && (
                    <button
                      type="button"
                      className="btn btn--small btn--quiet"
                      onClick={() => { setWikitextDirty(false); setEditedWikitext(generatedWikitext); }}
                      style={{ marginLeft: 'var(--spacing-50)' }}
                      title="Discard hand-edits and regenerate from the row"
                    >
                      Reset
                    </button>
                  )}
                </div>
                <textarea
                  className="publish-modal__wikitext publish-modal__wikitext--editable"
                  value={editedWikitext}
                  onChange={(e) => { setEditedWikitext(e.target.value); setWikitextDirty(true); }}
                  spellCheck={false}
                  rows={Math.min(20, Math.max(8, editedWikitext.split('\n').length + 1))}
                />
                <p className="publish-modal__hint">
                  Edit by hand to patch any last-minute issues before publish.
                </p>
              </section>

              <section className="publish-modal__section">
                <div className="publish-modal__label">Structured data</div>
                <ClaimSummary claims={claims} />
                <p className="publish-modal__hint">
                  Structured data is derived from the row and isn't editable
                  here. Adjust depicts / location / date in the table or
                  detail panel before publishing.
                </p>
              </section>
            </div>

            <footer className="publish-modal__foot">
              {dupChecking && (
                <span className="publish-modal__hint" aria-live="polite">
                  <span className="spinner spinner--inline" /> Checking Commons…
                </span>
              )}
              {sequenceResolving && !dupChecking && (
                <span className="publish-modal__hint" aria-live="polite">
                  <span className="spinner spinner--inline" /> Resolving sequence…
                </span>
              )}
              <button className="btn btn--quiet" onClick={onClose}>Cancel</button>
              <button
                className="btn btn--progressive"
                onClick={() => doPublish(false)}
                disabled={!canPublish}
                title={
                  dupChecking ? 'Checking Commons for an existing copy…' :
                  sequenceResolving ? 'Resolving the next number in your sequence…' :
                  undefined
                }
              >
                <Icon name="publish" size={14} /> Publish
              </button>
            </footer>
          </>
        )}

        {state === 'publishing' && (
          <div className="publish-modal__pending">
            <div className="spinner" aria-label="Publishing" />
            <h2>Publishing…</h2>
            <p>Sending to Commons. Don't close the tab.</p>
          </div>
        )}

        {state === 'warning' && (
          <>
            <header className="publish-modal__head">
              <h2 className="publish-modal__title">Commons returned warnings</h2>
            </header>
            <div className="publish-modal__body">
              <p>The file was <strong>not</strong> uploaded. Review and either edit the metadata or publish anyway.</p>
              <ul className="publish-modal__warnings">
                {Object.entries(warnings || {}).map(([key, val]) => (
                  <li key={key}><strong>{key}</strong>: {typeof val === 'string' ? val : JSON.stringify(val)}</li>
                ))}
              </ul>
            </div>
            <footer className="publish-modal__foot">
              <button className="btn btn--quiet" onClick={onClose}>Cancel</button>
              <button className="btn" onClick={() => setState('confirm')}>Edit metadata</button>
              <button className="btn btn--destructive" onClick={() => doPublish(true)}>
                <Icon name="publish" size={14} /> Publish anyway
              </button>
            </footer>
          </>
        )}

        {state === 'success' && (
          <>
            <header className="publish-modal__head publish-modal__head--success">
              <h2 className="publish-modal__title"><Icon name="ok" size={20} /> Published</h2>
            </header>
            <div className="publish-modal__body">
              <p>
                <code>File:{result?.filename}</code> is live on Commons.
              </p>
              {result?.sdcError && (
                <p className="publish-modal__hint" role="alert">
                  Note: structured data couldn't be saved ({result.sdcError}).
                  You can add depicts / coordinates manually on the file page.
                </p>
              )}
            </div>
            <footer className="publish-modal__foot">
              {result?.descriptionurl && (
                <a className="btn" href={result.descriptionurl} target="_blank" rel="noopener noreferrer">
                  <Icon name="external" size={14} /> Open on Commons
                </a>
              )}
              <button className="btn btn--progressive" onClick={onClose}>Done</button>
            </footer>
          </>
        )}

        {state === 'error' && (
          <>
            <header className="publish-modal__head publish-modal__head--error">
              <h2 className="publish-modal__title"><Icon name="warn" size={20} /> Couldn't publish</h2>
            </header>
            <div className="publish-modal__body">
              <p>{error}</p>
            </div>
            <footer className="publish-modal__foot">
              <button className="btn btn--quiet" onClick={onClose}>Close</button>
              <button className="btn btn--progressive" onClick={() => doPublish(false)}>Try again</button>
            </footer>
          </>
        )}
      </div>
    </div>
  );
}

// Helper: drop the local trace of a published file (called by the parent on success).
// Clear both the sha1 (canonical) and filekey (legacy) hide entries, so a
// future re-upload of the same bytes shows up cleanly.
export function cleanupAfterPublish(item) {
  const key = draftKey(item);
  if (key) deleteDraft(key);
  if (item?.sha1) unhideSha1(item.sha1);
  if (item?.filekey) unhideFilekey(item.filekey);
}
