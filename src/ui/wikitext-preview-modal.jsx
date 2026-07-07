// Per-row wikitext preview — read-only inspection of the wikitext that
// would be published for a single file given its current metadata.
//
// Read-only on purpose for v1 (per the task spec). The publish-stage modal
// is where the user can hand-edit before commit. This one is a no-commit
// "what would my wikitext look like?" view.

import React from 'react';
import { buildWikitext, makeFinalFilename } from '../api/publish.js';
import { isSequencePlaceholderTitle } from '../api/title-validation.js';

const Icon = window.Icon;

export function WikitextPreviewModal({ item, templateConfig, onClose }) {
  // T425984: when the title is a sequence placeholder we show the wikitext
  // with the literal `<basename> #` in place. Doing the async resolve here
  // would surprise the user who expects the preview to reflect the row as it
  // is right now; instead we leave the placeholder visible and surface a
  // note explaining the publish step substitutes the next integer.
  const isPlaceholder = isSequencePlaceholderTitle(item?.title);
  const wikitext = React.useMemo(
    () => buildWikitext(item, templateConfig),
    [item, templateConfig],
  );
  const filename = React.useMemo(() => makeFinalFilename(item), [item]);

  // Esc closes.
  React.useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  // Copy-to-clipboard helper for the user's convenience.
  const [copied, setCopied] = React.useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(wikitext);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      // Clipboard write can fail in a couple of ways (no permission, http,
      // etc.). Surface it via the button's alt-text rather than crashing.
      console.warn('Clipboard copy failed:', e);
    }
  };

  return (
    <div className="publish-modal-backdrop" onClick={onClose}>
      <div
        className="publish-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Wikitext preview"
      >
        <header className="publish-modal__head">
          <h2 className="publish-modal__title">Wikitext preview</h2>
          <button
            className="btn btn--quiet btn--icon-only"
            onClick={onClose}
            title="Close (Esc)"
          >
            <Icon name="close" size={16} />
          </button>
        </header>

        <div className="publish-modal__body">
          <section className="publish-modal__section">
            <div className="publish-modal__label">Will be published as</div>
            <code className="publish-modal__filename">File:{filename}</code>
          </section>

          <section className="publish-modal__section">
            <div className="publish-modal__label">
              Wikitext
              <button
                type="button"
                className="btn btn--small btn--quiet"
                onClick={onCopy}
                style={{ marginLeft: 'var(--spacing-50)' }}
                title="Copy the wikitext to your clipboard"
              >
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <pre className="publish-modal__wikitext">{wikitext}</pre>
          </section>

          <p className="publish-modal__hint">
            This preview is read-only. Hand-editing the wikitext before
            publish is available in the publish-confirmation modal.
          </p>
          {isPlaceholder && (
            <p className="publish-modal__hint">
              <Icon name="info" size={11} /> The title is a sequence placeholder
              (<code>{item.title}</code>). At publish time, <code> #</code> is
              replaced with the next integer continuing your existing
              <code>{` ${(item.title || '').replace(/ #$/, '')} N`}</code>
              {' '}files on Commons.
            </p>
          )}
        </div>

        <footer className="publish-modal__foot">
          <button className="btn btn--progressive" onClick={onClose}>Done</button>
        </footer>
      </div>
    </div>
  );
}
