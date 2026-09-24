
import React, { useState, useEffect, useCallback, useRef } from "react";
import { ArrowLeft, GripVertical, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, RotateCcw, Menu, X, MonitorSmartphone } from "lucide-react";
import { supabase } from "../../supabaseClient";
import { WritingEditor } from "./WritingEditor";
import { useExamTimer, ExamTimerDisplay } from "./ExamTimer";
import { useInvigilation } from "./useInvigilation";
import { InvigilationOverlay } from "./InvigilationOverlay";
import { ExamStripButtons, ExamFullscreenButton, ExamExitButton } from "./ExamSidebarButtons";
import { useIsCompact, useVisualViewportHeight } from "./useViewport";
import { StoredImg } from "../../lib/storageFiles";

// Structured Writing — student exam screen.
// Same shell as Reading/Listening (start screen, black sidebar, green
// "Assignment" bar, submit confirmation), with:
//   left  = the task question + optional image (zoomable)
//   right = the writing area (B / I / U / Undo / Redo), word count below
//   bottom Part 1 / Part 2 bar only when the assignment has two tasks.
// Text is autosaved through save_writing_draft (server checks enrolment,
// lock after submit and time limit); submit_writing sends everything.

const AUTOSAVE_DELAY_MS = 2500;
const RETRY_DELAY_MS = 10000;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3;
const ZOOM_STEP = 0.25;

