import React, { useState, useEffect } from "react";
import { ArrowLeft, Clock } from "lucide-react";
import { supabase } from "../../supabaseClient";
import { StudentExamRunner, PaperUnavailable, PaperLoadError } from "./StudentExamRunner";
import { StudentWritingRunner } from "./StudentWritingRunner";
import { StudentWritingFeedback } from "./StudentWritingFeedback";
import { StudentSpeakingViewer } from "./StudentSpeakingViewer";
import { StudentQuestionEngineFeedback } from "./StudentQuestionEngineFeedback";
import { CenterSpinner } from "../../components/shared";

// Decides, invisibly, which experience the student sees:
// - No exam_sections (an assignment whose builder was interrupted
//   before it could write its content)?           → a short explanation
// - Has exam_sections, not yet submitted?           → StudentExamRunner (take the exam)
// - Has exam_sections, submitted, score released?   → StudentQuestionEngineFeedback (results)
// - Has exam_sections, submitted, not yet released? → a simple waiting message
//
// onSubmitted (optional): given by the exam-room screen. Inside an exam
// the waiting message has no place — the next paper is waiting — so the
// hand-in closes the paper and goes straight back to the list of papers.
// Left out (an ordinary class assignment), the waiting message stays:
// there, the student really is waiting for a correction.
export function AssignmentOpenBridge({ userId, classId, assignmentId, setScreen, showToast, onSubmitted }) {
  const [checking, setChecking] = useState(true);
  const [isStructured, setIsStructured] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [isReleased, setIsReleased] = useState(false);
  const [isWriting, setIsWriting] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  // Bumped after a Reading/Listening submission so the routing below runs
  // again (results screen or "waiting for feedback" instead of the exam).
  const [recheck, setRecheck] = useState(0);
  // "ok" | "refused" (the database says this student may not open it) | "error"
  const [access, setAccess] = useState("ok");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // 1. The paper's own row decides whether this student may open it
      // (its RLS carries the exam locks). maybeSingle: no row = no error,
      // so a refusal is never mistaken for a connection problem.
      const { data: paperRow, error: paperError } = await supabase
        .from("assignments")
        .select("type")
        .eq("id", assignmentId)
        .maybeSingle();
      if (paperError || !paperRow) {
        if (!cancelled) {
          setAccess(paperError ? "error" : "refused");
          setChecking(false);
        }
        return;
      }

      const { count, error: countError } = await supabase
        .from("exam_sections")
        .select("id", { count: "exact", head: true })
        .eq("assignment_id", assignmentId);
      if (countError) {
        // Not "no content": we simply could not tell.
        if (!cancelled) { setAccess("error"); setChecking(false); }
        return;
      }
      const structured = (count || 0) > 0;

      // Structured Writing stores its answers in writing_responses (not
      // student_answers) and has its own exam screen.
      let writing = false;
      let writingSubmitted = false;
      let speaking = false;
      if (structured) {
        const t = paperRow;
        writing = t?.type === "Writing";
        speaking = t?.type === "Speaking";
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

      // Writing is always marked by the teacher: results show only once
      // the feedback is published (the student can read that row only
      // after publication — database rule).
      let writingReleased = false;
      if (writing && writingSubmitted) {
        const { data: wfb } = await supabase
          .from("assignment_feedback")
          .select("released_at")
          .eq("assignment_id", assignmentId)
          .eq("student_id", userId)
          .maybeSingle();
        writingReleased = Boolean(wfb?.released_at);
      }

      let submitted = false;
      let released = false;
      if (structured && !writing && !speaking) {
        const { count: answerCount } = await supabase
          .from("student_answers")
          .select("id", { count: "exact", head: true })
          .eq("assignment_id", assignmentId)
          .eq("student_id", userId);
        submitted = (answerCount || 0) > 0;
        if (!submitted) {
          // A submission with no answer at all is still a submission.
          const { data: att } = await supabase
            .from("exam_attempts")
            .select("submitted_at")
            .eq("assignment_id", assignmentId)
            .eq("student_id", userId)
            .maybeSingle();
          submitted = Boolean(att?.submitted_at);
        }

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
        setAccess("ok");
        setIsStructured(structured);
        setIsWriting(writing);
        setIsSpeaking(speaking);
        setHasSubmitted(writing ? writingSubmitted : submitted);
        setIsReleased(writing ? writingReleased : released);
        setChecking(false);
      }
    })();
    return () => { cancelled = true; };
  }, [assignmentId, userId, recheck]);

  if (checking) return <CenterSpinner />;

  // Refused by the database, or could not be checked: never "no content yet".
  if (access === "refused") return <PaperUnavailable onBack={() => setScreen({ name: "home" })} />;
  if (access === "error") {
    return (
      <PaperLoadError
        onBack={() => setScreen({ name: "home" })}
        onRetry={() => { setChecking(true); setRecheck((n) => n + 1); }}
      />
    );
  }

  // No Part at all. Every assignment is now built with a structured
  // builder or the importer, so this only happens when a builder was
  // interrupted before writing its content — never in normal use.
  // The student is told plainly instead of landing on a blank screen.
  if (!isStructured) {
    return (
      <div className="page">
        <button className="back-link" onClick={() => setScreen({ name: "home" })}>
          <ArrowLeft size={14} /> All assignments
        </button>
        <p className="empty-inline">This assignment has no content yet. Please tell your teacher.</p>
      </div>
    );
  }

  // Structured Speaking: consult only — no submission, no results.
  if (isSpeaking) {
    return <StudentSpeakingViewer userId={userId} assignmentId={assignmentId} setScreen={setScreen} />;
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
        onSubmitted={() => { if (onSubmitted) onSubmitted(); else setHasSubmitted(true); }}
      />
    );
  }

  if (isWriting && isReleased) {
    return <StudentWritingFeedback assignmentId={assignmentId} userId={userId} setScreen={setScreen} />;
  }

  if (!hasSubmitted) {
    return (
      <StudentExamRunner
        userId={userId}
        classId={classId}
        assignmentId={assignmentId}
        setScreen={setScreen}
        showToast={showToast}
        onSubmitted={() => {
          if (onSubmitted) { onSubmitted(); return; }
          setChecking(true);
          setRecheck((n) => n + 1);
        }}
      />
    );
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
