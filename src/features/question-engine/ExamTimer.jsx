
import React, { useState, useEffect, useCallback, useRef } from "react";
import { Clock, Eye, EyeOff } from "lucide-react";
import { supabase } from "../../supabaseClient";

// Secure exam countdown, shared by Reading, Listening and Writing.
//
// The start time is written ONCE by the database (exam_timer_status),
// using the server clock. The countdown is computed from that start time
// and the server's current time — never from the student's own clock —
// so refreshing, reconnecting or changing the computer's time changes
// nothing. The database itself also refuses answers after the end.
//
// THE SCREEN NUMBER (livraison 47, sql/32).
// Every time the screen of a paper opens, it draws a random number, kept
// in this page's memory only (never in the browser's storage). It goes
// with the Start and with every call to the clock. The database keeps the
// number of the screen where the paper is open: a DIFFERENT number while
// the paper is in progress means it was reopened elsewhere — F5, the Back
// button then Continue, a second tab, another device — and the copy
// freezes like Escape. Calls from the same screen (Try again, a future
// resynchronisation, Continue after a teacher lets the candidate back in)
// always carry the same number, so they never freeze anyone.
function newScreenNumber() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  // Older browsers: a random version-4 uuid from getRandomValues.
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// status: "loading" | "untimed" | "not-started" | "running" | "expired" | "error"
export function useExamTimer(assignmentId, enabled) {
  // One number per opening of this paper's screen (a new paper in the same
  // component gets a new one).
  const screenRef = useRef({ assignmentId: null, number: null });
  if (screenRef.current.assignmentId !== assignmentId) {
    screenRef.current = { assignmentId, number: newScreenNumber() };
  }
  const screenNumber = screenRef.current.number;

  const [info, setInfo] = useState(null); // { startedAt:number|null, limitMin:number|null, offsetMs:number }
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => Date.now());

  const apply = useCallback((data) => {
    const serverNow = data?.server_now ? new Date(data.server_now).getTime() : Date.now();
    setNow(Date.now());
    setInfo({
      startedAt: data?.started_at ? new Date(data.started_at).getTime() : null,
      limitMin: data?.time_limit_minutes ?? null,
      // Difference between the server clock and this computer's clock.
      offsetMs: serverNow - Date.now(),
    });
  }, []);

  useEffect(() => {
    if (!enabled || !assignmentId) return;
    let cancelled = false;
    (async () => {
      const { data, error: e } = await supabase.rpc("exam_timer_status", { p_assignment_id: assignmentId, p_start: false, p_page: screenNumber });
      if (cancelled) return;
      if (e) setError(e.message);
      else apply(data);
    })();
    return () => { cancelled = true; };
  }, [assignmentId, enabled, apply, screenNumber]);

  const start = useCallback(async () => {
    const { data, error: e } = await supabase.rpc("exam_timer_status", { p_assignment_id: assignmentId, p_start: true, p_page: screenNumber });
    if (e) {
      setError(e.message);
      return false;
    }
    apply(data);
    return true;
  }, [assignmentId, apply, screenNumber]);

  const running = info && info.limitMin && info.startedAt;
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [running]);

  let status = "loading";
  let remainingSec = null;
  if (error) status = "error";
  else if (info) {
    if (!info.limitMin) status = "untimed";
    else if (!info.startedAt) status = "not-started";
    else {
      const endServer = info.startedAt + info.limitMin * 60 * 1000;
      const total = info.limitMin * 60;
      remainingSec = Math.min(total, Math.max(0, Math.ceil((endServer - (now + info.offsetMs)) / 1000)));
      status = remainingSec > 0 ? "running" : "expired";
    }
  }

  return { status, remainingSec, hasStarted: Boolean(info?.startedAt), limitMin: info?.limitMin ?? null, start, error };
}

function fmt(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

// The countdown pill shown at the right of the green "Assignment" bar.
// The student can hide the numbers (the time keeps running and the
// automatic submission still happens).
export function ExamTimerDisplay({ remainingSec }) {
  const [hidden, setHidden] = useState(false);
  if (remainingSec === null || remainingSec === undefined) return null;

  const level = remainingSec <= 5 * 60 ? "danger" : remainingSec <= 10 * 60 ? "warn" : "ok";

  return (
    <div className={`qe-timer qe-timer-${level} ${hidden ? "qe-timer-hidden" : ""}`} role="timer" aria-live="off">
      <Clock size={15} strokeWidth={2.4} />
      {hidden ? (
        <span className="qe-timer-label">Time hidden</span>
      ) : (
        <span className="qe-timer-value">{fmt(remainingSec)}</span>
      )}
      <button
        type="button"
        className="qe-timer-toggle"
        onClick={() => setHidden((v) => !v)}
        title={hidden ? "Show the remaining time" : "Hide the remaining time"}
        aria-label={hidden ? "Show the remaining time" : "Hide the remaining time"}
      >
        {hidden ? <Eye size={14} /> : <EyeOff size={14} />}
      </button>
    </div>
  );
}
