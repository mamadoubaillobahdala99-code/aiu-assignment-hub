import React, { useState, useEffect, useCallback, useRef } from "react";
import { ArrowLeft, Clock, GripVertical } from "lucide-react";
import { supabase } from "../../supabaseClient";
import { QuestionRenderer } from "./QuestionRenderer";
import { SummaryCompletion } from "./SummaryCompletion";
import { ReadingPassage } from "../assignment-hub/ReadingPassage";

// KNOWN LIMITATION, stated honestly: the countdown shown here is a
// visual guide only — unlike the older AssignmentStudent timer, it
// isn't yet backed by a stored "started_at" on the server, so a page
// refresh currently restarts it. Fine for this first working version;
// worth hardening later before relying on it for a strict real exam.

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

  const load = useCallback(async () => {
    const { data: a } = await supabase.from("assignments").select("*").eq("id", assignmentId).single();
    setAssignment(a || null);
    if (a?.time_limit_minutes) setRemainingSec(a.time_limit_minutes * 60);

    const { data: sectionRows } = await supabase
      .from("exam_sections")
      .select("id, title, passage_text, order_index")
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
        const startNumber = globalCounter + 1;
        globalCounter += questions.length;
        groups.push({ id: g.id, instruction: g.instruction, passageText: g.passage_text, questions, startNumber, endNumber: globalCounter });
      }
      built.push({ id: s.id, title: s.title, passageText: s.passage_text, groups });
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
    if (remainingSec === null || results !== null) return;
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
    const newResults = {};
    for (const q of allQuestions) {
      const response = answers[q.id];
      if (response === undefined) continue;
      const { data, error } = await supabase.rpc("submit_student_answer", {
        p_assignment_id: assignmentId,
        p_question_id: q.id,
        p_response: response,
      });
      if (!error && data) newResults[q.id] = { isCorrect: data.is_correct, earned: data.points_earned };
    }
    setSubmitting(false);
    setResults(newResults);
    showToast?.("Submitted");
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

  const totalPointsPossible = allQuestions.reduce((sum, q) => sum + (q.points || 1), 0);
  const totalPointsEarned = results ? Object.values(results).reduce((sum, r) => sum + (r.earned || 0), 0) : 0;

  const mm = remainingSec !== null ? String(Math.floor(Math.max(0, remainingSec) / 60)).padStart(2, "0") : null;
  const ss = remainingSec !== null ? String(Math.max(0, remainingSec) % 60).padStart(2, "0") : null;

  return (
    <div className="wf-overlay qe-exam-shell">
      <div className="wf-topbar">
        <button className="back-link" onClick={() => setScreen({ name: "home" })}><ArrowLeft size={14} /> Exit</button>
        <div className="wf-title-group">
          <div className="asg-type">Reading</div>
          <div className="wf-title">{assignment.title}</div>
        </div>
        {mm !== null && results === null ? <div className="wf-timer"><Clock size={15} /> {mm}:{ss}</div> : <div />}
      </div>

      <div className="qe-exam-body" ref={bodyRef}>
        <div className="qe-passage-panel" style={{ flexBasis: `${leftWidthPct}%` }}>
          <div className="qe-passage-panel-inner">
            <ReadingPassage assignmentId={assignmentId} userId={userId} sectionId={activeSection.id} text={activePassageText} />
          </div>
        </div>

        <div className="qe-resizer" onMouseDown={startResize}>
          <GripVertical size={14} />
        </div>

        <div className="qe-questions-panel" ref={questionsPanelRef} style={{ flexBasis: `${100 - leftWidthPct}%` }}>
          {results && (
            <div className="feedback-panel" style={{ marginBottom: 16 }}>
              <div className="feedback-band">{totalPointsEarned} / {totalPointsPossible} points</div>
            </div>
          )}

          {activeSection.groups.map((group) => (
            <div key={group.id} className="qe-group-block">
              <div className="qe-group-heading">
                {group.questions.length === 1 ? `Question ${group.startNumber}` : `Questions ${group.startNumber}-${group.endNumber}`}
              </div>
              {group.instruction && <p className="qe-section-instruction">{group.instruction}</p>}

              {group.passageText ? (
                <SummaryCompletion
                  text={group.passageText}
                  questions={group.questions}
                  answers={answers}
                  onChange={(qid, val) => setAnswers((prev) => ({ ...prev, [qid]: val }))}
                  results={results}
                  disabled={results !== null}
                  startNumber={group.startNumber}
                />
              ) : (
                group.questions.map((q, i) => (
                  <div key={q.id} id={`question-${group.startNumber + i}`} className="qe-numbered-question">
                    <span className="rf-answer-num qe-question-badge">{group.startNumber + i}</span>
                    <div style={{ flex: 1 }}>
                      <QuestionRenderer
                        question={q}
                        value={answers[q.id] ?? null}
                        onChange={(val) => setAnswers((prev) => ({ ...prev, [q.id]: val }))}
                        disabled={results !== null}
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

          {results === null && (
            <button className="btn-primary" style={{ width: "100%", justifyContent: "center" }} disabled={!allAnswered || submitting} onClick={submitAll}>
              {submitting ? "Submitting…" : "Submit assignment"}
            </button>
          )}
        </div>
      </div>

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
            <div key={s.id} className="qe-nav-part-segment" style={{ flex: 3 }}>
              <div className="qe-nav-active-part">
                <span className="qe-nav-part-label">{s.title}</span>
                {s.groups.flatMap((group) => Array.from({ length: group.questions.length }, (_, idx) => group.startNumber + idx)).map((num) => (
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
          );
        })}
      </div>
    </div>
  );
}
