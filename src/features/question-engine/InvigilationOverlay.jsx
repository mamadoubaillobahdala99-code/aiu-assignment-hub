import React, { useState } from "react";
import { ShieldAlert, Loader2, Send, Maximize } from "lucide-react";

// Shown over the whole paper when a candidate has left the exam screen
// and the exam is in strict mode. It covers everything: the paper is
// unreachable until a teacher allows the restart — and then until the
// candidate presses Continue, because only a click can give full screen
// back (see useInvigilation.js).
//
// It says plainly that the clock is still running. That is the truth —
// the countdown is computed from the server's start time — and it is
// what makes leaving the screen expensive.
const WHY = {
  fullscreen_exit: "You left full screen.",
  tab_switch: "You left the exam screen.",
  page_reload: "You refreshed or reopened the page.",
};

export function InvigilationOverlay({ invig }) {
  const [text, setText] = useState("");
  const [sent, setSent] = useState(false);

  if (!invig) return null;
  if (!invig.frozen && !invig.needsReturn) return null;

  const told = sent || Boolean(invig.reason);

  async function send() {
    if (text.trim().length < 3) return;
    const ok = await invig.explain(text.trim());
    if (ok) setSent(true);
  }

  // Waiting for the click that restores full screen — either because a
  // teacher has just let the candidate back in, or because the paper was
  // reopened outside full screen (a refresh). Only a click can ask for
  // full screen, so there is nothing to do but ask for one.
  if (!invig.frozen) {
    const restart = invig.returnMode === "restart";
    return (
      <div className="qe-frozen" role="alertdialog" aria-modal="true">
        <div className="qe-frozen-card">
          <Maximize size={30} className="qe-frozen-back" />
          <h2 className="qe-frozen-title">
            {restart ? "This exam runs in full screen" : "Your teacher let you back in"}
          </h2>
          <p className="qe-frozen-clock">
            Press Continue to go back to your paper in full screen.{" "}
            <strong>Your time has not stopped.</strong>
          </p>
          <button className="btn-primary" style={{ marginTop: 18 }} onClick={invig.returnToExam}>
            <Maximize size={15} /> Continue the exam
          </button>
          {invig.returnFailed && (
            <p className="qe-frozen-why" style={{ marginTop: 14 }}>
              This computer refused full screen. Call your teacher — the exam cannot
              go on without it.
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="qe-frozen" role="alertdialog" aria-modal="true">
      <div className="qe-frozen-card">
        <ShieldAlert size={30} className="qe-frozen-icon" />
        <h2 className="qe-frozen-title">Exam suspended</h2>
        <p className="qe-frozen-why">{WHY[invig.kind] || "You left the exam screen."}</p>
        <p className="qe-frozen-clock">
          <strong>Your time is still running.</strong> Call your teacher — only a teacher can
          let you back in.
        </p>

        {told ? (
          <div className="qe-frozen-waiting">
            <Loader2 size={16} className="spin" />
            <span>Your teacher has been told. Waiting to be let back in…</span>
          </div>
        ) : (
          <>
            <label className="field-label" style={{ marginTop: 18 }}>
              Tell your teacher what happened
            </label>
            <textarea
              className="field-input qe-frozen-input"
              rows={3}
              autoFocus
              value={text}
              placeholder="e.g. my screen went black, or the page left full screen on its own"
              onChange={(e) => setText(e.target.value)}
            />
            <button
              className="btn-primary"
              style={{ marginTop: 12 }}
              disabled={text.trim().length < 3 || invig.sending}
              onClick={send}
            >
              <Send size={14} /> {invig.sending ? "Sending…" : "Tell the teacher"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// "Pens down" (livraison 56). The server has handed this paper in by
// itself — the teacher closed the exam, the results were published, or
// the time ran out while this page could not hand it in (offline). The
// copy that counts is the one the server collected; nothing typed here
// afterwards can change it, so the paper is simply replaced by this.
const HANDED_IN = {
  closed: ["Your teacher closed the exam.", "Your answers were handed in as they were."],
  time: ["The time is over.", "Your answers were handed in as they were."],
  handed: ["This paper has been handed in.", "Nothing more can be changed in it."],
};
export function ExamHandedIn({ reason, onDone }) {
  const [title, text] = HANDED_IN[reason] || HANDED_IN.handed;
  return (
    <div className="page narrow">
      <div className="qe-feedback-locked" role="status">
        <p><strong>{title}</strong></p>
        <p>{text}</p>
        <button className="btn-primary" style={{ marginTop: 12 }} onClick={onDone}>Back to the exam</button>
      </div>
    </div>
  );
}
