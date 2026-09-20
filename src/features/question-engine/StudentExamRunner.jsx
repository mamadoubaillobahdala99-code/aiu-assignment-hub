import React, { useState, useEffect, useCallback, useRef } from "react";
import { ArrowLeft, GripVertical, ChevronLeft, ChevronRight, Headphones } from "lucide-react";
import { supabase } from "../../supabaseClient";
import { QuestionRenderer } from "./QuestionRenderer";
import { SummaryCompletion } from "./SummaryCompletion";
import { NotesCompletion } from "./NotesCompletion";
import { TableCompletion } from "./TableCompletion";
import { SentenceCompletion } from "./SentenceCompletion";
import { FormCompletion, FlowchartCompletion, WordBankCompletion } from "./CompletionExtras";
import { MatchingGrid } from "./MatchingGrid";
import { AudioPlayer } from "./AudioPlayer";
import { parseCompletionPayload, numberQuestions, questionSlotCount } from "./bulkParse";
import { HighlightableText } from "./HighlightableText";
import { useExamTimer, ExamTimerDisplay } from "./ExamTimer";
import { GroupImage } from "./GroupImage";

// The countdown comes from useExamTimer: the start time is written once
// by the server (when the student presses Start) and the remaining time
// is computed from the server clock — a refresh, a reconnection or a
// changed computer clock never gives time back. The database also
// refuses answers once the time is over.
// Answers are kept in this browser while the exam is open (a refresh
// doesn't lose them) and are sent automatically when the time runs out.

