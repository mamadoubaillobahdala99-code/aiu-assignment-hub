import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "../../supabaseClient";

// Invigilation for a paper sat inside an exam session.
//
// What a browser can actually do, and what it cannot: a page cannot
// stop a screenshot, cannot see browser extensions, cannot know a phone
// is lying on the desk. So this is not a wall. It is a record and a
// freeze: leaving the screen is reported to the server, the copy
// freezes, the clock keeps running (it is computed from the server's
// start time — nothing here can pause it), and only a teacher can let
// the candidate back in.
//
// The server decides everything: whether this paper is watched at all,
// and whether an incident freezes. This file only reports what it sees.
// A class assignment is not watched, so the hook stays silent there.

// A blur shorter than this is not counted: a notification stealing
// focus for a moment is not a candidate leaving the exam. Long enough
// to ignore the noise, short enough that a real look elsewhere counts.
const BLUR_GRACE_MS = 1200;

export function useInvigilation(assignmentId, active) {
  const [state, setState] = useState({
    watched: false, frozen: false, strict: false, kind: null, reason: null,
  });
  const [sending, setSending] = useState(false);
  // Set while the page closes the exam itself (submit, exit): the
  // fullscreen we drop on purpose must not be reported as an escape.
  const stoppingRef = useRef(false);
  const blurTimerRef = useRef(null);
  const activeRef = useRef(active);
  activeRef.current = active;

  const report = useCallback(async (kind) => {
    if (!activeRef.current || stoppingRef.current || !assignmentId) return;
    const { data, error } = await supabase.rpc("exam_report_incident", {
      p_assignment_id: assignmentId, p_kind: kind,
    });
    if (error) return;                       // never block the exam on a failed report
    if (data?.watched === false) { setState((s) => ({ ...s, watched: false })); return; }
    if (data?.frozen) setState((s) => ({ ...s, watched: true, frozen: true, kind: s.kind || kind }));
  }, [assignmentId]);

  // Where do we stand? Asked on arrival — which also catches a student
  // who reloads the page hoping the freeze will go away.
  useEffect(() => {
    if (!active || !assignmentId) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc("exam_my_invigilation", { p_assignment_id: assignmentId });
      if (cancelled || error || !data) return;
      setState({
        watched: Boolean(data.watched), frozen: Boolean(data.frozen),
        strict: Boolean(data.strict), kind: data.kind || null, reason: data.reason || null,
      });
    })();
    return () => { cancelled = true; };
  }, [active, assignmentId]);

  // The watching itself.
  useEffect(() => {
    if (!active || !assignmentId) return;

    const onFullscreen = () => {
      if (!document.fullscreenElement) report("fullscreen_exit");
    };
    // Hidden tab: unambiguous, report at once.
    const onVisibility = () => {
      if (document.hidden) report("tab_switch");
    };
    // Another application took over. Some browsers do not mark the tab
    // hidden for that, so this is the one that catches alt-tab — but it
    // also fires for a passing notification, hence the grace period.
    const onBlur = () => {
      clearTimeout(blurTimerRef.current);
      blurTimerRef.current = setTimeout(() => report("tab_switch"), BLUR_GRACE_MS);
    };
    const onFocus = () => clearTimeout(blurTimerRef.current);

    // These three are blocked outright, and noted. They never freeze —
    // the server decides that, and it does not freeze a room for a
    // reflex.
    const onPaste = (e) => { e.preventDefault(); report("paste"); };
    const onCopy = (e) => { e.preventDefault(); report("copy"); };
    const onContextMenu = (e) => { e.preventDefault(); report("context_menu"); };

    document.addEventListener("fullscreenchange", onFullscreen);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    document.addEventListener("paste", onPaste);
    document.addEventListener("copy", onCopy);
    document.addEventListener("contextmenu", onContextMenu);
    return () => {
      clearTimeout(blurTimerRef.current);
      document.removeEventListener("fullscreenchange", onFullscreen);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("paste", onPaste);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("contextmenu", onContextMenu);
    };
  }, [active, assignmentId, report]);

  // While frozen, ask every 5 seconds whether a teacher has let us back
  // in. Nothing else talks to the server during a freeze.
  useEffect(() => {
    if (!active || !state.frozen || !assignmentId) return;
    const id = setInterval(async () => {
      const { data, error } = await supabase.rpc("exam_my_invigilation", { p_assignment_id: assignmentId });
      if (error || !data) return;
      if (!data.frozen) setState((s) => ({ ...s, frozen: false, kind: null, reason: null }));
      else if (data.reason && !state.reason) setState((s) => ({ ...s, reason: data.reason }));
    }, 5000);
    return () => clearInterval(id);
  }, [active, state.frozen, state.reason, assignmentId]);

  // Only ever called from a real click — browsers refuse otherwise.
  const enterFullscreen = useCallback(() => {
    if (document.fullscreenElement) return;
    document.documentElement.requestFullscreen?.().catch(() => {});
  }, []);

  // The page is closing the exam on purpose: stop reporting, and leave
  // fullscreen quietly.
  const stopWatching = useCallback(() => {
    stoppingRef.current = true;
    clearTimeout(blurTimerRef.current);
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  }, []);

  const explain = useCallback(async (text) => {
    if (!assignmentId) return false;
    setSending(true);
    const { data, error } = await supabase.rpc("exam_explain_incident", {
      p_assignment_id: assignmentId, p_reason: text,
    });
    setSending(false);
    if (error) return false;
    if (data?.explained) setState((s) => ({ ...s, reason: text }));
    return Boolean(data?.explained);
  }, [assignmentId]);

  return { ...state, sending, enterFullscreen, stopWatching, explain };
}

// A phone is not a place to sit a real exam: no fullscreen at all on
// iPhone, a keyboard over half the screen, and a notification every few
// minutes. Measured on the short side so a phone held sideways is still
// a phone, and a tablet in portrait is still a tablet.
export function isPhoneScreen() {
  if (typeof window === "undefined") return false;
  return Math.min(window.innerWidth, window.innerHeight) < 600;
}
