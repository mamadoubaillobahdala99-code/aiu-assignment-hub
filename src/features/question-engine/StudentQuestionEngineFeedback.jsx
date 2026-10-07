import React, { useState, useEffect, useCallback, useMemo } from "react";
import { ArrowLeft, MessageSquare } from "lucide-react";
import { supabase } from "../../supabaseClient";
import { CenterSpinner } from "../../components/shared";
import { ScoreRing } from "./ScoreRing";
import { ReviewContent } from "./ReviewContent";
import { formatAnswerValue, formatCorrectShort } from "./answerFormat";
import { numberQuestions } from "./bulkParse";
import { loadPaperTree, toReviewSections } from "./paperTree";
import { computeIeltsBand } from "./bandConversion";
import { Breadcrumb } from "../../components/DropMenu";
import { buildSheet, sheetCounts, AnswerSheet, fmtWhen } from "./ResultParts";

// Livraison 74 — the student's result for a Reading / Listening paper:
// score + band, the teacher's comment, then the answer sheet ("My
// answers", with "My mistakes") or the whole paper ("Full paper").
// Everything shown is what the database lets the student read once the
// result is published; nothing is computed earlier than that.
// inExam: the paper belongs to an exam — "Back" returns to the exam.
export function StudentQuestionEngineFeedback({ assignmentId, userId, setScreen, inExam = false }) {
  const [loading, setLoading] = useState(true);
  const [assignment, setAssignment] = useState(null);
  const [sections, setSections] = useState([]);
  const [answersByQ, setAnswersByQ] = useState({});
  const [resultsByQ, setResultsByQ] = useState({});
  const [correctByQ, setCorrectByQ] = useState({});
  const [feedbackRow, setFeedbackRow] = useState(null);
  const [handedAt, setHandedAt] = useState(null);
  const [view, setView] = useState("sheet");

  // Livraison 81: everything at once — the whole paper with the correct
  // answers this student may read (get_paper, the student's own rights:
  // keys only once released AND allowed, exactly like the table), the
  // answers, the feedback and the hand-in time, in parallel. Before: one
  // request per part and per group, one after the other.
  const load = useCallback(async () => {
    setLoading(true);
    const [paper, { data: sa }, { data: fb }, { data: att }] = await Promise.all([
      loadPaperTree(assignmentId, { withKeys: true }),
      supabase
        .from("student_answers")
        .select("question_id, response, is_correct, points_earned")
        .eq("assignment_id", assignmentId)
        .eq("student_id", userId),
      // RLS only returns this row once it's actually released.
      supabase
        .from("assignment_feedback")
        .select("*")
        .eq("assignment_id", assignmentId)
        .eq("student_id", userId)
        .maybeSingle(),
      // When it was handed in (the student's own copy row).
      supabase
        .from("exam_attempts")
        .select("submitted_at")
        .eq("assignment_id", assignmentId)
        .eq("student_id", userId)
        .maybeSingle(),
    ]);
    const ok = paper.status === "ok";
    setAssignment(ok ? paper.assignment : null);
    const built = ok ? toReviewSections(paper.sections, numberQuestions) : [];
    setSections(built);

    // Only the answers to this paper's questions (as before).
    const inPaper = new Set(built.flatMap((s) => s.groups.flatMap((g) => g.questions.map((q) => q.id))));
    const answers = {};
    const results = {};
    (sa || []).forEach((row) => {
      if (!inPaper.has(row.question_id)) return;
      answers[row.question_id] = row.response;
      results[row.question_id] = { isCorrect: row.is_correct, earned: row.points_earned ?? (row.is_correct ? 1 : 0) };
    });
    setAnswersByQ(answers);
    setResultsByQ(results);
    // RLS only returns keys once the assignment allows answer review AND
    // the result is released — an empty result is the normal, expected
    // outcome when either isn't true yet.
    const correct = {};
    if (ok) for (const [qid, k] of Object.entries(paper.answerKeys || {})) if (inPaper.has(qid)) correct[qid] = k;
    setCorrectByQ(correct);

    setFeedbackRow(fb || null);
    setHandedAt(att?.submitted_at || null);
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
  // Livraison 90: on the answer sheet, the letter only.
  const correctShort = useMemo(() => {
    const map = {};
    for (const q of allQuestions) {
      if (correctByQ[q.id] !== undefined) map[q.id] = formatCorrectShort(q, correctByQ[q.id]);
    }
    return map;
  }, [allQuestions, correctByQ]);

  if (loading || !assignment) return <CenterSpinner />;

  const canSeeAnswers = Boolean(assignment.show_answer_review);
  const showCorrect = canSeeAnswers && Object.keys(correctByQ).length > 0;
  const rows = buildSheet(sections);
  const counts = sheetCounts(rows, resultsByQ);
  const back = () => setScreen(inExam ? { name: "home" } : { name: "student-assignments" });
  const backLabel = inExam ? "Exam" : "My assignments";
  const estimated = autoBand != null && !feedbackRow?.band;

  return (
    <div className="page page-wide rs-page">
      <Breadcrumb items={[{ label: backLabel, onClick: back }, { label: assignment.title }]} />

      <div className="rs-hero">
        <ScoreRing score={earnedPoints} total={totalPoints} band={null} size={124} />
        <div className="rs-hero-main">
          <div className="eyebrow">{assignment.type} · your result</div>
          <div className="rs-hero-band">
            <span className="rs-big">{displayBand != null ? `Band ${displayBand}` : `${earnedPoints}/${totalPoints}`}</span>
            {estimated && <span className="pill" title="Scaled to a 40-question test — an approximation, not an official score.">estimated</span>}
          </div>
          <div className="rs-hero-meta">
            {earnedPoints}/{totalPoints} points
            {canSeeAnswers ? ` · ${counts.right} correct · ${counts.wrong + counts.partial} to review` : ""}
            {handedAt ? ` · handed in ${fmtWhen(handedAt)}` : ""}
          </div>
        </div>
      </div>

      {feedbackRow?.feedback && (
        <div className="rs-teacher-note">
          <div className="rs-teacher-note-h"><MessageSquare size={14} /> Feedback from your teacher</div>
          <p>{feedbackRow.feedback}</p>
        </div>
      )}

      {canSeeAnswers ? (
        <>
          <div className="rs-viewbar">
            <div className="rs-seg" role="tablist">
              <button type="button" role="tab" aria-selected={view === "sheet"} className={view === "sheet" ? "on" : ""} onClick={() => setView("sheet")}>My answers</button>
              <button type="button" role="tab" aria-selected={view === "paper"} className={view === "paper" ? "on" : ""} onClick={() => setView("paper")}>Full paper</button>
            </div>
            {estimated && <span className="rs-hint">Band estimated on a 40-question scale.</span>}
          </div>
          {view === "sheet" ? (
            <AnswerSheet rows={rows} answersByQ={answersByQ} resultsByQ={resultsByQ} correctFormatted={correctShort} showCorrect={showCorrect} mine />
          ) : (
            <ReviewContent
              sections={sections}
              answersByQ={answersByQ}
              resultsByQ={resultsByQ}
              correctAnswersFormatted={correctAnswersFormatted}
              correctAnswersRaw={correctByQ}
              showCorrectAnswers
              assignmentId={assignmentId}
              viewerUserId={userId}
            />
          )}
        </>
      ) : (
        <div className="qe-feedback-locked">Your teacher has kept the answer breakdown private for this assignment — only your overall score is shown.</div>
      )}

      <div className="rs-foot">
        <button className="back-link" onClick={back}><ArrowLeft size={14} /> {inExam ? "Back to the exam" : "Back to my assignments"}</button>
      </div>
    </div>
  );
}
