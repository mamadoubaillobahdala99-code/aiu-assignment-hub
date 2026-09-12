import React, { useState, useEffect, useCallback } from "react";
import { ArrowLeft, Clock } from "lucide-react";
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

  if (!assignment || sections.length === 0) {
    return (
      <div className="page">
        <button className="back-link" onClick={() => setScreen({ name: "home" })}><ArrowLeft size={14} /> All assignments</button>
        <p className="empty-inline">Loading…</p>
      </div>
    );
  }

  const activeSection = sections[activeIndex];
  // Older assignments (created before Parts had their own stored text)
  // fall back to the assignment's single description field.
  const activePassageText = activeSection.passageText || assignment.description || "";

  const totalPointsPossible = allQuestions.reduce((sum, q) => sum + (q.points || 1), 0);
  const totalPointsEarned = results ? Object.values(results).reduce((sum, r) => sum + (r.earned || 0), 0) : 0;

  const mm = remainingSec !== null ? String(Math.floor(Math.max(0, remainingSec) / 60)).padStart(2, "0") : null;
  const ss = remainingSec !== null ? String(Math.max(0, remainingSec) % 60).padStart(2, "0") : null;

  return (
    <div className="wf-overlay">
      <div className="wf-topbar">
        <button className="back-link" onClick={() => setScreen({ name: "home" })}><ArrowLeft size={14} /> Exit</button>
        <div className="wf-title-group">
          <div className="asg-type">Reading</div>
          <div className="wf-title">{assignment.title}</div>
        </div>
        {mm !== null && results === null ? <div className="wf-timer"><Clock size={15} /> {mm}:{ss}</div> : <div />}
      </div>

      <div className="rf-body">
        <div className="rf-passage-panel">
          <ReadingPassage assignmentId={assignmentId} userId={userId} text={activePassageText} />
        </div>

        <div className="rf-answers-panel" style={{ flex: "0 0 45%", maxWidth: "none" }}>
          {sections.length > 1 && (
            <div className="tabs" style={{ marginBottom: 16 }}>
              {sections.map((s, i) => (
                <button key={s.id} className={`tab ${i === activeIndex ? "active" : ""}`} onClick={() => setActiveIndex(i)}>
                  {s.title}
                </button>
              ))}
            </div>
          )}

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
                />
              ) : (
                group.questions.map((q) => (
                  <div key={q.id} style={{ marginBottom: 20 }}>
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
    </div>
  );
}
