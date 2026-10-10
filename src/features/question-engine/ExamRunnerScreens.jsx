// =====================================================================
// The exam screen (student) — what is shown instead of the paper: the
// start screen, « The time for this exam is over », loading, and the two
// messages also used by AssignmentOpenBridge.
// Livraison 99 — moved out of StudentExamRunner.jsx without any change.
// StudentExamRunner keeps every read, save, timer and hand-in; what is
// here only shows. The render functions are plain functions called while
// the page renders (not components), so React sees exactly the same page.
// =====================================================================
import React from "react";
import { ArrowLeft, MonitorSmartphone } from "lucide-react";


// The time is over: nothing can be handed in any more.
export function renderTimeOver(v) {
  const { setScreen } = v;
  return (
    <div className="page">
      <button className="back-link" onClick={() => setScreen({ name: "home" })}><ArrowLeft size={14} /> Back to assignments</button>
      <div className="qe-feedback-locked">
        <p><strong>The time for this exam is over.</strong></p>
        <p>No answers could be submitted after the end of the time limit.</p>
      </div>
    </div>
  );
}

// While the paper loads.
export function renderLoading(v) {
  const { setScreen } = v;
  return (
    <div className="page">
      <button className="back-link" onClick={() => setScreen({ name: "home" })}><ArrowLeft size={14} /> All assignments</button>
      <p className="empty-inline">Loading…</p>
    </div>
  );
}

// Shown once, before the exam actually begins (see StudentExamRunner).
export function renderStartScreen(v) {
  const { assignment, compact, sections, setScreen, startError, startExam, starting, timer, totalQuestionCount } = v;
  return (
    <div className="wf-overlay qe-exam-shell">
      <div className="qe-start-screen">
        <div className="qe-start-card">
          <div className="eyebrow">{assignment.type}</div>
          <h1 className="page-title" style={{ marginTop: 4 }}>{assignment.title}</h1>
          <p className="qe-start-meta">
            {sections.length} part{sections.length > 1 ? "s" : ""} · {totalQuestionCount} question{totalQuestionCount > 1 ? "s" : ""}
            {assignment.time_limit_minutes ? ` · ${assignment.time_limit_minutes} minutes` : ""}
          </p>
          {assignment.time_limit_minutes && (
            <p className="qe-start-note">
              Your timer starts when you press Start. When the time runs out, your answers are submitted automatically.
            </p>
          )}
          {compact && (
            <div className="qe-start-device-note">
              <MonitorSmartphone size={16} />
              <span>
                You are on a small screen. You can work here, but a real exam is much easier
                on a computer or a tablet — the text and the questions then sit side by side.
              </span>
            </div>
          )}
          {startError && <div className="field-error" style={{ marginTop: 14 }}>{startError}</div>}
          <button className="btn-primary qe-start-btn" disabled={starting || timer.status === "loading" || timer.status === "expired"} onClick={startExam}>
            {starting ? "Starting…" : "Start exam"}
          </button>
          <button className="back-link" style={{ marginTop: 14 }} onClick={() => setScreen({ name: "home" })}>
            <ArrowLeft size={14} /> Back to assignments
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Messages shown instead of the exam. Also used by AssignmentOpenBridge, so a
// refused paper reads exactly the same wherever it is opened.
// ---------------------------------------------------------------------------

export function PaperUnavailable({ onBack }) {
  return (
    <div className="page">
      <button className="back-link" onClick={onBack}><ArrowLeft size={14} /> All assignments</button>
      <div className="qe-feedback-locked">
        <p><strong>You can't open this paper right now.</strong></p>
        <p>It may be locked until you finish the previous paper, the exam may be closed, or you may have already submitted it. If this looks wrong, ask your teacher.</p>
      </div>
    </div>
  );
}

export function PaperLoadError({ onBack, onRetry }) {
  return (
    <div className="page">
      <button className="back-link" onClick={onBack}><ArrowLeft size={14} /> All assignments</button>
      <div className="qe-feedback-locked">
        <p><strong>Connection problem.</strong></p>
        <p>This paper could not be loaded. Check your internet connection and try again.</p>
        <button className="btn-primary" onClick={onRetry}>Try again</button>
      </div>
    </div>
  );
}
