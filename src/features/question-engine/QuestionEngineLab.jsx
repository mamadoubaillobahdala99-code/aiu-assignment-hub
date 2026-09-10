
import React, { useState } from "react";
import { supabase } from "../../supabaseClient";
import { TeacherQuestionForm } from "./TeacherQuestionForm";
import { QuestionRenderer } from "./QuestionRenderer";

// TEMPORARY test page — not linked from the real navigation yet.
// Purpose: prove, end to end, that a question can be created, answered,
// and corrected automatically — before we build the real Reading/Listening
// screens around this engine.
export function QuestionEngineLab({ userId }) {
  const [createdQuestion, setCreatedQuestion] = useState(null);
  const [answer, setAnswer] = useState(null);
  const [result, setResult] = useState(null); // null | "correct" | "incorrect"
  const [checking, setChecking] = useState(false);

  async function checkAnswer() {
    if (!createdQuestion || answer === null) return;
    setChecking(true);
    const { data: isCorrect, error } = await supabase.rpc("submit_student_answer", {
      p_assignment_id: null, // lab test only — no real assignment involved yet
      p_question_id: createdQuestion.id,
      p_response: answer,
    });
    setChecking(false);
    if (error) {
      alert("Error checking answer: " + error.message);
      return;
    }
    setResult(isCorrect ? "correct" : "incorrect");
  }

  return (
    <div className="page">
      <div className="eyebrow">Question engine — test lab</div>
      <h1 className="page-title">Step 1 — Create a question (as teacher)</h1>

      {!createdQuestion ? (
        <TeacherQuestionForm teacherId={userId} onCreated={setCreatedQuestion} />
      ) : (
        <div className="feedback-panel">
          <p className="feedback-text">Question created: "{createdQuestion.prompt}"</p>
        </div>
      )}

      {createdQuestion && (
        <>
          <h1 className="page-title" style={{ marginTop: 36 }}>Step 2 — Answer it (as student)</h1>
          <QuestionRenderer
            question={createdQuestion}
            value={answer}
            onChange={setAnswer}
            disabled={result !== null}
          />

          {result === null && (
            <button className="btn-primary" style={{ marginTop: 16 }} disabled={answer === null || checking} onClick={checkAnswer}>
              {checking ? "Checking…" : "Submit answer"}
            </button>
          )}

          {result && (
            <div className={`feedback-panel ${result === "incorrect" ? "qe-incorrect" : ""}`} style={{ marginTop: 16 }}>
              <div className="feedback-band">{result === "correct" ? "Correct!" : "Incorrect"}</div>
              <p className="feedback-text">The correction happened automatically, on the server — this page never saw the answer key.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