export function StudentWritingRunner({ userId, assignmentId, setScreen, showToast, onSubmitted }) {
  const [assignment, setAssignment] = useState(null);
  const [sections, setSections] = useState(null); // [{ id, title, taskNumber, prompt, imageUrl }]
  const [drafts, setDrafts] = useState({}); // sectionId -> { html, words }
  const [activeIndex, setActiveIndex] = useState(0);
  const [started, setStarted] = useState(false);
  // Invigilation — see useInvigilation.js. Silent outside an exam.
  const [submittedNow, setSubmittedNow] = useState(false);
  const invig = useInvigilation(assignmentId, started && !submittedNow);
  const [startError, setStartError] = useState("");
  const [starting, setStarting] = useState(false);
  const autoSubmittedRef = useRef(false);
  // Secure countdown: start time written once by the server, remaining
  // time computed from the server clock (see ExamTimer.jsx).
  const timer = useExamTimer(assignmentId, true);
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [className, setClassName] = useState("");
  const [teacherName, setTeacherName] = useState("");
  const [leftWidthPct, setLeftWidthPct] = useState(48);
  const [zoomBySection, setZoomBySection] = useState({});
  const [saveState, setSaveState] = useState("idle"); // idle | saving | saved | error
  const [loadError, setLoadError] = useState("");
  const bodyRef = useRef(null);

  // Phone / small tablet: one column at a time and a drawer panel.
  // A wider screen keeps the computer layout unchanged.
  const compact = useIsCompact();
  const [mobileTab, setMobileTab] = useState("task");
  useVisualViewportHeight(compact);
  useEffect(() => { setSidebarOpen(!compact); }, [compact]);

  // Refs used by the async save queue so it always sees the latest text.
  const draftsRef = useRef({});
  const dirtyRef = useRef(new Set());
  const saveTimerRef = useRef(null);
  const saveChainRef = useRef(Promise.resolve(true));
  const submittedRef = useRef(false);
  const lastPasteWarnRef = useRef(0);
  const submitAllRef = useRef(null);

  const load = useCallback(async () => {
    const { data: a, error: aErr } = await supabase.from("assignments").select("*").eq("id", assignmentId).single();
    if (aErr || !a) {
      setLoadError("This assignment could not be loaded.");
      return;
    }
    setAssignment(a);

    if (a.class_id) {
      const { data: cls } = await supabase.from("classes").select("name, teacher_id").eq("id", a.class_id).single();
      if (cls?.name) setClassName(cls.name);
      if (cls?.teacher_id) {
        const { data: t } = await supabase.from("profiles").select("name").eq("id", cls.teacher_id).single();
        if (t?.name) setTeacherName(t.name);
      }
    }

    const { data: rows } = await supabase
      .from("exam_sections")
      .select("id, title, passage_text, image_url, task_number, order_index")
      .eq("assignment_id", assignmentId)
      .order("order_index");
    const built = (rows || [])
      .filter((s) => s.task_number)
      .map((s) => ({ id: s.id, title: s.title, taskNumber: s.task_number, prompt: s.passage_text || "", imageUrl: s.image_url || "" }));

    const { data: saved } = await supabase
      .from("writing_responses")
      .select("section_id, content_html, word_count, submitted_at")
      .eq("assignment_id", assignmentId)
      .eq("student_id", userId);
    if ((saved || []).some((r) => r.submitted_at)) {
      submittedRef.current = true;
      onSubmitted?.();
      return;
    }
    const restored = {};
    (saved || []).forEach((r) => { restored[r.section_id] = { html: r.content_html || "", words: r.word_count || 0 }; });
    draftsRef.current = restored;
    setDrafts(restored);
    setSections(built);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignmentId, userId]);

  useEffect(() => { load(); }, [load]);

  // ---------- Autosave ----------

  // Saves every task changed since the last save, one call after another
  // (never in parallel, so an older text can't overwrite a newer one).
  // Resolves true when everything is saved.
  const flushSaves = useCallback(() => {
    clearTimeout(saveTimerRef.current);
    saveChainRef.current = saveChainRef.current.then(async () => {
      const ids = [...dirtyRef.current];
      if (ids.length === 0) return true;
      setSaveState("saving");
      let ok = true;
      let locked = false;
      let timeUp = false;
      for (const id of ids) {
        const d = draftsRef.current[id] || { html: "", words: 0 };
        dirtyRef.current.delete(id);
        const { data, error } = await supabase.rpc("save_writing_draft", {
          p_section_id: id,
          p_content_html: d.html,
          p_word_count: d.words,
        });
        if (error) {
          dirtyRef.current.add(id);
          ok = false;
        } else if (data && data.saved === false) {
          // "submitted" or "time": the server has locked this text.
          ok = false;
          locked = true;
          if (data.reason === "time") timeUp = true;
        }
      }
      setSaveState(ok ? "saved" : locked ? "locked" : "error");
      if (timeUp && !submittedRef.current) setTimeout(() => submitAllRef.current?.(true), 0);
      if (!ok && dirtyRef.current.size > 0 && !submittedRef.current) {
        saveTimerRef.current = setTimeout(() => flushSaves(), RETRY_DELAY_MS);
      }
      return ok;
    });
    return saveChainRef.current;
  }, []);

  function onEditorChange(sectionId, html, words) {
    if (submittedRef.current) return;
    const next = { ...draftsRef.current, [sectionId]: { html, words } };
    draftsRef.current = next;
    setDrafts(next);
    dirtyRef.current.add(sectionId);
    setSaveState("idle");
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => flushSaves(), AUTOSAVE_DELAY_MS);
  }

  function onBlockedPaste() {
    const now = Date.now();
    if (now - lastPasteWarnRef.current > 4000) {
      lastPasteWarnRef.current = now;
      showToast?.("Pasting text is not allowed in this exam.");
    }
  }

  // Best-effort save if the tab is closed or refreshed mid-exam, plus a
  // browser warning while unsaved text exists.
  useEffect(() => {
    function onBeforeUnload(e) {
      if (dirtyRef.current.size > 0 && !submittedRef.current) {
        flushSaves();
        e.preventDefault();
        e.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      clearTimeout(saveTimerRef.current);
      if (dirtyRef.current.size > 0 && !submittedRef.current) flushSaves();
    };
  }, [flushSaves]);

  // ---------- Timer (secure, server clock — see ExamTimer.jsx) ----------

  async function startExam() {
    setStartError("");
    setStarting(true);
    const ok = await timer.start();
    setStarting(false);
    if (ok) {
      setStarted(true);
      // Inside the click, or the browser refuses.
      invig.enterFullscreen();
    } else setStartError("The exam could not be started. Check your connection and try again.");
  }

  // Already started earlier (refresh, other device): back to the exam directly.
  useEffect(() => {
    if (sections !== null && timer.hasStarted && timer.status !== "expired" && !started && !submittedRef.current) setStarted(true);
  }, [sections, timer.hasStarted, timer.status, started]);

  // Time is up — now, or while the student was away: the texts already
  // saved on the server are submitted automatically.
  useEffect(() => {
    if (sections === null || timer.status !== "expired" || submittedRef.current || autoSubmittedRef.current) return;
    autoSubmittedRef.current = true;
    submitAll(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sections, timer.status]);

  // ---------- Submit ----------

  async function submitAll(timeUp = false) {
    if (submitting || submittedRef.current) return;
    setConfirmOpen(false);
    setSubmitting(true);
    const savedOk = await flushSaves();
    if (!savedOk && !timeUp) {
      setSubmitting(false);
      showToast?.("Your latest text could not be saved. Check your internet connection and try again.");
      return;
    }
    setSubmittedNow(true);
    invig.stopWatching();   // leaving the paper on purpose
    const { error } = await supabase.rpc("submit_writing", { p_assignment_id: assignmentId });
    if (error) {
      setSubmitting(false);
      showToast?.("Could not submit: " + error.message);
      return;
    }
    submittedRef.current = true;
    clearTimeout(saveTimerRef.current);
    setSubmitting(false);
    showToast?.(timeUp ? "Time is up — your writing was submitted" : "Submitted");
    onSubmitted?.();
  }

  submitAllRef.current = submitAll;

  async function exitExam() {
    invig.stopWatching();
    await flushSaves();
    setScreen({ name: "home" });
  }

  function goToPart(i) {
    if (i === activeIndex) return;
    flushSaves();
    setActiveIndex(i);
  }

  // ---------- Layout helpers ----------

  // Pointer events, so a finger on a tablet drags the divider exactly
  // like a mouse on a computer.
  function startResize(e) {
    e.preventDefault();
    const pointerId = e.pointerId;
    const handle = e.currentTarget;
    document.body.classList.add("qe-resizing");
    try { handle.setPointerCapture?.(pointerId); } catch { /* not supported */ }
    function onMove(ev) {
      if (!bodyRef.current) return;
      const rect = bodyRef.current.getBoundingClientRect();
      let pct = ((ev.clientX - rect.left) / rect.width) * 100;
      pct = Math.min(75, Math.max(25, pct));
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

  function setZoom(sectionId, fn) {
    setZoomBySection((prev) => {
      const cur = prev[sectionId] ?? 1;
      const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(fn(cur) * 100) / 100));
      return { ...prev, [sectionId]: next };
    });
  }

  // ---------- Render ----------

  if (loadError) {
    return (
      <div className="page">
        <button className="back-link" onClick={() => setScreen({ name: "home" })}><ArrowLeft size={14} /> All assignments</button>
        <p className="empty-inline">{loadError}</p>
      </div>
    );
  }

  if (!assignment || sections === null) {
    return (
      <div className="page">
        <button className="back-link" onClick={() => setScreen({ name: "home" })}><ArrowLeft size={14} /> All assignments</button>
        <p className="empty-inline">Loading…</p>
      </div>
    );
  }

  if (sections.length === 0) {
    return (
      <div className="page">
        <button className="back-link" onClick={() => setScreen({ name: "home" })}><ArrowLeft size={14} /> All assignments</button>
        <p className="empty-inline">This assignment has no writing task yet.</p>
      </div>
    );
  }

  if (!started) {
    return (
      <div className="wf-overlay qe-exam-shell">
        <div className="qe-start-screen">
          <div className="qe-start-card">
            <div className="eyebrow">Writing</div>
            <h1 className="page-title" style={{ marginTop: 4 }}>{assignment.title}</h1>
            <p className="qe-start-meta">
              {sections.length === 2 ? "2 tasks" : `Writing Task ${sections[0].taskNumber}`}
              {assignment.time_limit_minutes ? ` · ${assignment.time_limit_minutes} minutes` : ""}
            </p>
            <p className="qe-start-note">
              Your text is saved automatically as you type. Pasting text is not allowed.
              {assignment.time_limit_minutes ? " Your timer starts when you press Start. When the time runs out, your writing is submitted automatically." : ""}
            </p>
            {compact && (
              <div className="qe-start-device-note">
                <MonitorSmartphone size={16} />
                <span>
                  You are on a small screen. You can write here, but a real exam is much easier
                  on a computer or a tablet — the task and your answer then sit side by side.
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

  const active = sections[Math.min(activeIndex, sections.length - 1)];
  const activeDraft = drafts[active.id] || { html: "", words: 0 };
  const zoom = zoomBySection[active.id] ?? 1;
  const emptyTasks = sections.map((s, i) => ({ s, i })).filter(({ s }) => !(drafts[s.id]?.words > 0));

  const saveLabel =
    saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : saveState === "error" ? "Not saved — retrying…" : saveState === "locked" ? "Time is over — saving is closed" : "";

  return (
    <div className={`wf-overlay qe-exam-shell ${compact ? "qe-compact" : ""}`}>
      <InvigilationOverlay invig={invig} />
      <div className="qe-exam-layout">
        {compact && sidebarOpen && <div className="qe-exam-drawer-backdrop" onClick={() => setSidebarOpen(false)} />}
        <aside className={`qe-exam-sidebar ${sidebarOpen ? "" : "collapsed"} ${compact ? "qe-exam-drawer" : ""}`}>
          {!compact && (
            <button className="qe-exam-sidebar-toggle" onClick={() => setSidebarOpen((v) => !v)} title={sidebarOpen ? "Hide panel" : "Show panel"}>
              {sidebarOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
            </button>
          )}

          {!compact && !sidebarOpen && (
            <ExamStripButtons
              showExit={!invig.watched}
              showSubmit
              submitting={submitting}
              onSubmit={() => setConfirmOpen(true)}
              onExit={exitExam}
            />
          )}

          {sidebarOpen && (
            <div className="qe-exam-sidebar-inner">
              {teacherName && <div className="qe-exam-teacher-band">{teacherName}</div>}
              {compact && (
                <button className="qe-exam-drawer-close" onClick={() => setSidebarOpen(false)} title="Close">
                  <X size={16} /> Close
                </button>
              )}
              <div className="qe-exam-sidebar-title">Assignment</div>
              {className && (
                <div className="qe-exam-sidebar-section">
                  <div className="qe-exam-sidebar-label">Class</div>
                  <div className="qe-exam-sidebar-value">{className}</div>
                </div>
              )}
              <ExamFullscreenButton invig={invig} />

              <button className="btn-primary qe-exam-sidebar-submit" disabled={submitting} onClick={() => setConfirmOpen(true)}>
                {submitting ? "Submitting…" : "Submit exam"}
              </button>
              <ExamExitButton invig={invig} onExit={exitExam} />
            </div>
          )}
        </aside>

        <div className="qe-exam-main">
          <div className="app-topbar qe-exam-topbar">
            {compact && (
              <button className="qe-exam-menu-btn" onClick={() => setSidebarOpen(true)} title="Menu" aria-label="Open the menu">
                <Menu size={18} />
              </button>
            )}
            Assignment
            {timer.status === "running" && <ExamTimerDisplay remainingSec={timer.remainingSec} />}
          </div>

          {/* On a small screen the task and the answer take turns
              instead of sharing one narrow row. */}
          {compact && (
            <div className="qe-tabbar" role="tablist">
              <button role="tab" aria-selected={mobileTab === "task"} className={`qe-tab ${mobileTab === "task" ? "active" : ""}`} onClick={() => setMobileTab("task")}>
                Task
              </button>
              <button role="tab" aria-selected={mobileTab === "answer"} className={`qe-tab ${mobileTab === "answer" ? "active" : ""}`} onClick={() => setMobileTab("answer")}>
                Your answer
              </button>
            </div>
          )}

          <div className="qe-exam-body" ref={bodyRef}>
            <div
              className={`qe-passage-panel qe-wr-prompt-panel ${compact && mobileTab !== "task" ? "qe-tab-hidden" : ""}`}
              style={compact ? undefined : { flexBasis: `${leftWidthPct}%` }}
            >
              <p className="qe-part-tag">{active.title}</p>
              <h2 className="qe-passage-title">Writing Task {active.taskNumber}</h2>
              {active.prompt && <div className="qe-wr-prompt">{active.prompt}</div>}
              {active.imageUrl && (
                <div className="qe-wr-image-block">
                  <div className="qe-wr-zoom-bar">
                    <button type="button" className="qe-wr-zoom-btn" title="Smaller" disabled={zoom <= ZOOM_MIN} onClick={() => setZoom(active.id, (z) => z - ZOOM_STEP)}>
                      <ZoomOut size={15} />
                    </button>
                    <span className="qe-wr-zoom-value">{Math.round(zoom * 100)}%</span>
                    <button type="button" className="qe-wr-zoom-btn" title="Bigger" disabled={zoom >= ZOOM_MAX} onClick={() => setZoom(active.id, (z) => z + ZOOM_STEP)}>
                      <ZoomIn size={15} />
                    </button>
                    {zoom !== 1 && (
                      <button type="button" className="qe-wr-zoom-btn" title="Reset size" onClick={() => setZoom(active.id, () => 1)}>
                        <RotateCcw size={14} />
                      </button>
                    )}
                  </div>
                  <div className="qe-wr-image-scroll">
                    <StoredImg src={active.imageUrl} alt={`Writing Task ${active.taskNumber}`} style={{ width: `${zoom * 100}%` }} draggable={false} />
                  </div>
                </div>
              )}
            </div>

            {!compact && (
              <div className="qe-resizer" onPointerDown={startResize}>
                <GripVertical size={14} />
              </div>
            )}

            <div
              className={`qe-wr-answer-panel ${compact && mobileTab !== "answer" ? "qe-tab-hidden" : ""}`}
              style={compact ? undefined : { flexBasis: `${100 - leftWidthPct}%` }}
            >
              <WritingEditor
                key={active.id}
                initialHtml={activeDraft.html}
                onChange={(html, words) => onEditorChange(active.id, html, words)}
                onBlockedPaste={onBlockedPaste}
                readOnly={submitting}
              />
              <div className="qe-wr-footer">
                <span className="qe-wr-wordcount">Words: {activeDraft.words}</span>
                <span className={`qe-wr-save qe-wr-save-${saveState}`}>{saveLabel}</span>
              </div>
            </div>
          </div>

          {sections.length > 1 && (
            <div className="qe-nav-bar">
              {sections.map((s, i) => (
                <div
                  key={s.id}
                  className={`qe-nav-part-segment ${i === activeIndex ? "qe-wr-nav-active" : "inactive-part"}`}
                  onClick={() => goToPart(i)}
                >
                  <button className="qe-nav-part-pill qe-wr-nav-pill">
                    <strong>{s.title}</strong> · Writing Task {s.taskNumber} · {drafts[s.id]?.words || 0} words
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {confirmOpen && (
        <div className="qe-confirm-backdrop" onClick={() => setConfirmOpen(false)}>
          <div className="qe-confirm-card" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h2 className="qe-confirm-title">Submit exam</h2>
            <p className="qe-confirm-text">Are you sure you want to finish and submit? You can't change your writing afterwards.</p>

            {emptyTasks.length > 0 ? (
              <>
                <p className="qe-confirm-text" style={{ fontWeight: 600 }}>
                  {emptyTasks.length === 1 ? "This task is still empty:" : "These tasks are still empty:"}
                </p>
                <div className="qe-confirm-unanswered">
                  {emptyTasks.map(({ s, i }) => (
                    <button
                      key={s.id}
                      className="qe-confirm-chip"
                      title="Go to this task"
                      onClick={() => { setConfirmOpen(false); goToPart(i); }}
                    >
                      Task {s.taskNumber}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <p className="qe-confirm-text qe-confirm-allset">
                {sections.map((s) => `Task ${s.taskNumber}: ${drafts[s.id]?.words || 0} words`).join(" · ")}
              </p>
            )}

            <div className="qe-confirm-actions">
              <button className="btn-ghost" onClick={() => setConfirmOpen(false)}>Keep working</button>
              <button className="btn-primary" disabled={submitting} onClick={() => submitAll(false)}>
                {submitting ? "Submitting…" : "Submit exam"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
