import React, { useState, useEffect, useCallback, useMemo } from "react";
import { ArrowLeft } from "lucide-react";
import { supabase } from "../../supabaseClient";
import { CenterSpinner } from "../../components/shared";
import { ScoreRing } from "./ScoreRing";
import { ReviewContent } from "./ReviewContent";
import { formatAnswerValue } from "./answerFormat";
import { numberQuestions } from "./bulkParse";
import { computeIeltsBand } from "./bandConversion";

export function TeacherQuestionEngineReview({ assignmentId, studentId, studentName, onBack, showToast }) {
  const [loading, setLoading] = useState(true);
  const [assignment, setAssignment] = useState(null);
  const [sections, setSections] = useState([]);
  const [answersByQ, setAnswersByQ] = useState({});
  const [resultsByQ, setResultsByQ] = useState({});
  const [correctByQ, setCorrectByQ] = useState({});
  const [feedbackRow, setFeedbackRow] = useState(null);
  const [bandDraft, setBandDraft] = useState("");
  const [feedbackDraft, setFeedbackDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: a } = await supabase
      .from("assignments")
      .select("id, title, type, auto_release_score, show_answer_review, reading_test_type")
      .eq("id", assignmentId)
      .single();
    setAssignment(a || null);

    const { data: sectionRows } = await supabase
      .from("exam_sections")
      .select("id, title, passage_title, passage_text, audio_url, max_plays, order_index")
      .eq("assignment_id", assignmentId)
      .order("order_index");

    const built = [];
    let globalCounter = 0;
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

    const allQuestions = built.flatMap((s) => s.groups.flatMap((g) => g.questions));
    const allQuestionIds = allQuestions.map((q) => q.id);

    if (allQuestionIds.length > 0) {
      const { data: sa } = await supabase
        .from("student_answers")
        .select("question_id, response, is_correct, points_earned")
        .eq("student_id", studentId)
        .in("question_id", allQuestionIds);

      const answers = {};
      const results = {};
      (sa || []).forEach((row) => {
        answers[row.question_id] = row.response;
        results[row.question_id] = { isCorrect: row.is_correct, earned: row.points_earned ?? (row.is_correct ? 1 : 0) };
      });
      setAnswersByQ(answers);
      setResultsByQ(results);

      const { data: keys } = await supabase.from("question_answer_key").select("question_id, correct_answer").in("question_id", allQuestionIds);
      const correct = {};
      (keys || []).forEach((k) => { correct[k.question_id] = k.correct_answer; });
      setCorrectByQ(correct);
    }

    const { data: fb } = await supabase
      .from("assignment_feedback")
      .select("*")
      .eq("assignment_id", assignmentId)
      .eq("student_id", studentId)
      .maybeSingle();
    setFeedbackRow(fb || null);
    setBandDraft(fb?.band || "");
    setFeedbackDraft(fb?.feedback || "");

    setLoading(false);
  }, [assignmentId, studentId]);

  useEffect(() => { load(); }, [load]);

  const allQuestions = useMemo(() => sections.flatMap((s) => s.groups.flatMap((g) => g.questions)), [sections]);
  const allQuestionNumbers = useMemo(() => numberQuestions(allQuestions, 1).numbers, [allQuestions]);
  const totalPoints = useMemo(() => allQuestions.reduce((sum, q) => sum + (q.points || 1), 0), [allQuestions]);
  const earnedPoints = useMemo(
    () => allQuestions.reduce((sum, q) => sum + (resultsByQ[q.id]?.earned ?? 0), 0),
    [allQuestions, resultsByQ]
  );
  const correctCount = allQuestions.filter((q) => resultsByQ[q.id]?.isCorrect).length;
  const incorrectCount = allQuestions.filter((q) => resultsByQ[q.id] && !resultsByQ[q.id].isCorrect).length;
  const skill = assignment?.type === "Listening" ? "listening" : "reading";
  const autoBand = computeIeltsBand(earnedPoints, totalPoints, skill, assignment?.reading_test_type);
  const displayBand = feedbackRow?.band || (autoBand != null ? autoBand : null);

  const correctAnswersFormatted = useMemo(() => {
    const map = {};
    for (const q of allQuestions) {
      if (correctByQ[q.id] !== undefined) map[q.id] = formatAnswerValue(q, correctByQ[q.id]);
    }
    return map;
  }, [allQuestions, correctByQ]);

  async function saveFeedback(release) {
    setSaving(true);
    const payload = {
      assignment_id: assignmentId,
      student_id: studentId,
      band: bandDraft.trim() || null,
      feedback: feedbackDraft.trim() || null,
    };
    if (release) payload.released_at = new Date().toISOString();

    const { data, error } = await supabase
      .from("assignment_feedback")
      .upsert(payload, { onConflict: "assignment_id,student_id" })
      .select()
      .single();

    setSaving(false);
    if (error) {
      showToast?.("Could not save: " + error.message);
      return;
    }
    setFeedbackRow(data);
    showToast?.(release ? "Score published to student" : "Feedback saved");
  }

  if (loading || !assignment) return <CenterSpinner />;

  const needsManualRelease = !assignment.auto_release_score && !feedbackRow?.released_at;

  return (
    <div className="qe-review-shell">
      <button className="back-link" onClick={onBack}><ArrowLeft size={14} /> Back to submissions</button>

      <div className="qe-review-header">
        <div>
          <div className="eyebrow">{assignment.type}</div>
          <h1 className="page-title" style={{ marginBottom: 2 }}>{studentName}</h1>
          <p className="field-hint" style={{ margin: 0 }}>{assignment.title}</p>
        </div>
        <ScoreRing score={earnedPoints} total={totalPoints} band={displayBand} />
      </div>

      <div className="qe-review-counts">
        <span className="qe-result-correct">{correctCount} correct</span>
        <span className="qe-result-incorrect">{incorrectCount} incorrect</span>
        {autoBand != null && <span className="field-hint">Auto-estimated band — approximate, scaled to a 40-question test.</span>}
      </div>

      <div className="qe-review-nav">
        {allQuestions.map((q, i) => (
          <a key={q.id} href={`#review-question-${allQuestionNumbers[i]}`} className={`qe-review-nav-pill ${resultsByQ[q.id]?.isCorrect ? "correct" : "incorrect"}`}>
            {allQuestionNumbers[i]}
          </a>
        ))}
      </div>

      <ReviewContent
        sections={sections}
        answersByQ={answersByQ}
        resultsByQ={resultsByQ}
        correctAnswersFormatted={correctAnswersFormatted}
        showCorrectAnswers
        assignmentId={assignmentId}
        viewerUserId={studentId}
      />

      <div className="qe-review-feedback-panel">
        <label className="field-label">Band (optional override)</label>
        <input className="field-input" style={{ maxWidth: 160 }} placeholder={autoBand != null ? String(autoBand) : "—"} value={bandDraft} onChange={(e) => setBandDraft(e.target.value)} />

        <label className="field-label" style={{ marginTop: 14 }}>Feedback (optional)</label>
        <textarea className="field-input textarea" style={{ minHeight: 120 }} placeholder="Comments for the student…" value={feedbackDraft} onChange={(e) => setFeedbackDraft(e.target.value)} />

        <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
          <button className="btn-ghost" disabled={saving} onClick={() => saveFeedback(false)}>
            {saving ? "Saving…" : "Save feedback"}
          </button>
          {needsManualRelease && (
            <button className="btn-primary" disabled={saving} onClick={() => saveFeedback(true)}>
              {saving ? "Publishing…" : "Publish score to student"}
            </button>
          )}
          {feedbackRow?.released_at && (
            <span className="field-hint" style={{ alignSelf: "center" }}>Released {new Date(feedbackRow.released_at).toLocaleString()}</span>
          )}
        </div>
      </div>
    </div>
  );
}