const localKey = (userId, assignmentId) => `aiu-exam-answers:${userId}:${assignmentId}`;
function readLocalAnswers(userId, assignmentId) {
  try {
    const raw = window.localStorage.getItem(localKey(userId, assignmentId));
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}
function writeLocalAnswers(userId, assignmentId, answers) {
  try {
    window.localStorage.setItem(localKey(userId, assignmentId), JSON.stringify(answers));
  } catch {
    /* storage unavailable: the exam still works, only refresh-recovery is lost */
  }
}
function clearLocalAnswers(userId, assignmentId) {
  try {
    window.localStorage.removeItem(localKey(userId, assignmentId));
  } catch {
    /* ignore */
  }
}

export function StudentExamRunner({ userId, classId, assignmentId, setScreen, showToast, onSubmitted }) {
  const [assignment, setAssignment] = useState(null);
  const [sections, setSections] = useState([]); // [{ id, title, passageText, groups: [...] }]
  const [activeIndex, setActiveIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [results, setResults] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [timeOver, setTimeOver] = useState(false);
  const [startError, setStartError] = useState("");
  const [starting, setStarting] = useState(false);
  const autoSubmittedRef = useRef(false);
  const timer = useExamTimer(assignmentId, true);
  const [submitting, setSubmitting] = useState(false);
  const [leftWidthPct, setLeftWidthPct] = useState(56);
  const bodyRef = useRef(null);
  const questionsPanelRef = useRef(null);
  const [visibleNum, setVisibleNum] = useState(null);
  const [started, setStarted] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [className, setClassName] = useState("");
  const [audioOpen, setAudioOpen] = useState(false);
  const [teacherName, setTeacherName] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const load = useCallback(async () => {
    const { data: a } = await supabase.from("assignments").select("*").eq("id", assignmentId).single();
    setAssignment(a || null);

    // Class name, for the exam sidebar. Fetched separately and
    // best-effort: if it fails, the sidebar simply omits it rather than
    // the whole assignment failing to open.
    if (a?.class_id) {
      const { data: cls } = await supabase.from("classes").select("name, teacher_id").eq("id", a.class_id).single();
      if (cls?.name) setClassName(cls.name);
      if (cls?.teacher_id) {
        const { data: t } = await supabase.from("profiles").select("name").eq("id", cls.teacher_id).single();
        if (t?.name) setTeacherName(t.name);
      }
    }

    const { data: sectionRows } = await supabase
      .from("exam_sections")
      .select("id, title, passage_title, passage_text, audio_url, max_plays, order_index")
      .eq("assignment_id", assignmentId)
      .order("order_index");

    const built = [];
    let globalCounter = 0; // continues across every Part — never resets
    for (const s of sectionRows || []) {
      const { data: groupRows } = await supabase
        .from("question_groups")
        .select("id, instruction, passage_text, image_url, order_index")
        .eq("section_id", s.id)
        .order("order_index");

      const groups = [];
      for (const g of groupRows || []) {
        const { data: links } = await supabase
          .from("assignment_questions")
          .select("order_index, questions(*)")
          .eq("group_id", g.id)
          .order("order_index");
        const questions = (links || []).map((l) => l.questions);
        const { start: startNumber, end: endNumber, numbers: questionNumbers, nextStart } = numberQuestions(questions, globalCounter + 1);
        globalCounter = nextStart - 1;
        groups.push({ id: g.id, instruction: g.instruction, passageText: g.passage_text, imageUrl: g.image_url, questions, startNumber, endNumber, questionNumbers });
      }
      built.push({ id: s.id, title: s.title, passageTitle: s.passage_title, passageText: s.passage_text, audioUrl: s.audio_url, maxPlays: s.max_plays, groups });
    }
    setSections(built);

    const allQuestionIds = built.flatMap((s) => s.groups.flatMap((g) => g.questions.map((q) => q.id)));
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
        const local = readLocalAnswers(userId, assignmentId);
        if (local) setAnswers(local);
      }
    }
    setLoaded(true);
  }, [assignmentId, userId]);

  useEffect(() => { load(); }, [load]);

  // Keep the answers in this browser while the exam is open.
  useEffect(() => {
    if (!loaded || !started || results !== null || timeOver) return;
    writeLocalAnswers(userId, assignmentId, answers);
  }, [answers, loaded, started, results, timeOver, userId, assignmentId]);

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

  async function startExam() {
    setStartError("");
    setStarting(true);
    const ok = await timer.start();
    setStarting(false);
    if (ok) setStarted(true);
    else setStartError("The exam could not be started. Check your connection and try again.");
  }

  // Highlights the question the student is currently reading, in the
  // bottom nav bar — recomputed whenever the active Part changes.
  useEffect(() => {
    const panel = questionsPanelRef.current;
    if (!panel) return;
    // The element that actually scrolls: in Reading it's the questions
    // panel itself; in Listening the whole page (bodyRef) scrolls and the
    // panel just grows with its content, so observing the panel there
    // would always report the first question as "visible".
    const scrollRoot = assignment?.type === "Listening" ? bodyRef.current : panel;
    const targets = panel.querySelectorAll('[id^="question-"]');
    if (targets.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length === 0) return;
        const topMost = visible.reduce((a, b) => (a.boundingClientRect.top < b.boundingClientRect.top ? a : b));
        const num = parseInt(topMost.target.id.replace("question-", ""), 10);
        if (!isNaN(num)) setVisibleNum(num);
      },
      { root: scrollRoot, threshold: 0.4 }
    );
    targets.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [activeIndex, sections, assignment, started]);

  const allQuestions = sections.flatMap((s) => s.groups.flatMap((g) => g.questions));
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
    // Wait for that Part to render before scrolling to it.
    setTimeout(() => document.getElementById(`question-${num}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 60);
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
    const { error } = await supabase.rpc("submit_student_answers", {
      p_assignment_id: assignmentId,
      p_answers: payload,
    });
    setSubmitting(false);

    if (error) {
      const msg = error.message || "";
      if (/Time is over|Exam not started/i.test(msg)) {
        clearLocalAnswers(userId, assignmentId);
        setTimeOver(true);
        return;
      }
      if (/Already submitted/i.test(msg)) {
        // Already sent earlier (e.g. from another tab): show the result screen.
        clearLocalAnswers(userId, assignmentId);
        if (onSubmitted) onSubmitted();
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
  function startResize(e) {
    e.preventDefault();
    document.body.classList.add("qe-resizing");
    function onMove(ev) {
      if (!bodyRef.current) return;
      const rect = bodyRef.current.getBoundingClientRect();
      let pct = ((ev.clientX - rect.left) / rect.width) * 100;
      pct = Math.min(75, Math.max(30, pct));
      setLeftWidthPct(pct);
    }
    function onUp() {
      document.body.classList.remove("qe-resizing");
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  if (timeOver) {
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

  if (!assignment || sections.length === 0) {
    return (
      <div className="page">
        <button className="back-link" onClick={() => setScreen({ name: "home" })}><ArrowLeft size={14} /> All assignments</button>
        <p className="empty-inline">Loading…</p>
      </div>
    );
  }

  const activeSection = sections[activeIndex];
  const activePassageText = activeSection.passageText || assignment.description || "";
  const activeTitle = activeSection.passageTitle || assignment.title;

  const totalQuestionCount = sections.reduce((sum, s) => sum + s.groups.reduce((gs, g) => gs + g.questions.length, 0), 0);

  // Shown once, before the exam actually begins. The countdown is held
  // until the student presses Start (see the timer effect above), so
  // nobody loses time on a screen they haven't read yet.
  if (!started && results === null) {
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

  const perPartMinutes = assignment.time_limit_minutes ? Math.max(1, Math.round(assignment.time_limit_minutes / sections.length)) : null;
  const partQuestionNumbers = activeSection.groups.flatMap((g) => [g.startNumber, g.endNumber]);
  const partRangeStart = partQuestionNumbers.length ? Math.min(...partQuestionNumbers) : null;
  const partRangeEnd = partQuestionNumbers.length ? Math.max(...partQuestionNumbers) : null;

  const totalPointsPossible = allQuestions.reduce((sum, q) => sum + (q.points || 1), 0);
  const totalPointsEarned = results ? Object.values(results).reduce((sum, r) => sum + (r.earned || 0), 0) : 0;


  const isListening = assignment.type === "Listening";

  const questionsContent = (
    <>
      {results && (
        <div className="feedback-panel" style={{ marginBottom: 16 }}>
          <div className="feedback-band">{totalPointsEarned} / {totalPointsPossible} points</div>
        </div>
      )}

      {activeSection.groups.map((group) => (
        <div key={group.id} className="qe-group-block">
          <div className="qe-group-heading">
            {group.startNumber === group.endNumber ? `Question ${group.startNumber}` : `Questions ${group.startNumber}-${group.endNumber}`}
          </div>
          {group.instruction && <p className="qe-section-instruction">{group.instruction}</p>}
          {group.imageUrl && <GroupImage url={group.imageUrl} />}

          {group.passageText ? (
            (() => {
              const payload = parseCompletionPayload(group.passageText);
              const commonProps = {
                questions: group.questions,
                answers,
                onChange: (qid, val) => setAnswers((prev) => ({ ...prev, [qid]: val })),
                results,
                disabled: results !== null,
                startNumber: group.startNumber,
                assignmentId,
                userId,
              };
              if (payload.style === "notes") return <NotesCompletion blocks={payload.blocks || []} {...commonProps} />;
              if (payload.style === "table") return <TableCompletion headers={payload.headers || []} rows={payload.rows || []} {...commonProps} />;
              if (payload.style === "sentences") return <SentenceCompletion sentences={payload.sentences || []} {...commonProps} />;
              if (payload.style === "form") return <FormCompletion title={payload.title} rows={payload.rows || []} {...commonProps} />;
              if (payload.style === "flowchart") return <FlowchartCompletion title={payload.title} steps={payload.steps || []} {...commonProps} />;
              if (payload.style === "wordbank") return <WordBankCompletion text={payload.text} options={payload.options || []} {...commonProps} />;
              return <SummaryCompletion text={payload.text} {...commonProps} />;
            })()
          ) : group.questions[0]?.type?.startsWith("matching_") ? (
            <MatchingGrid
              questions={group.questions}
              answers={answers}
              onChange={(qid, val) => setAnswers((prev) => ({ ...prev, [qid]: val }))}
              results={results}
              disabled={results !== null}
              startNumber={group.startNumber}
              assignmentId={assignmentId}
              userId={userId}
            />
          ) : (
            group.questions.map((q, i) => (
              <div key={q.id} id={`question-${group.questionNumbers[i]}`} className="qe-numbered-question">
                <span className="rf-answer-num qe-question-badge">{group.questionNumbers[i]}</span>
                <div style={{ flex: 1 }}>
                  <QuestionRenderer
                    question={q}
                    value={answers[q.id] ?? null}
                    onChange={(val) => setAnswers((prev) => ({ ...prev, [q.id]: val }))}
                    disabled={results !== null}
                    assignmentId={assignmentId}
                    userId={userId}
                  />
                  {results && (
                    <div className={results[q.id]?.isCorrect ? "qe-result-correct" : "qe-result-incorrect"}>
                      {q.points > 1
                        ? `${results[q.id]?.earned ?? 0} / ${q.points} points`
                        : results[q.id]?.isCorrect ? "Correct" : "Incorrect"}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      ))}
    </>
  );

  return (
    <div className="wf-overlay qe-exam-shell">
      <div className="qe-exam-layout">
        <aside className={`qe-exam-sidebar ${sidebarOpen ? "" : "collapsed"}`}>
          <button
            className="qe-exam-sidebar-toggle"
            onClick={() => setSidebarOpen((v) => !v)}
            title={sidebarOpen ? "Hide panel" : "Show panel"}
          >
            {sidebarOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
          </button>

          {sidebarOpen && (
            <div className="qe-exam-sidebar-inner">
              {teacherName && <div className="qe-exam-teacher-band">{teacherName}</div>}
              <div className="qe-exam-sidebar-title">Assignment</div>

              {isListening && activeSection.audioUrl && (
                <button
                  className={`qe-exam-sidebar-item ${audioOpen ? "active" : ""}`}
                  onClick={() => setAudioOpen((v) => !v)}
                >
                  <Headphones size={15} /> Audio file
                </button>
              )}

              {className && (
                <div className="qe-exam-sidebar-section">
                  <div className="qe-exam-sidebar-label">Class</div>
                  <div className="qe-exam-sidebar-value">{className}</div>
                </div>
              )}

              {results === null && (
                <button className="btn-primary qe-exam-sidebar-submit" disabled={submitting} onClick={() => setConfirmOpen(true)}>
                  {submitting ? "Submitting…" : "Submit exam"}
                </button>
              )}

              <button className="qe-exam-sidebar-exit" onClick={() => setScreen({ name: "home" })}>
                <ArrowLeft size={14} /> Exit
              </button>
            </div>
          )}
        </aside>

        <div className="qe-exam-main">
          <div className="app-topbar qe-exam-topbar">
            Assignment
            {timer.status === "running" && results === null && <ExamTimerDisplay remainingSec={timer.remainingSec} />}
          </div>
          {isListening ? (
        <div className="qe-exam-body qe-listening-body" ref={bodyRef}>
          <div className="qe-listening-panel" ref={questionsPanelRef}>
            <p className="qe-part-tag">{activeSection.title}</p>
            {partRangeStart !== null && (
              <p className="qe-part-quicksummary">Listen and answer questions {partRangeStart}-{partRangeEnd}</p>
            )}
            {activeSection.audioUrl && audioOpen && (
              <AudioPlayer
                key={activeSection.id}
                url={activeSection.audioUrl}
                maxPlays={activeSection.maxPlays}
                assignmentId={assignmentId}
                userId={userId}
                sectionId={activeSection.id}
                onClose={() => setAudioOpen(false)}
              />
            )}
            {questionsContent}
          </div>
        </div>
      ) : (
        <div className="qe-exam-body" ref={bodyRef}>
          <div className="qe-passage-panel" style={{ flexBasis: `${leftWidthPct}%` }}>
            <div className="qe-passage-panel-inner">
              <p className="qe-part-tag">{activeSection.title}</p>
              {partRangeStart !== null && (
                <p className="qe-part-quicksummary">Read the text and answer questions {partRangeStart}-{partRangeEnd}</p>
              )}
              {perPartMinutes !== null && partRangeStart !== null && (
                <p className="qe-passage-meta">
                  You should spend about {perPartMinutes} minutes on Questions {partRangeStart}-{partRangeEnd}, which are based on Reading Passage {activeIndex + 1} below.
                </p>
              )}
              {activeTitle && <h2 className="qe-passage-title">{activeTitle}</h2>}
              <HighlightableText assignmentId={assignmentId} userId={userId} scopeType="passage" scopeId={activeSection.id} text={activePassageText} images />
            </div>
          </div>

          <div className="qe-resizer" onMouseDown={startResize}>
            <GripVertical size={14} />
          </div>

          <div className="qe-questions-panel" ref={questionsPanelRef} style={{ flexBasis: `${100 - leftWidthPct}%` }}>
            {questionsContent}
          </div>
        </div>
      )}

      <div className="qe-nav-bar">
        {sections.map((s, i) => {
          const total = s.groups.reduce((sum, g) => sum + g.questions.length, 0);
          if (i !== activeIndex) {
            return (
              <div key={s.id} className="qe-nav-part-segment inactive-part" onClick={() => setActiveIndex(i)}>
                <button className="qe-nav-part-pill">{s.title}: {total} question{total !== 1 ? "s" : ""}</button>
              </div>
            );
          }
          return (
            <div key={s.id} className="qe-nav-part-segment">
              <div className="qe-nav-active-part">
                <span className="qe-nav-part-label">{s.title}</span>
                <div className="qe-nav-numbers">
                  {s.groups.flatMap((group) => group.questionNumbers).map((num) => (
                    <button
                      key={num}
                      className={`qe-question-nav-item ${num === visibleNum ? "qe-nav-item-visible" : ""}`}
                      onClick={() => document.getElementById(`question-${num}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}
                    >
                      {num}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
          </div>
        </div>
      </div>

      {confirmOpen && (
        <div className="qe-confirm-backdrop" onClick={() => setConfirmOpen(false)}>
          <div className="qe-confirm-card" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h2 className="qe-confirm-title">Submit exam</h2>
            <p className="qe-confirm-text">Are you sure you want to finish and submit? You can't change your answers afterwards.</p>

            {unansweredSlots.length > 0 ? (
              <>
                <p className="qe-confirm-text" style={{ fontWeight: 600 }}>
                  {unansweredSlots.length} question{unansweredSlots.length > 1 ? "s have" : " has"} no answer yet:
                </p>
                <div className="qe-confirm-unanswered">
                  {unansweredSlots.map((u) => (
                    <button key={u.num} className="qe-confirm-chip" onClick={() => jumpToQuestion(u.num, u.partIndex)} title="Go to this question">
                      {u.num}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <p className="qe-confirm-text qe-confirm-allset">All questions have an answer.</p>
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
