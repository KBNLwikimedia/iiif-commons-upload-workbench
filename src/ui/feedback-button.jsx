// Always-visible floating Feedback button — anchored mid-right of the
// viewport. Mounts at <Root> level so it appears on every screen (login,
// loading, error panels, the main app). Click opens <FeedbackModal/>.
//
// The button frames the tool as in beta to encourage feedback. The modal
// reuses the same window.open plumbing as the error-report flow (T426408)
// — no new OAuth scopes.

import React from 'react';
import FeedbackModal from './feedback-modal.jsx';

const Icon = window.Icon;
const { useState } = React;

export default function FeedbackButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="feedback-fab"
        onClick={() => setOpen(true)}
        aria-label="Send feedback (the tool is in beta — feedback is welcome)"
        title="Upload Workbench is in beta — your feedback is unusually valuable"
      >
        <Icon name="info" size={14} />
        <span className="feedback-fab__label">Feedback</span>
        <span className="feedback-fab__beta">Beta</span>
      </button>
      {open && <FeedbackModal onClose={() => setOpen(false)} />}
    </>
  );
}
