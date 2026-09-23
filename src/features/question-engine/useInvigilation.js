import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "../../supabaseClient";

// Invigilation for a paper sat inside an exam session.
//
// What a browser can actually do, and what it cannot: a page cannot
// stop a screenshot, cannot see browser extensions, cannot close the
// candidate's other tabs, cannot know a phone is lying on the desk. So
// this is not a wall. It is a record and a freeze: leaving the exam
// screen is reported to the server, the copy freezes, the clock keeps
// running (it is computed from the server's start time — nothing here
// can pause it), and only a teacher can let the candidate back in.
//
// WHY THIS WATCHES A STATE AND NOT EVENTS.
// The first version listened for the moment the page left full screen
// and the moment the tab was hidden. Two holes came out of that in the
// first real exam:
//   - after a teacher had let a candidate back in, the page was no
//     longer in full screen — and a browser only grants full screen on
//     a real click, so it never came back on its own. From then on the
//     candidate was outside full screen permanently, and there was no
//     further "left full screen" event to catch. He could come and go
//     freely;
//   - some ways of leaving raise no event at all: a side panel (Edge's
//     Copilot), a second window placed beside the exam. The tab is
//     never hidden, the window is never blurred.
// So the condition itself is now re-read once a second: is this page
// still in full screen, is it still visible? A state cannot be missed
// the way an event can. Events are kept as well, because they react
// instantly; the check is the safety net underneath them.

// A blur shorter than this is not counted: a notification stealing
// focus for a moment is not a candidate leaving the exam.
const BLUR_GRACE_MS = 1200;
// Two consecutive failed checks before freezing, so the half-second in
// which full screen is engaging or releasing never counts.
const STRIKES = 2;

