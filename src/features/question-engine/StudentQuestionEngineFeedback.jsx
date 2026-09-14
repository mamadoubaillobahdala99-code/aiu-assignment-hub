
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { ArrowLeft } from "lucide-react";
import { supabase } from "../../supabaseClient";
import { CenterSpinner } from "../../components/shared";
import { ScoreRing } from "./ScoreRing";
import { ReviewContent } from "./ReviewContent";
import { formatAnswerValue } from "./answerFormat";
import { computeIeltsBand } from "./bandConversion";

export function StudentQuestionEngineFeedback({ assignmentId, userId, setScreen }) {
  const [loading, setLoading] = useState(true);
  const [assignment, setAssignment] = useState(null);
  const [sections, setSections] = useState([]);
  const [answersByQ, setAnswersByQ] = useState({});
  const [resultsByQ, setResultsByQ] = useState({});
  const [correctByQ, setCorrectByQ] = useState({});
  const [feedbackRow, setFeedbackRow] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: a } = await supabase
      .from("assignments")
      .select("id, title, type, show_answer_review, reading_test_type")
      .eq("id", assignmentId)
      .single();
    setAssignment(a || null);

    const { data: sectionRows } = await supabase
      .from("exam_sections")
      .select("id, title, order_index")
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
        const startNumber = globalCounter + 1;
        globalCounter += questions.length;
        groups.push({ id: g.id, instruction: g.instruction, passageText: g.passage_text, questions, startNumber, endNumber: globalCounter });
      }
      built.push({ id: s.id, title: s.title, groups });
    }
    setSections(built);

    const allQuestions = built.flatMap((s) => s.groups.flatMap((g) => g.questions));
    const allQuestionIds = allQuestions.map((q) => q.id);

    if (allQuestionIds.length > 0) {
      const { data: sa } = await supabase
        .from("student_answers")
        .select("question_id, response, is_correct, points_earned")
        .eq("student_id", userId)
        .in("question_id", allQuestionIds);

      const answers = {};
      const results = {};
      (sa || []).forEach((row) => {
        answers[row.question_id] = row.response;
        results[row.question_id] = { isCorrect: row.is_correct, earned: row.points_earned ?? (row.is_correct ? 1 : 0) };
      });
      setAnswersByQ(answers);
      setResultsByQ(results);

      // RLS only returns rows here once the assignment allows answer
      // review AND the result is released — an empty result is the
      // normal, expected outcome when either isn't true yet.
      const { data: keys } = await supabase.from("question_answer_key").select("question_id, correct_answer").in("question_id", allQuestionIds);
      const correct = {};
      (keys || []).forEach((k) => { correct[k.question_id] = k.correct_answer; });
      setCorrectByQ(correct);
    }

    // RLS only returns this row once it's actually released.
    const { data: fb } = await supabase
      .from("assignment_feedback")
      .select("*")
      .eq("assignment_id", assignmentId)
      .eq("student_id", userId)
      .maybeSingle();
    setFeedbackRow(fb || null);

    setLoading(false);
  }, [assignmentId, userId]);

  useEffect(() => { load(); }, [load]);

  const allQuestions = useMemo(() => sections.flatMap((s) => s.groups.flatMap((g) => g.questions)), [sections]);
  const totalPoints = useMemo(() => allQuestions.reduce((sum, q) => sum + (q.points || 1), 0), [allQuestions]);
  const earnedPoints = useMemo(
    () => allQuestions.reduce((sum, q) => sum + (resultsByQ[q.id]?.earned ?? 0), 0),
    [allQuestions, resultsByQ]
  );
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

  if (loading || !assignment) return <CenterSpinner />;

  const canSeeAnswers = Boolean(assignment.show_answer_review);

  return (
    <div className="qe-feedback-shell">
      <button className="back-link" onClick={() => setScreen({ name: "home" })}><ArrowLeft size={14} /> Back to assignments</button>

      <div className="qe-feedback-top">
        <div className="eyebrow">{assignment.type}</div>
        <h1 className="page-title" style={{ margin: 0 }}>{assignment.title}</h1>
        <ScoreRing score={earnedPoints} total={totalPoints} band={displayBand} />
        {autoBand != null && !feedbackRow?.band && (
          <p className="field-hint" style={{ maxWidth: 360 }}>Estimated band, scaled to a 40-question test — an approximation, not an official score.</p>
        )}
      </div>

      {feedbackRow?.feedback && (
        <div className="qe-feedback-teacher-note">
          <div className="field-label">Feedback from your teacher</div>
          <p style={{ margin: "6px 0 0", whiteSpace: "pre-wrap" }}>{feedbackRow.feedback}</p>
        </div>
      )}

      {canSeeAnswers ? (
        <ReviewContent
          sections={sections}
          answersByQ={answersByQ}
          resultsByQ={resultsByQ}
          correctAnswersFormatted={correctAnswersFormatted}
          showCorrectAnswers
          assignmentId={assignmentId}
          viewerUserId={userId}
        />
      ) : (
        <div className="qe-feedback-locked">Your teacher has kept the answer breakdown private for this assignment — only your overall score is shown.</div>
      )}
    </div>
  );
}
