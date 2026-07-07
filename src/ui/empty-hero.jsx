// Empty-stash hero: large drop target shown when the stash has no files.
//
// Replaces the small inline "EmptyRow" hint for the empty-stash case so a
// first-time visitor sees a clear "drop files to start" call-to-action
// instead of a faint dashed strip. The actual drag-drop wiring lives on
// `window` (see `src/ui/dropzone.jsx`) — clicks here just route to the
// existing file-picker via the same `uw:open-picker` event the topbar
// Upload button uses, so there's a single code path for "user picked
// files" regardless of where they clicked. The hero card is non-interactive
// otherwise (the window-level dropzone already accepts files dropped
// anywhere on the app, including on top of this hero); we just make the
// affordance visible. (T426377)
//
// Sized large enough to dominate the empty page, but uses the same dashed
// progressive-blue border + iconography as the dropzone-overlay so the
// "drop here" language is consistent across empty-state and active-drag.

import React from 'react';
import { openFilePicker } from './dropzone.jsx';

const Icon = window.Icon;

export function EmptyHero() {
  return (
    <div className="empty-hero" role="region" aria-label="Drop files to start uploading">
      <div className="empty-hero__icon" aria-hidden="true">
        <Icon name="upload" size={56} />
      </div>
      <h2 className="empty-hero__title">Drop files here to start uploading</h2>
      <p className="empty-hero__subtitle">
        Drag photos onto the page, or browse from your device. Files land in
        your stash so you can edit titles, descriptions, categories and
        licenses in the table view before publishing to Wikimedia Commons.
      </p>
      <button
        type="button"
        className="btn btn--progressive empty-hero__browse"
        onClick={openFilePicker}
      >
        <Icon name="upload" size={16} /> Browse files
      </button>
      <p className="empty-hero__hint">
        You can drop files anywhere on this window.
      </p>
    </div>
  );
}
