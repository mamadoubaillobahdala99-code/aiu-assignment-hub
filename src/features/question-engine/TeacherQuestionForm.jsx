import React, { useState } from "react";
import { Plus, X } from "lucide-react";
import { supabase } from "../../supabaseClient";

export function TeacherQuestionForm({ teacherId, skill = "reading", onCreated }) {
  const [questionType, setQuestionType] = useState("true_false_not_given");

  // --- True/False/Not Given state ---
  const [prompt, setPrompt] = useState("");
  const [labelSet, setLabelSet] = useState("true_false");
  const [correctAnswer, setCorrectAnswer] = useState("positive");

  // --- Multiple Choice state ---
  const [mcPrompt, setMcPrompt] = useState("");
  const [choices, setChoices] = useState([{ letter: "A", text: "" }, { letter: "B", text: "" }]);
  const [mcCorrectLetter, setMcCorrectLetter] = useState("A");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function addChoice() {
    const nextLetter = String.fromCharCode(65 + choices.length); // A, B, C, D...
    setChoices((prev) => [...prev, { letter: nextLetter, text: "" }]);
  }
  function removeChoice(letter) {
    // Re-letter the remaining choices so they stay A, B, C... with no gaps.
    setChoices((prev) =>
      prev.filter((c) => c.letter !== letter).map((c, i) => ({ ...c, letter: String.fromCharCode(65 + i) }))
    );
    if (mcCorrectLetter === letter) setMcCorrectLetter("A");
  }
  function updateChoiceText(letter, text) {
    setChoices((prev) => prev.map((c) => (c.letter === letter ? { ...c, text } : c)));
  }

  async function createTrueFalse() {
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

  async function createMultipleChoice() {
    const trimmedChoices = choices.map((c) => ({ ...c, text: c.text.trim() }));
    if (!mcPrompt.trim() || trimmedChoices.some((c) => !c.text)) return;
    setBusy(true);
    setError("");

    const { data: question, error: qError } = await supabase
      .from("questions")
      .insert({
        teacher_id: teacherId,
        type: "multiple_choice",
        skill,
        prompt: mcPrompt.trim(),
        options: { choices: trimmedChoices },
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
      .insert({ question_id: question.id, correct_answer: mcCorrectLetter });

    setBusy(false);
    if (kError) {
      setError("Question created, but saving the answer key failed: " + kError.message);
      return;
    }

    setMcPrompt("");
    setChoices([{ letter: "A", text: "" }, { letter: "B", text: "" }]);
    setMcCorrectLetter("A");
    onCreated?.(question);
  }

  const tfLabels =
    labelSet === "yes_no"
      ? { positive: "Yes", negative: "No", not_given: "Not Given" }
      : { positive: "True", negative: "False", not_given: "Not Given" };

  return (
    <div className="qe-form">
      <label className="field-label">Question type</label>
      <div className="type-row">
        <button type="button" className={`type-chip ${questionType === "true_false_not_given" ? "active" : ""}`} onClick={() => setQuestionType("true_false_not_given")}>
          True/False or Yes/No
        </button>
        <button type="button" className={`type-chip ${questionType === "multiple_choice" ? "active" : ""}`} onClick={() => setQuestionType("multiple_choice")}>
          Multiple Choice
        </button>
      </div>

      {questionType === "true_false_not_given" && (
        <>
          <label className="field-label" style={{ marginTop: 14 }}>Label style</label>
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
                {tfLabels[key]}
              </button>
            ))}
          </div>

          {error && <div className="field-error">{error}</div>}

          <button className="btn-primary" style={{ marginTop: 16 }} disabled={!prompt.trim() || busy} onClick={createTrueFalse}>
            {busy ? "Saving…" : "Save question"}
          </button>
        </>
      )}

      {questionType === "multiple_choice" && (
        <>
          <label className="field-label" style={{ marginTop: 14 }}>Question text</label>
          <textarea
            className="field-input textarea"
            placeholder="e.g. What is the main advantage of vertical farming?"
            value={mcPrompt}
            onChange={(e) => setMcPrompt(e.target.value)}
          />

          <label className="field-label" style={{ marginTop: 14 }}>Choices</label>
          {choices.map((choice) => (
            <div key={choice.letter} className="qe-mc-choice-row">
              <span className="qe-mc-letter">{choice.letter}</span>
              <input
                className="field-input"
                placeholder={`Option ${choice.letter}…`}
                value={choice.text}
                onChange={(e) => updateChoiceText(choice.letter, e.target.value)}
              />
              {choices.length > 2 && (
                <button type="button" className="btn-ghost qe-mc-remove" onClick={() => removeChoice(choice.letter)}>
                  <X size={13} />
                </button>
              )}
            </div>
          ))}
          <button type="button" className="btn-ghost" style={{ marginTop: 6 }} onClick={addChoice}>
            <Plus size={13} /> Add option
          </button>

          <label className="field-label" style={{ marginTop: 14 }}>Correct answer</label>
          <div className="type-row">
            {choices.map((c) => (
              <button
                key={c.letter}
                type="button"
                className={`type-chip ${mcCorrectLetter === c.letter ? "active" : ""}`}
                onClick={() => setMcCorrectLetter(c.letter)}
              >
                {c.letter}
              </button>
            ))}
          </div>

          {error && <div className="field-error">{error}</div>}

          <button
            className="btn-primary"
            style={{ marginTop: 16 }}
            disabled={!mcPrompt.trim() || choices.some((c) => !c.text.trim()) || busy}
            onClick={createMultipleChoice}
          >
            {busy ? "Saving…" : "Save question"}
          </button>
        </>
      )}
    </div>
  );
}