export function useInvigilation(assignmentId, active) {
  const [state, setState] = useState({
    watched: false, frozen: false, strict: false, kind: null, reason: null,
  });
  // Let back in by a teacher, but the page is not in full screen any
  // more and only a click can restore it. The paper stays covered until
  // the candidate presses the button.
  const [needsReturn, setNeedsReturn] = useState(false);
  const [returnFailed, setReturnFailed] = useState(false);
  // Why the paper is covered, which decides what happens if the browser
  // refuses full screen:
  //   "resume"  — a teacher has just let the candidate back in. No full
  //               screen, no exam: he waits for the invigilator.
  //   "restart" — the paper was reopened without full screen (a refresh,
  //               a page restored from the browser's cache). A machine
  //               that simply cannot do full screen must not be stopped
  //               from sitting the exam, so a refusal lets him through —
  //               exactly as before, when the same machine was never
  //               asked in the first place.
  const [returnMode, setReturnMode] = useState("resume");
  const [sending, setSending] = useState(false);

  // Set while the page closes the exam itself (submit, exit): the full
  // screen we drop on purpose must not be reported as an escape.
  const stoppingRef = useRef(false);
  const blurTimerRef = useRef(null);
  const activeRef = useRef(active);
  activeRef.current = active;
  // Did full screen ever work here? On a machine where it is refused we
  // must not freeze the candidate for something he cannot fix.
  const fsUsedRef = useRef(false);
  const strikesRef = useRef(0);
  const wasFrozenRef = useRef(false);
  const returnModeRef = useRef("resume");
  returnModeRef.current = returnMode;

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

  // ---------- events: they react at once ----------
  useEffect(() => {
    if (!active || !assignmentId) return;

    const onFullscreen = () => { if (!document.fullscreenElement) report("fullscreen_exit"); };
    const onVisibility = () => { if (document.hidden) report("tab_switch"); };
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

  // ---------- the state check: the safety net ----------
  // Paused while the candidate is frozen (nothing to add) and while he
  // is on the "press Continue" screen (he is legitimately outside full
  // screen at that moment — freezing him there would trap him).
  useEffect(() => {
    if (!active || !assignmentId) return;
    if (!state.watched || !state.strict) return;
    if (state.frozen || needsReturn) return;
    strikesRef.current = 0;
    const id = setInterval(() => {
      if (stoppingRef.current) return;
      let wrong = null;
      if (document.hidden) wrong = "tab_switch";
      else if (fsUsedRef.current && !document.fullscreenElement) wrong = "fullscreen_exit";
      if (!wrong) { strikesRef.current = 0; return; }
      strikesRef.current += 1;
      if (strikesRef.current >= STRIKES) { strikesRef.current = 0; report(wrong); }
    }, 1000);
    return () => clearInterval(id);
  }, [active, assignmentId, state.watched, state.strict, state.frozen, needsReturn, report]);

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

  // Coming out of a freeze: the paper stays covered until the candidate
  // presses Continue, because that click is the only thing that can
  // give full screen back.
  useEffect(() => {
    if (state.frozen) { wasFrozenRef.current = true; return; }
    if (!wasFrozenRef.current) return;
    wasFrozenRef.current = false;
    if (fsUsedRef.current && !document.fullscreenElement) {
      setReturnFailed(false);
      setReturnMode("resume");
      setNeedsReturn(true);
    }
  }, [state.frozen]);

  // The paper is open, the exam is watched — and we are not in full
  // screen. That is what a refresh used to leave behind: the reloaded
  // page had no memory that full screen had ever been used, so it never
  // reported anything and never asked for it back. Pressing F5 was a
  // silent way out of full screen for the rest of the paper.
  //
  // The delay is for the honest case: pressing Start asks for full
  // screen inside the same click, and the browser grants it a moment
  // later. The check is made again when the timer fires, so a normal
  // start never sees this screen.
  // fsUsedRef is what separates the two cases, and it matters: a
  // candidate who HAS been in full screen and is not any more has left
  // it, which is an incident — the watch below must report it and the
  // paper must freeze. Asking him politely to come back instead would
  // turn an escape into a free pass. This screen is only ever for a page
  // that has never had full screen at all, which is what a reload leaves
  // behind. And it is asked once: a machine that refuses must not be
  // nagged for the rest of the paper.
  const restartAskedRef = useRef(false);
  useEffect(() => {
    if (!active || !state.watched || !state.strict) return;
    if (state.frozen || needsReturn || restartAskedRef.current) return;
    if (fsUsedRef.current) return;
    if (!document.documentElement.requestFullscreen) return;  // iPhone: no full screen at all
    const id = setTimeout(() => {
      if (stoppingRef.current || fsUsedRef.current || document.fullscreenElement) return;
      restartAskedRef.current = true;
      setReturnFailed(false);
      setReturnMode("restart");
      setNeedsReturn(true);
    }, 1500);
    return () => clearTimeout(id);
  }, [active, state.watched, state.strict, state.frozen, needsReturn]);

  // Only ever called from a real click — browsers refuse otherwise.
  const enterFullscreen = useCallback(async () => {
    if (document.fullscreenElement) { fsUsedRef.current = true; return true; }
    const el = document.documentElement;
    if (!el.requestFullscreen) return false;   // iPhone: no full screen at all
    try {
      await el.requestFullscreen();
      fsUsedRef.current = true;
      return true;
    } catch {
      return false;
    }
  }, []);

  // The candidate presses Continue after a teacher let him back in.
  // If the browser refuses, he stays on this screen: an exam without
  // full screen has no guard rail, so the choice is to wait for the
  // invigilator rather than carry on in a window.
  const returnToExam = useCallback(async () => {
    const ok = await enterFullscreen();
    if (!ok) {
      // See returnMode above: after a freeze he waits for a teacher;
      // on a plain reopening he carries on without the full-screen
      // guard, which is what this machine gave us anyway.
      if (returnModeRef.current === "restart") {
        strikesRef.current = 0;
        setNeedsReturn(false);
        return true;
      }
      setReturnFailed(true);
      return false;
    }
    strikesRef.current = 0;
    setReturnFailed(false);
    setNeedsReturn(false);
    return true;
  }, [enterFullscreen]);

  // The page is closing the exam on purpose: stop reporting, and leave
  // full screen quietly.
  const stopWatching = useCallback(() => {
    stoppingRef.current = true;
    clearTimeout(blurTimerRef.current);
    setNeedsReturn(false);
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

  return { ...state, needsReturn, returnMode, returnFailed, sending, enterFullscreen, returnToExam, stopWatching, explain };
}

// A phone is not a place to sit a real exam: no fullscreen at all on
// iPhone, a keyboard over half the screen, and a notification every few
// minutes. Measured on the short side so a phone held sideways is still
// a phone, and a tablet in portrait is still a tablet.
export function isPhoneScreen() {
  if (typeof window === "undefined") return false;
  return Math.min(window.innerWidth, window.innerHeight) < 600;
}
