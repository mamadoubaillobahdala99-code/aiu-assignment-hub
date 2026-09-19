import React, { useState, useEffect } from "react";
import { ArrowLeft, Clock } from "lucide-react";
import { supabase } from "../../supabaseClient";
import { StudentExamRunner } from "./StudentExamRunner";
import { StudentWritingRunner } from "./StudentWritingRunner";
import { StudentQuestionEngineFeedback } from "./StudentQuestionEngineFeedback";
import { AssignmentStudent } from "../assignment-hub/AssignmentStudent";
import { CenterSpinner } from "../../components/shared";

// Decides, invisibly, which experience the student sees:
// - No exam_sections (old-style assignment, or anything created before
//   the Question Engine)?                          → AssignmentStudent (old, untouched)
// - Has exam_sections, not yet submitted?           → StudentExamRunner (take the exam)
// - Has exam_sections, submitted, score released?   → StudentQuestionEngineFeedback (results)
// - Has exam_sections, submitted, not yet released? → a simple waiting message
export function AssignmentOpenBridge({ userId, classId, assignmentId, setScreen, showToast }) {
  const [checking, setChecking] = useState(true);
  const [isStructured, setIsStructured] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [isReleased, setIsReleased] = useState(false);
  const [isWriting, setIsWriting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { count } = await supabase
        .from("exam_sections")
        .select("id", { count: "exact", head: true })
        .eq("assignment_id", assignmentId);
      const structured = (count || 0) > 0;

      // Structured Writing stores its answers in writing_responses (not
      // student_answers) and has its own exam screen.
      let writing = false;
      let writingSubmitted = false;
      if (structured) {
        const { data: t } = await supabase.from("assignments").select("type").eq("id", assignmentId).single();
        writing = t?.type === "Writing";
        if (writing) {
          const { count: sentCount } = await supabase
            .from("writing_responses")
            .select("id", { count: "exact", head: true })
            .eq("assignment_id", assignmentId)
            .eq("student_id", userId)
            .not("submitted_at", "is", null);
          writingSubmitted = (sentCount || 0) > 0;
        }
      }

      let submitted = false;
      let released = false;
      if (structured && !writing) {
        const { count: answerCount } = await supabase
          .from("student_answers")
          .select("id", { count: "exact", head: true })
          .eq("assignment_id", assignmentId)
          .eq("student_id", userId);
        submitted = (answerCount || 0) > 0;

        if (submitted) {
          const { data: a } = await supabase.from("assignments").select("auto_release_score").eq("id", assignmentId).single();
          if (a?.auto_release_score) {
            released = true;
          } else {
            const { data: fb } = await supabase
              .from("assignment_feedback")
              .select("released_at")
              .eq("assignment_id", assignmentId)
              .eq("student_id", userId)
              .maybeSingle();
            released = Boolean(fb?.released_at);
          }
        }
      }

      if (!cancelled) {
        setIsStructured(structured);
        setIsWriting(writing);
        setHasSubmitted(writing ? writingSubmitted : submitted);
        setIsReleased(released);
        setChecking(false);
      }
    })();
    return () => { cancelled = true; };
  }, [assignmentId, userId]);

  if (checking) return <CenterSpinner />;

  if (!isStructured) {
    return <AssignmentStudent userId={userId} classId={classId} assignmentId={assignmentId} setScreen={setScreen} showToast={showToast} />;
  }

  // Writing: exam screen until submitted, then the waiting message below
  // (the teacher's correction screen comes with the next delivery).
  if (isWriting && !hasSubmitted) {
    return (
      <StudentWritingRunner
        userId={userId}
        assignmentId={assignmentId}
        setScreen={setScreen}
        showToast={showToast}
        onSubmitted={() => setHasSubmitted(true)}
      />
    );
  }

  if (!hasSubmitted) {
    return <StudentExamRunner userId={userId} classId={classId} assignmentId={assignmentId} setScreen={setScreen} showToast={showToast} />;
  }

  if (isReleased) {
    return <StudentQuestionEngineFeedback assignmentId={assignmentId} userId={userId} setScreen={setScreen} />;
  }

  return (
    <div className="page">
      <button className="back-link" onClick={() => setScreen({ name: "home" })}><ArrowLeft size={14} /> Back to assignments</button>
      <div className="qe-feedback-locked">
        <Clock size={22} style={{ marginBottom: 10 }} />
        <p>Submitted — waiting for teacher feedback.</p>
      </div>
    </div>
  );
}
