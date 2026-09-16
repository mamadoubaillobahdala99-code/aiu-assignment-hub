import React, { useState, useEffect, useCallback, useRef } from "react";
import { ArrowLeft, Clock, GripVertical, ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "../../supabaseClient";
import { QuestionRenderer } from "./QuestionRenderer";
import { SummaryCompletion } from "./SummaryCompletion";
import { NotesCompletion } from "./NotesCompletion";
import { TableCompletion } from "./TableCompletion";
import { SentenceCompletion } from "./SentenceCompletion";
import { MatchingGrid } from "./MatchingGrid";
import { AudioPlayer } from "./AudioPlayer";
import { parseCompletionPayload, numberQuestions } from "./bulkParse";
import { HighlightableText } from "./HighlightableText";

// The countdown is backed by exam_attempts.started_at on the server, so
// a page refresh recomputes the remaining time instead of restarting
// it. If exam_attempts hasn't been migrated in yet, this falls back to
// the old client-only behavior rather than breaking the assignment.

export function StudentExamRunner({ userId, classId, assignmentId, setScreen, showToast }) {
  const [assignment, setAssignment] = useState(null);
  const [sections, setSections] = useState([]); // [{ id, title, passageText, groups: [...] }]
  const [activeIndex, setActiveIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [results, setResults] = useState(null);
  const [remainingSec, setRemainingSec] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [leftWidthPct, setLeftWidthPct] = useState(56);
  const bodyRef = useRef(null);
  const questionsPanelRef = useRef(null);
  const [visibleNum, setVisibleNum] = useState(null);
  const [started, setStarted] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [className, setClassName] = useState("");

  const load = useCallback(async () => {
    const { data: a } = await supabase.from("assignments").select("*").eq("id", assignmentId).single();
    setAssignment(a || null);

    // Class name, for the exam sidebar. Fetched separately and
    // best-effort: if it fails, the sidebar simply omits it rather than
    // the whole assignment failing to open.
    if (a?.class_id) {
      const { data: cls } = await supabase.from("classes").select("name").eq("id", a.class_id).single();
      if (cls?.name) setClassName(cls.name);
    }

    // Server-side timer: record (or fetch) the real start time so a
    // refresh can't reset the countdown. Falls back to the old
    // client-only behavior if exam_attempts hasn't been migrated in
    // yet, rather than breaking the whole assignment load.
    let startedAt = null;
    await supabase
      .from("exam_attempts")
      .upsert({ assignment_id: assignmentId, student_id: userId }, { onConflict: "assignment_id,student_id", ignoreDuplicates: true });
    const { data: attempt } = await supabase
      .from("exam_attempts")
      .select("started_at")
      .eq("assignment_id", assignmentId)
      .eq("student_id", userId)
      .maybeSingle();
    startedAt = attempt?.started_at || null;

    if (a?.time_limit_minutes) {
      if (startedAt) {
        const elapsedSec = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
        setRemainingSec(Math.max(0, a.time_limit_minutes * 60 - elapsedSec));
      } else {
        setRemainingSec(a.time_limit_minutes * 60);
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
        .select("id, instruction, passage_text, order_index")
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
        groups.push({ id: g.id, instruction: g.instruction, passageText: g.passage_text, questions, startNumber, endNumber, questionNumbers });
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
      }
    }
  }, [assignmentId, userId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!started || remainingSec === null || results !== null) return;
    if (remainingSec <= 0) {
      submitAll();
      return;
    }
    const t = setTimeout(() => setRemainingSec((s) => s - 1), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remainingSec, results]);

  // Highlights the question the student is currently reading, in the
  // bottom nav bar — recomputed whenever the active Part changes.
  useEffect(() => {
    const panel = questionsPanelRef.current;
    if (!panel) return;
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
      { root: panel, threshold: 0.4 }
    );
    targets.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [activeIndex, sections]);

  const allQuestions = sections.flatMap((s) => s.groups.flatMap((g) => g.questions));
  const allAnswered = allQuestions.length > 0 && allQuestions.every((q) => answers[q.id] !== undefined);

  async function submitAll() {
    if (submitting || results !== null) return;
    setSubmitting(true);
    for (const q of allQuestions) {
      const response = answers[q.id];
      if (response === undefined) continue;
      await supabase.rpc("submit_student_answer", {
        p_assignment_id: assignmentId,
        p_question_id: q.id,
        p_response: response,
      });
    }
    setSubmitting(false);
    showToast?.("Submitted");
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
            <button className="btn-primary qe-start-btn" onClick={() => setStarted(true)}>Start exam</button>
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

  const mm = remainingSec !== null ? String(Math.floor(Math.max(0, remainingSec) / 60)).padStart(2, "0") : null;
  const ss = remainingSec !== null ? String(Math.max(0, remainingSec) % 60).padStart(2, "0") : null;

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
              <div className="qe-exam-sidebar-title">{assignment.title}</div>
              {className && <div className="qe-exam-sidebar-class">{className}</div>}

              <div className="qe-exam-sidebar-section">
                <div className="qe-exam-sidebar-label">{assignment.type}</div>
                <div className="qe-exam-sidebar-value">
                  Part {activeIndex + 1} of {sections.length}
                  {partRangeStart !== null && ` · Questions ${partRangeStart}-${partRangeEnd}`}
                </div>
              </div>

              {mm !== null && results === null && (
                <div className="qe-exam-sidebar-section">
                  <div className="qe-exam-sidebar-label">Time remaining</div>
                  <div className="qe-exam-sidebar-timer"><Clock size={15} /> {mm}:{ss}</div>
                </div>
              )}

              {results === null && (
                <button className="btn-primary qe-exam-sidebar-submit" disabled={submitting} onClick={submitAll}>
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
          {isListening ? (
        <div className="qe-exam-body qe-listening-body" ref={bodyRef}>
          <div className="qe-listening-panel" ref={questionsPanelRef}>
            <p className="qe-part-tag">{activeSection.title}</p>
            {partRangeStart !== null && (
              <p className="qe-part-quicksummary">Listen and answer questions {partRangeStart}-{partRangeEnd}</p>
            )}
            {activeSection.audioUrl && (
              <AudioPlayer
                key={activeSection.id}
                url={activeSection.audioUrl}
                maxPlays={activeSection.maxPlays}
                assignmentId={assignmentId}
                userId={userId}
                sectionId={activeSection.id}
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
              <HighlightableText assignmentId={assignmentId} userId={userId} scopeType="passage" scopeId={activeSection.id} text={activePassageText} />
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
    </div>
  );
}
