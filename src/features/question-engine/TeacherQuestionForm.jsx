
import React, { useState } from "react";
import { supabase } from "../../supabaseClient";

export function TeacherQuestionForm({ teacherId, skill = "reading", onCreated }) {
  const [prompt, setPrompt] = useState("");
  const [labelSet, setLabelSet] = useState("true_false");
  const [correctAnswer, setCorrectAnswer] = useState("positive");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function create() {
    if (!prompt.trim()) return;
    setBusy(true);
    setError("");

    const { data: question, error: qError } = await supabase
      .from("questions")
      .insert({
        teacher_id: teacherId,
        type: "true_false_not_given",
        skill,
        prompt: prompt.trim(),
        options: { label_set: labelSet },
      })
      .select()
      .single();

    if (qError || !question) {
      setBusy(false);
      setError("Could not create question: " + (qError?.message || "unknown error"));
      return;
    }

    const { error: kError } = await supabase
      .from("question_answer_key")
      .insert({ question_id: question.id, correct_answer: correctAnswer });

    setBusy(false);
    if (kError) {
      setError("Question created, but saving the answer key failed: " + kError.message);
      return;
    }

    setPrompt("");
    setCorrectAnswer("positive");
    onCreated?.(question);
  }

  const labels =
    labelSet === "yes_no"
      ? { positive: "Yes", negative: "No", not_given: "Not Given" }
      : { positive: "True", negative: "False", not_given: "Not Given" };

  return (
    <div className="qe-form">
      <label className="field-label">Question type</label>
      <div className="type-row">
        <button type="button" className={`type-chip ${labelSet === "true_false" ? "active" : ""}`} onClick={() => setLabelSet("true_false")}>
          True / False / Not Given
        </button>
        <button type="button" className={`type-chip ${labelSet === "yes_no" ? "active" : ""}`} onClick={() => setLabelSet("yes_no")}>
          Yes / No / Not Given
        </button>
      </div>

      <label className="field-label" style={{ marginTop: 14 }}>Question text</label>
      <textarea
        className="field-input textarea"
        placeholder="e.g. The company was founded before 1990."
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
      />

      <label className="field-label" style={{ marginTop: 14 }}>Correct answer</label>
      <div className="type-row">
        {["positive", "negative", "not_given"].map((key) => (
          <button
            key={key}
            type="button"
            className={`type-chip ${correctAnswer === key ? "active" : ""}`}
            onClick={() => setCorrectAnswer(key)}
          >
            {labels[key]}
          </button>
        ))}
      </div>

      {error && <div className="field-error">{error}</div>}

      <button className="btn-primary" style={{ marginTop: 16 }} disabled={!prompt.trim() || busy} onClick={create}>
        {busy ? "Saving…" : "Save question"}
      </button>
    </div>
  );
}
