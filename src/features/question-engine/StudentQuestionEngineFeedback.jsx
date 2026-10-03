import React, { useState, useEffect, useCallback, useMemo } from "react";
import { ArrowLeft, MessageSquare } from "lucide-react";
import { supabase } from "../../supabaseClient";
import { CenterSpinner } from "../../components/shared";
import { ScoreRing } from "./ScoreRing";
import { ReviewContent } from "./ReviewContent";
import { formatAnswerValue } from "./answerFormat";
import { numberQuestions } from "./bulkParse";
import { computeIeltsBand } from "./bandConversion";
import { Breadcrumb } from "../../components/DropMenu";
import { buildSheet, sheetCounts, QuestionDots, AnswerSheet, goToQuestion, fmtWhen } from "./ResultParts";

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
      .select("id, title, passage_title, passage_text, audio_url, max_plays, order_index")
      .eq("assignment_id", assignmentId)
      .order("order_index");

    const built = [];
    let globalCounter = 0;
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

    // When it was handed in (the student's own copy row).
    const { data: att } = await supabase
      .from("exam_attempts")
      .select("submitted_at")
      .eq("assignment_id", assignmentId)
      .eq("student_id", userId)
      .maybeSingle();
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
          {canSeeAnswers && <QuestionDots rows={rows} resultsByQ={resultsByQ} onPick={(row) => { if (view !== "sheet" && view !== "paper") setView("sheet"); setTimeout(() => goToQuestion(row), 50); }} />}
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
            <AnswerSheet rows={rows} answersByQ={answersByQ} resultsByQ={resultsByQ} correctFormatted={correctAnswersFormatted} showCorrect={showCorrect} mine />
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
