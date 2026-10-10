import React, { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../../supabaseClient";
import { numberQuestions, questionSlotCount } from "./bulkParse";
import { useExamTimer } from "./ExamTimer";
import { useListeningAudio } from "./ListeningAudio";
import { useIsCompact, useVisualViewportHeight, useKeepFocusVisible } from "./useViewport";
import { useInvigilation } from "./useInvigilation";
import { ExamHandedIn } from "./InvigilationOverlay";
import { readLocalAnswers, writeLocalAnswers, clearLocalAnswers, readSync, writeSync, timeOf, canon, mergeCopies, onlyKnown } from "./examAnswerStore";
import { loadExamPaper } from "./examPaperLoad";
import { renderTimeOver, renderLoading, renderStartScreen, PaperUnavailable, PaperLoadError } from "./ExamRunnerScreens";
import { renderQuestions, renderExamPage } from "./ExamRunnerBody";

// Livraison 99 — still exported from here: AssignmentOpenBridge imports them.
export { PaperUnavailable, PaperLoadError };

// The countdown comes from useExamTimer: the start time is written once
// by the server (when the student presses Start) and the remaining time
// is computed from the server clock — a refresh, a reconnection or a
// changed computer clock never gives time back. The database also
// refuses answers once the time is over.
// Answers are kept in this browser while the exam is open (a refresh
// doesn't lose them) and are sent automatically when the time runs out.


export function StudentExamRunner({ userId, classId, assignmentId, setScreen, showToast, onSubmitted }) {
  const [assignment, setAssignment] = useState(null);
  const [sections, setSections] = useState([]); // [{ id, title, passageText, groups: [...] }]
  const [activeIndex, setActiveIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [results, setResults] = useState(null);
  const [loaded, setLoaded] = useState(false);
  // "loading" | "ok" | "refused" (the database says no) | "error" (could not load)
  const [loadState, setLoadState] = useState("loading");
  const [timeOver, setTimeOver] = useState(false);
  const [startError, setStartError] = useState("");
  const [starting, setStarting] = useState(false);
  const autoSubmittedRef = useRef(false);
  // Livraison 88: time is up but the answers could not be sent (no
  // connection): try again every 5 seconds while this page is open.
  const retryRef = useRef(null);
  // Livraison 88c: see syncKey above. draftSentRef = the copy last sent to
  // (or taken from) the server, so it is not sent back for nothing.
  const syncAtRef = useRef(null);
  const draftSentRef = useRef("");
  const allIdsRef = useRef([]);
  const retryToastRef = useRef(false);
  const timeUpRetryRef = useRef(false);   // the time is up and the answers are still to send
  const aliveRef = useRef(true);          // this page is still open
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      clearTimeout(retryRef.current);
    };
  }, []);
  const timer = useExamTimer(assignmentId, true);
  // One audio for the whole Listening test (listening_audio_url on the
  // assignment). Parts with their own audio file keep working as before.
  const singleAudioUrl = assignment?.type === "Listening" ? assignment?.listening_audio_url || "" : "";
  const listeningAudio = useListeningAudio(assignmentId, Boolean(singleAudioUrl));
  const audioTimeUpRef = useRef(false);
  const submitRef = useRef(null);
  const [submitting, setSubmitting] = useState(false);
  const [leftWidthPct, setLeftWidthPct] = useState(56);
  const bodyRef = useRef(null);
  const questionsPanelRef = useRef(null);
  const [visibleNum, setVisibleNum] = useState(null);
  const [started, setStarted] = useState(false);
  // Invigilation: awake only once the paper has really started and
  // while it is still being sat. The server decides whether this paper
  // is watched at all — a class assignment never is.
  const invig = useInvigilation(assignmentId, started && results === null && !timeOver);
  const invigWatchedRef = useRef(false);
  invigWatchedRef.current = invig.watched;
  const showToastRef = useRef(showToast);
  showToastRef.current = showToast;
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [className, setClassName] = useState("");
  const [audioOpen, setAudioOpen] = useState(false);
  const [teacherName, setTeacherName] = useState("");
  // Livraison 88: a paper of an EXAM (the exam's private class) — its
  // Listening recording starts with « Start exam ».
  const [inExam, setInExam] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  // Handed in by the SERVER (livraison 56): "closed" | "time" | "handed".
  const [handedIn, setHandedIn] = useState(null);

  // Phone / small tablet. Anything wider keeps the computer layout
  // exactly as it is — every rule below is inside this flag or inside a
  // (max-width: 900px) media query.
  const compact = useIsCompact();
  // Reading on a small screen: one column at a time, "Text" / "Questions".
  const [mobileTab, setMobileTab] = useState("text");
  // The on-screen keyboard shrinks the visible page; the exam screen
  // follows it instead of staying behind the keys.
  useVisualViewportHeight(compact);
  useKeepFocusVisible(bodyRef, compact);

  // The black panel becomes a drawer on a small screen: closed by
  // default there, open by default on a computer.
  useEffect(() => { setSidebarOpen(!compact); }, [compact]);

  const load = useCallback(async () => {
    // Never touches the answers kept in this browser: they are only
    // cleared by a submission (submitAll). Try again simply runs this again.
    setLoadState("loading");
    const paper = await loadExamPaper(assignmentId);
    if (paper.status !== "ok") {
      // "refused": the database says this student may not read the paper
      // (locked, exam closed, already submitted…). "error": it could not be
      // loaded. Either way the exam is NOT shown and nothing is started.
      setLoadState(paper.status);
      return;
    }
    const a = paper.assignment;
    setAssignment(a);

    const built = [];
    let globalCounter = 0; // continues across every Part — never resets
    for (const s of paper.sections) {
      const groups = [];
      for (const g of s.groups) {
        const questions = g.questions;
        const { start: startNumber, end: endNumber, numbers: questionNumbers, nextStart } = numberQuestions(questions, globalCounter + 1);
        globalCounter = nextStart - 1;
        groups.push({ id: g.id, instruction: g.instruction, passageText: g.passage_text, imageUrl: g.image_url, questions, startNumber, endNumber, questionNumbers });
      }
      built.push({ id: s.id, title: s.title, passageTitle: s.passage_title, passageText: s.passage_text, audioUrl: s.audio_url, maxPlays: s.max_plays, groups });
    }
    setSections(built);

    const allQuestionIds = built.flatMap((s) => s.groups.flatMap((g) => g.questions.map((q) => q.id)));

    // Class and teacher name, for the exam sidebar. Best-effort: if they
    // fail, the sidebar simply omits them. Fetched at the same time as the
    // student's saved answers instead of one after the other.
    const namesDone = (async () => {
      if (!a?.class_id) return;
      const { data: cls } = await supabase.from("classes").select("name, teacher_id, kind").eq("id", a.class_id).single();
      if (cls?.name) setClassName(cls.name);
      setInExam(cls?.kind === "exam");
      if (cls?.teacher_id) {
        const { data: t } = await supabase.from("profiles").select("name").eq("id", cls.teacher_id).single();
        if (t?.name) setTeacherName(t.name);
      }
    })().catch(() => {});

    if (allQuestionIds.length > 0) {
      const { data: existing } = await supabase
        .from("student_answers")
        .select("question_id, response, is_correct, points_earned")
        .eq("student_id", userId)
        .in("question_id", allQuestionIds);
      if (existing && existing.length > 0) {
        const restoredAnswers = {};
        const restoredResults = {};
        let anyGraded = false;
        existing.forEach((row) => {
          restoredAnswers[row.question_id] = row.response;
          if (row.is_correct !== null) {
            restoredResults[row.question_id] = { isCorrect: row.is_correct, earned: row.points_earned ?? (row.is_correct ? 1 : 0) };
            anyGraded = true;
          }
        });
        setAnswers(restoredAnswers);
        if (anyGraded) setResults(restoredResults);
      } else {
        // Not submitted yet: bring back the answers kept in this browser.
        // Livraison 88b: an EMPTY copy here counts as nothing (an older page
        // can leave one behind).
        const local = readLocalAnswers(userId, assignmentId);
        const hasLocal = Boolean(local && Object.keys(local).length > 0);
        // Livraison 88c: the most recent copy wins. The server's backup (the
        // student's own, only while the paper is not handed in) is newer
        // than this browser's when another device saved after this one:
        // then it is taken, plus what was changed here and not yet sent.
        const known = readSync(userId, assignmentId);
        const { data: state, error: stateError } = await supabase.rpc("my_answer_draft_state", { p_assignment_id: assignmentId, p_since: null });
        if (!stateError) {
          const fromServer = onlyKnown(state?.answers, allQuestionIds);
          const serverAt = timeOf(state?.at);
          const serverNewer = serverAt !== null && (timeOf(known?.at) === null || serverAt > timeOf(known?.at));
          if (Object.keys(fromServer).length > 0 && (!hasLocal || serverNewer)) {
            const merged = hasLocal ? mergeCopies(fromServer, local, known?.sent || {}) : fromServer;
            setAnswers(merged);
            draftSentRef.current = canon(fromServer);
            syncAtRef.current = state.at;
            writeSync(userId, assignmentId, state.at, fromServer);
            if (hasLocal && canon(merged) !== canon(local)) {
              showToastRef.current?.("Your answers were changed on another device");
            }
          } else if (hasLocal) {
            setAnswers(local);
            syncAtRef.current = known?.at || null;
            draftSentRef.current = known ? canon(known.sent) : "";
          }
        } else if (hasLocal) {
          setAnswers(local);
        } else {
          // Livraison 88 (if the newer reader is not there): the backup copy.
          const { data: backup, error: backupError } = await supabase.rpc("my_answer_drafts", { p_assignment_id: assignmentId });
          if (!backupError) {
            const restored = onlyKnown(backup, allQuestionIds);
            if (Object.keys(restored).length > 0) setAnswers(restored);
          }
        }
      }
    }
    await namesDone;
    setLoadState("ok");
    setLoaded(true);
  }, [assignmentId, userId]);

  useEffect(() => { load(); }, [load]);

  // Keep the answers in this browser while the exam is open.
  useEffect(() => {
    if (!loaded || !started || results !== null || timeOver) return;
    writeLocalAnswers(userId, assignmentId, answers);
  }, [answers, loaded, started, results, timeOver, userId, assignmentId]);

  // ---------- the answers also kept on the server (livraison 56) ----------
  // The answers are sent to the server every 5 seconds when they changed
  // (livraison 88: class papers too — before, only in a watched exam). They stay unreadable there — even for the student —
  // and serve one purpose: when the teacher closes the exam (or the time
  // runs out while this page is offline), the SERVER hands the paper in
  // with them. The browser copy above stays, for a refresh.
  const draftBusyRef = useRef(false);
  const answersRef = useRef(answers);
  answersRef.current = answers;
  useEffect(() => {
    if (!loaded || !started || results !== null || timeOver || handedIn) return;
    const send = async () => {
      if (draftBusyRef.current || submitting) return;
      const current = answersRef.current || {};
      const now = canon(current);
      // Livraison 88b: a page with no answer yet never sends an empty copy —
      // it would wipe the backup another computer made.
      const changed = now !== draftSentRef.current && !(draftSentRef.current === "" && Object.keys(current).length === 0);
      // Livraison 88c: on a class paper, ask first whether ANOTHER device
      // (the same paper open on a tablet and a computer) saved since this
      // page last did: its answers are then taken, plus what was changed
      // here. Not in a watched exam (a second device is frozen there
      // anyway); when nothing changed here, only while the page is on screen.
      const watched = invigWatchedRef.current;
      if (!changed && (watched || document.visibilityState !== "visible")) return;
      draftBusyRef.current = true;
      try {
        let toSend = current;
        if (!watched) {
          const since = syncAtRef.current;
          const { data: st, error: stError } = await supabase.rpc("my_answer_draft_state", { p_assignment_id: assignmentId, p_since: since });
          const newer = !stError && st?.at && st.answers && (!since || timeOf(st.at) > timeOf(since));
          if (newer) {
            if (canon(answersRef.current || {}) !== now) return;   // the student is answering: next time
            const fromServer = onlyKnown(st.answers, allIdsRef.current);
            const base = draftSentRef.current ? JSON.parse(draftSentRef.current) : {};   // canon() is valid JSON
            const merged = changed ? mergeCopies(fromServer, current, base) : fromServer;
            syncAtRef.current = st.at;
            writeSync(userId, assignmentId, st.at, fromServer);
            draftSentRef.current = canon(fromServer);
            if (canon(merged) !== now) {
              setAnswers(merged);
              showToastRef.current?.("Your answers were changed on another device");
            }
            if (canon(merged) === draftSentRef.current) return;     // nothing of this page's to add
            toSend = merged;
          } else if (!changed) {
            return;
          }
        }
        const json = canon(toSend);
        const { data, error } = await supabase.rpc("save_answer_drafts", { p_assignment_id: assignmentId, p_answers: toSend });
        if (!error && data?.saved) {
          draftSentRef.current = json;
          if (data.at) {
            syncAtRef.current = data.at;
            writeSync(userId, assignmentId, data.at, toSend);
          }
        }
      } finally {
        draftBusyRef.current = false;
      }
    };
    const id = setInterval(send, 5000);
    return () => clearInterval(id);
  }, [loaded, started, results, timeOver, handedIn, assignmentId, submitting, userId]);

  // Livraison 88: handed in (here or by the server) — no more retries.
  useEffect(() => {
    if (handedIn || results !== null || timeOver) clearTimeout(retryRef.current);
  }, [handedIn, results, timeOver]);

  // The server says this paper is handed in (it collected it), or the exam
  // is over: pens down. Never in the middle of the student's own submit —
  // that one ends by itself.
  useEffect(() => {
    if (handedIn || submitting || !started || results !== null || timeOver || !invig.watched) return;
    if (!(invig.closed === true || invig.released === true || invig.submitted === true)) return;
    invig.stopWatching();
    clearLocalAnswers(userId, assignmentId);
    setHandedIn(invig.closed || invig.released ? "closed" : timer.status === "expired" ? "time" : "handed");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invig.closed, invig.released, invig.submitted, invig.watched, handedIn, submitting, started, results, timeOver]);

  // Already started earlier (refresh, other device): go straight back to
  // the exam — the start screen would wrongly suggest the time hasn't begun.
  useEffect(() => {
    if (loaded && timer.hasStarted && timer.status !== "expired" && results === null && !started) setStarted(true);
  }, [loaded, timer.hasStarted, timer.status, results, started]);

  // Time is up (now, or while the student was away): send what we have.
  useEffect(() => {
    if (!loaded || timer.status !== "expired" || results !== null || timeOver || autoSubmittedRef.current) return;
    autoSubmittedRef.current = true;
    submitAll(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, timer.status, results, timeOver]);

  // The recording finished and the checking time is over: send the answers.
  // submitRef always points at the current submitAll, so the answers typed
  // after this callback was created are the ones sent.
  const onAudioTimeUp = useCallback(() => {
    if (audioTimeUpRef.current) return;
    audioTimeUpRef.current = true;
    submitRef.current?.(true);
  }, []);

  async function startExam() {
    setStartError("");
    setStarting(true);
    const ok = await timer.start();
    setStarting(false);
    if (ok) {
      setStarted(true);
      // Must happen inside the click: browsers refuse a fullscreen
      // asked for at any other moment.
      invig.enterFullscreen();
    }
    else setStartError("The exam could not be started. Check your connection and try again.");
  }

  // Highlights the question the student is on, in the bottom nav bar
  // (livraison 65). Three rules, strongest first:
  //   1. a number clicked in the bar, or an answer clicked / typed in:
  //      that question — kept while the page scrolls there by itself,
  //      until the student scrolls on their own (wheel, finger, keys,
  //      scroll bar). At the very bottom of the page, where nothing can
  //      scroll any more, the clicked number still lights up;
  //   2. otherwise, while reading: the last question whose top has passed
  //      a "reading line" a third of the way down the visible area — out
  //      of ALL the questions on screen, not only those that just moved.
  //      Over the last screen of scrolling the line slides to the bottom,
  //      so the last questions light up in turn;
  //   3. scrolled right to the top: the first question on screen.
  // Nothing here touches the answers: it only chooses a number to light.
  const holdRef = useRef(false);
  function holdHighlight(num) {
    holdRef.current = true;
    if (num != null && !isNaN(num)) setVisibleNum(num);
  }
  const navBarRef = useRef(null);
  useEffect(() => {
    const panel = questionsPanelRef.current;
    const body = bodyRef.current;
    if (!panel || !body) return;

    const numOf = (el) => {
      const m = /^question-(\d+)$/.exec(el?.id || "");
      return m ? parseInt(m[1], 10) : null;
    };
    const questionOf = (node) => {
      for (let el = node; el && el !== panel; el = el.parentElement) {
        if (numOf(el) !== null) return el;
      }
      return null;
    };

    let frame = 0;
    const recompute = () => {
      frame = 0;
      if (holdRef.current) return;
      const targets = [...panel.querySelectorAll('[id^="question-"]')].filter((el) => numOf(el) !== null);
      if (targets.length === 0) return;
      // The visible area: what the page, the scrolling panel and the
      // window all show, above the nav bar.
      const b = body.getBoundingClientRect();
      const p = panel.getBoundingClientRect();
      const navTop = navBarRef.current ? navBarRef.current.getBoundingClientRect().top : window.innerHeight;
      const top = Math.max(b.top, p.top, 0);
      const bottom = Math.min(b.bottom, p.bottom, window.innerHeight, navTop);
      if (bottom - top < 20) return;              // questions hidden (phone "Text" tab)
      const onScreen = targets
        .map((el) => ({ el, r: el.getBoundingClientRect() }))
        .filter(({ r }) => r.height > 0 && r.bottom > top + 1 && r.top < bottom - 1);
      if (onScreen.length === 0) return;
      const atTop = body.scrollTop <= 2 && panel.scrollTop <= 2 && (window.scrollY || 0) <= 2;
      let chosen = onScreen[0];
      if (!atTop) {
        // Near the end of the page the last questions can never climb up to
        // the line, so over the last screen of scrolling the line slides
        // down to the bottom edge: they light up one after the other.
        const height = bottom - top;
        const scroller = [panel, body].find((el) => el.scrollHeight > el.clientHeight + 2);
        const left = scroller ? scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop : height;
        const slide = Math.max(0, Math.min(1, 1 - left / ((2 * height) / 3)));
        const line = top + height / 3 + slide * ((2 * height) / 3 - 2);
        const passed = onScreen.filter(({ r }) => r.top <= line);
        if (passed.length) chosen = passed[passed.length - 1];
      }
      const num = numOf(chosen.el);
      if (num !== null) setVisibleNum(num);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(recompute); };
    // Only the questions moving counts — not the Reading passage scrolling
    // beside them.
    const moves = (t) => t === document || t === body || t === panel || panel.contains(t)
      || (assignment?.type === "Listening" && body.contains(t));
    const onScroll = (e) => { if (moves(e.target)) schedule(); };

    // The student moves the questions themselves: rule 1 no longer holds.
    const release = (e) => { if (!e || moves(e.target)) holdRef.current = false; };
    const onKey = (e) => {
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || "") || e.target?.isContentEditable) return;
      if (["PageDown", "PageUp", "Home", "End", "ArrowDown", "ArrowUp", " "].includes(e.key)) release();
    };
    // A click or focus inside a question: that question (rule 1). A press
    // on the panel or page itself is the scroll bar being grabbed.
    const onPointer = (e) => {
      const q = questionOf(e.target);
      if (q) holdHighlight(numOf(q));
      else if (e.target === panel || e.target === body) release(e);
    };
    const onFocus = (e) => {
      const q = questionOf(e.target);
      if (q) holdHighlight(numOf(q));
    };

    document.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", schedule);
    body.addEventListener("wheel", release, { passive: true });
    body.addEventListener("touchmove", release, { passive: true });
    body.addEventListener("pointerdown", onPointer, true);
    panel.addEventListener("focusin", onFocus);
    window.addEventListener("keydown", onKey, true);
    schedule();
    return () => {
      if (frame) cancelAnimationFrame(frame);
      document.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", schedule);
      body.removeEventListener("wheel", release);
      body.removeEventListener("touchmove", release);
      body.removeEventListener("pointerdown", onPointer, true);
      panel.removeEventListener("focusin", onFocus);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [activeIndex, sections, assignment, started, mobileTab, compact]);

  const allQuestions = sections.flatMap((s) => s.groups.flatMap((g) => g.questions));
  allIdsRef.current = allQuestions.map((q) => q.id);

  // A "choose TWO letters" question holds two answer-sheet numbers (21 and
  // 22): both appear in the bottom bar, and both lead to the question,
  // whose element carries the first number only (livraison 53).
  const slotOwner = {};
  const slotsOf = (g, q, i) => {
    const first = g.questionNumbers[i];
    return Array.from({ length: questionSlotCount(q) }, (_, k) => first + k);
  };
  sections.forEach((s) => s.groups.forEach((g) => g.questions.forEach((q, i) => {
    slotsOf(g, q, i).forEach((n) => { slotOwner[n] = g.questionNumbers[i]; });
  })));
  const questionLabel = (first, q) => {
    const n = questionSlotCount(q);
    return n > 1 ? `${first}–${first + n - 1}` : String(first);
  };
  const allAnswered = allQuestions.length > 0 && allQuestions.every((q) => answers[q.id] !== undefined);

  // Every answer-sheet number still empty, with the Part it lives in —
  // for the submit confirmation. A "choose N letters" question counts
  // each slot separately, so picking 1 of 2 leaves one number listed.
  function hasAnswer(v) {
    if (v === undefined || v === null) return false;
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === "string") return v.trim() !== "";
    return true;
  }
  const unansweredSlots = [];
  sections.forEach((s, si) => {
    s.groups.forEach((g) => {
      g.questions.forEach((q, qi) => {
        const first = g.questionNumbers[qi];
        const slots = questionSlotCount(q);
        const v = answers[q.id];
        const filled = q.type === "multiple_selection"
          ? Math.min(Array.isArray(v) ? v.length : 0, slots)
          : hasAnswer(v) ? slots : 0;
        for (let n = first + filled; n < first + slots; n++) unansweredSlots.push({ num: n, partIndex: si });
      });
    });
  });

  function jumpToQuestion(num, partIndex) {
    setConfirmOpen(false);
    setActiveIndex(partIndex);
    // On a small screen the questions live behind their own tab.
    if (compact) setMobileTab("questions");
    holdHighlight(slotOwner[num] ?? num);
    // Wait for that Part to render before scrolling to it.
    setTimeout(() => document.getElementById(`question-${slotOwner[num] ?? num}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 60);
  }

  // A number in the bottom bar: on a small screen it also brings the
  // questions column to the front.
  function goToNumber(num) {
    if (compact) setMobileTab("questions");
    holdHighlight(slotOwner[num] ?? num);
    setTimeout(() => document.getElementById(`question-${slotOwner[num] ?? num}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), compact ? 60 : 0);
  }

  // The time-up auto-submit calls submitAll directly (no dialog); only
  // the student's own click goes through this confirmation.
  async function submitAll(timeUp = false) {
    if (submitting || results !== null) return;
    setConfirmOpen(false);

    // Every answered question, sent in ONE call. The database checks the
    // student, the questions, the time, and refuses a second submission.
    const payload = {};
    for (const q of allQuestions) {
      if (answers[q.id] !== undefined) payload[q.id] = answers[q.id];
    }
    if (timeUp && Object.keys(payload).length === 0) {
      // Time ran out with no answer given: nothing to send.
      clearLocalAnswers(userId, assignmentId);
      setTimeOver(true);
      return;
    }

    setSubmitting(true);
    invig.stopWatching();   // we are leaving the paper on purpose
    const { error } = await supabase.rpc("submit_student_answers", {
      p_assignment_id: assignmentId,
      p_answers: payload,
    });
    setSubmitting(false);
    // Livraison 88: a retry that ends after the student left this page
    // must not bring him back here (the teacher's page hands it in later).
    if (timeUpRetryRef.current && !aliveRef.current) return;

    if (error) {
      const msg = error.message || "";
      if (/Time is over|This exam is over|This exam is closed/i.test(msg) && invig.watched) {
        // Too late for this page — but in an exam the server may have
        // handed the paper in from its own copy (livraison 56). Asking it
        // where this paper stands also makes it collect it now if due.
        const { data } = await supabase.rpc("exam_my_invigilation", { p_assignment_id: assignmentId });
        if (data?.submitted) {
          clearLocalAnswers(userId, assignmentId);
          setHandedIn(data.closed || data.released ? "closed" : "time");
          return;
        }
      }
      if (/Time is over/i.test(msg) && !invig.watched) {
        // Livraison 88: a class paper whose time (+ 5 min) is over. If its
        // backup copy reached the server, the server hands it in with it.
        const { data: collected, error: collectError } = await supabase.rpc("collect_class_papers", { p_assignment_id: assignmentId });
        if (!collectError && Number(collected) > 0) {
          clearLocalAnswers(userId, assignmentId);
          showToast?.("Time is up — your answers were handed in");
          if (onSubmitted) { onSubmitted(); return; }
          setScreen({ name: "assignment-student", classId, assignmentId });
          return;
        }
      }
      if (/Time is over|Exam not started/i.test(msg)) {
        clearLocalAnswers(userId, assignmentId);
        setTimeOver(true);
        return;
      }
      if (/Already submitted/i.test(msg) && invig.watched) {
        // Handed in by the server meanwhile (closed exam, time over).
        clearLocalAnswers(userId, assignmentId);
        setHandedIn(invig.closed || invig.released ? "closed" : timeUp ? "time" : "handed");
        return;
      }
      if (/Already submitted/i.test(msg)) {
        // Already sent earlier (e.g. from another tab): show the result screen.
        clearLocalAnswers(userId, assignmentId);
        if (onSubmitted) onSubmitted();
        return;
      }
      if (timeUp || timeUpRetryRef.current) {
        // Livraison 88: the time is up and nothing got through (no
        // connection). Keep trying every 5 seconds while the page is open:
        // the server accepts them up to 5 minutes after the end. (A press
        // on « Submit » meanwhile that fails too keeps the retries going.)
        timeUpRetryRef.current = true;
        if (!aliveRef.current) return;
        if (!retryToastRef.current) {
          retryToastRef.current = true;
          showToast?.("Time is up — no connection. Your answers will be handed in as soon as it comes back. Keep this page open.");
        }
        clearTimeout(retryRef.current);
        retryRef.current = setTimeout(() => {
          if (aliveRef.current) submitRef.current?.(true);
        }, 5000);
        return;
      }
      autoSubmittedRef.current = false;
      showToast?.("Your answers could not be submitted. Check your internet connection and try again.");
      return;
    }

    clearLocalAnswers(userId, assignmentId);
    showToast?.(timeUp ? "Time is up — your answers were submitted" : "Submitted");
    if (onSubmitted) {
      onSubmitted();
      return;
    }
    // Re-enter through the same bridge that routed us here — now that
    // answers exist, it will correctly switch to the dedicated results
    // screen (or the "waiting for feedback" screen) instead of this
    // exam-taking layout.
    setScreen({ name: "assignment-student", classId, assignmentId });
  }

  // Draggable divider between the passage and the questions — the
  // same kind of resize handle the older Reading Focus Mode had.
  // Pointer events, so a finger on a tablet drags it exactly like a
  // mouse on a computer (the old mousedown/mousemove pair never fired
  // on a touch screen).
  function startResize(e) {
    e.preventDefault();
    const pointerId = e.pointerId;
    const handle = e.currentTarget;
    document.body.classList.add("qe-resizing");
    // Keeps receiving the moves even when the finger leaves the bar.
    try { handle.setPointerCapture?.(pointerId); } catch { /* not supported */ }

    function onMove(ev) {
      if (!bodyRef.current) return;
      const rect = bodyRef.current.getBoundingClientRect();
      let pct = ((ev.clientX - rect.left) / rect.width) * 100;
      pct = Math.min(75, Math.max(30, pct));
      setLeftWidthPct(pct);
    }
    function onUp() {
      document.body.classList.remove("qe-resizing");
      try { handle.releasePointerCapture?.(pointerId); } catch { /* ignore */ }
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }

  if (handedIn) {
    return <ExamHandedIn reason={handedIn} onDone={() => (onSubmitted ? onSubmitted() : setScreen({ name: "home" }))} />;
  }

  if (timeOver) {
    return renderTimeOver({ setScreen });
  }

  submitRef.current = submitAll;

  if (loadState === "refused") {
    return <PaperUnavailable onBack={() => setScreen({ name: "home" })} />;
  }
  if (loadState === "error") {
    return <PaperLoadError onBack={() => setScreen({ name: "home" })} onRetry={load} />;
  }
  if (loadState !== "ok" || !assignment || sections.length === 0) {
    return renderLoading({ setScreen });
  }

  const activeSection = sections[activeIndex];
  const activePassageText = activeSection.passageText || assignment.description || "";
  const activeTitle = activeSection.passageTitle || assignment.title;

  const totalQuestionCount = sections.reduce((sum, s) => sum + s.groups.reduce((gs, g) => gs + g.questions.length, 0), 0);

  // Shown once, before the exam actually begins. The countdown is held
  // until the student presses Start (see the timer effect above), so
  // nobody loses time on a screen they haven't read yet.
  if (!started && results === null) {
    return renderStartScreen({ assignment, compact, sections, setScreen, startError, startExam, starting, timer, totalQuestionCount });
  }

  const perPartMinutes = assignment.time_limit_minutes ? Math.max(1, Math.round(assignment.time_limit_minutes / sections.length)) : null;
  const partQuestionNumbers = activeSection.groups.flatMap((g) => [g.startNumber, g.endNumber]);
  const partRangeStart = partQuestionNumbers.length ? Math.min(...partQuestionNumbers) : null;
  const partRangeEnd = partQuestionNumbers.length ? Math.max(...partQuestionNumbers) : null;

  const totalPointsPossible = allQuestions.reduce((sum, q) => sum + (q.points || 1), 0);
  const totalPointsEarned = results ? Object.values(results).reduce((sum, r) => sum + (r.earned || 0), 0) : 0;


  const isListening = assignment.type === "Listening";

  // Livraison 99 — the questions and the page are drawn in ExamRunnerBody.jsx.
  const questionsContent = renderQuestions({
    activeSection, answers, assignmentId, questionLabel, results, setAnswers, totalPointsEarned,
    totalPointsPossible, userId,
  });


  return renderExamPage({
    activeIndex, activePassageText, activeSection, activeTitle, assignment, assignmentId, audioOpen, bodyRef,
    className, compact, confirmOpen, goToNumber, holdRef, inExam, invig, isListening, jumpToQuestion,
    leftWidthPct, listeningAudio, mobileTab, navBarRef, onAudioTimeUp, partRangeEnd, partRangeStart,
    perPartMinutes, questionsContent, questionsPanelRef, results, sections, setActiveIndex, setAudioOpen,
    setConfirmOpen, setMobileTab, setScreen, setSidebarOpen, sidebarOpen, singleAudioUrl, slotOwner, slotsOf,
    started, startResize, submitAll, submitting, teacherName, timeOver, timer, unansweredSlots, userId,
    visibleNum,
  });
}

