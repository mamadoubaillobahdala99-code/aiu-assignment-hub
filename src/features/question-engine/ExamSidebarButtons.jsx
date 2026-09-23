import React, { useState, useEffect } from "react";
import { Check, ArrowLeft, Maximize, Minimize } from "lucide-react";

// The two small pieces of the black exam panel that both the
// Reading/Listening screen and the Writing screen need, kept in one
// place so they cannot drift apart.

// The folded strip. The panel gets folded away to gain room, and the
// paper still has to be handed in and left. Both buttons open the same
// dialogs as their full-size twins — in particular, handing in still
// asks for confirmation, because a control always within reach is also
// one an elbow can brush.
export function ExamStripButtons({ showSubmit, showExit = true, submitting, onSubmit, onExit }) {
  return (
    <div className="qe-exam-sidebar-mini">
      {showSubmit && (
        <button
          className="qe-exam-sidebar-mini-submit"
          disabled={submitting}
          onClick={onSubmit}
          title="Submit exam"
          aria-label="Submit exam"
        >
          <Check size={17} strokeWidth={3} />
        </button>
      )}
      {showExit && (
        <button className="qe-exam-sidebar-mini-exit" onClick={onExit} title="Exit" aria-label="Exit">
          <ArrowLeft size={16} />
        </button>
      )}
    </div>
  );
}

// Leaving the paper. Offered in a class assignment, where a student may
// well open a Reading on Monday and come back to it on Tuesday — but
// never during an exam: there, one does not walk out of a paper through
// a button. Handing in is the way out, and it closes the screen itself.
export function ExamExitButton({ invig, onExit }) {
  if (invig?.watched) return null;
  return (
    <button className="qe-exam-sidebar-exit" onClick={onExit}>
      <ArrowLeft size={14} /> Exit
    </button>
  );
}

// Full screen, from inside the paper.
//
// During a watched exam it only goes one way. Leaving full screen is
// what the invigilation reports as an escape, so a button offering to
// leave would be a button that freezes the candidate and calls his
// teacher — so once he is in full screen, it simply disappears. In an
// ordinary class assignment, with nobody watching, it is a normal
// there-and-back switch.
export function ExamFullscreenButton({ invig }) {
  const [isFs, setIsFs] = useState(() => typeof document !== "undefined" && Boolean(document.fullscreenElement));

  useEffect(() => {
    const onChange = () => setIsFs(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // A browser that has no full screen at all (iPhone) gets no button.
  if (typeof document !== "undefined" && !document.documentElement.requestFullscreen) return null;

  const guarded = Boolean(invig?.watched && invig?.strict);
  if (isFs && guarded) return null;

  function toggle() {
    // Always from a real click — browsers refuse full screen asked for
    // at any other moment.
    if (!document.fullscreenElement) {
      if (invig?.enterFullscreen) invig.enterFullscreen();
      else document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  }

  return (
    <button className="qe-exam-sidebar-item qe-exam-sidebar-fs" onClick={toggle}>
      {isFs ? <Minimize size={15} /> : <Maximize size={15} />}
      {isFs ? "Exit full screen" : "Full screen"}
    </button>
  );
}

