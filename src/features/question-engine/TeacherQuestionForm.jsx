import React, { useState, useMemo } from "react";
import { Plus, X } from "lucide-react";
import { supabase } from "../../supabaseClient";

// Recognizes lines like "1. Some sentence." or "1) Some sentence."
// Anything not matching this pattern is simply ignored — the teacher
// always sees exactly what was understood before creating anything.
function parseNumberedLines(text) {
  const items = [];
  for (const rawLine of text.split("\n")) {
    const m = rawLine.match(/^\s*(\d+)[.)]\s*(.+?)\s*$/);
    if (m) items.push({ number: m[1], text: m[2] });
  }
  return items;
}

export function TeacherQuestionForm({ teacherId, skill = "reading", onCreated }) {
  const [questionType, setQuestionType] = useState("true_false_not_given");
  const [bulkMode, setBulkMode] = useState(false);

  // --- True/False/Not Given — single question state ---
  const [prompt, setPrompt] = useState("");
  const [labelSet, setLabelSet] = useState("true_false");
  const [correctAnswer, setCorrectAnswer] = useState("positive");

  // --- True/False/Not Given — bulk paste state ---
  const [bulkText, setBulkText] = useState("");
  const [bulkAnswers, setBulkAnswers] = useState({}); // { [lineNumber]: "positive" | "negative" | "not_given" }

  // --- Multiple Choice state ---
  const [mcPrompt, setMcPrompt] = useState("");
  const [choices, setChoices] = useState([{ letter: "A", text: "" }, { letter: "B", text: "" }]);
  const [mcCorrectLetter, setMcCorrectLetter] = useState("A");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const parsedBulk = useMemo(() => parseNumberedLines(bulkText), [bulkText]);
  const allBulkAnswered = parsedBulk.length > 0 && parsedBulk.every((item) => bulkAnswers[item.number]);

  function addChoice() {
    const nextLetter = String.fromCharCode(65 + choices.length);
    setChoices((prev) => [...prev, { letter: nextLetter, text: "" }]);
  }
  function removeChoice(letter) {
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
      .insert({ teacher_id: teacherId, type: "true_false_not_given", skill, prompt: prompt.trim(), options: { label_set: labelSet } })
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

  async function createBulkTrueFalse() {
    if (!allBulkAnswered) return;
    setBusy(true);
    setError("");

    for (const item of parsedBulk) {
      const { data: question, error: qError } = await supabase
        .from("questions")
        .insert({ teacher_id: teacherId, type: "true_false_not_given", skill, prompt: item.text, options: { label_set: labelSet } })
        .select()
        .single();

      if (qError || !question) {
        setBusy(false);
        setError(`Stopped at question ${item.number}: ` + (qError?.message || "unknown error"));
        return;
      }

      const { error: kError } = await supabase
        .from("question_answer_key")
        .insert({ question_id: question.id, correct_answer: bulkAnswers[item.number] });

      if (kError) {
        setBusy(false);
        setError(`Question ${item.number} created, but its answer key failed: ` + kError.message);
        return;
      }

      onCreated?.(question);
    }

    setBusy(false);
    setBulkText("");
    setBulkAnswers({});
  }

  async function createMultipleChoice() {
    const trimmedChoices = choices.map((c) => ({ ...c, text: c.text.trim() }));
    if (!mcPrompt.trim() || trimmedChoices.some((c) => !c.text)) return;
    setBusy(true);
    setError("");

    const { data: question, error: qError } = await supabase
      .from("questions")
      .insert({ teacher_id: teacherId, type: "multiple_choice", skill, prompt: mcPrompt.trim(), options: { choices: trimmedChoices } })
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

          <label className="field-label" style={{ marginTop: 14 }}>Add questions</label>
          <div className="type-row">
            <button type="button" className={`type-chip ${!bulkMode ? "active" : ""}`} onClick={() => setBulkMode(false)}>
              One at a time
            </button>
            <button type="button" className={`type-chip ${bulkMode ? "active" : ""}`} onClick={() => setBulkMode(true)}>
              Paste several at once
            </button>
          </div>

          {!bulkMode ? (
            <>
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
                  <button key={key} type="button" className={`type-chip ${correctAnswer === key ? "active" : ""}`} onClick={() => setCorrectAnswer(key)}>
                    {tfLabels[key]}
                  </button>
                ))}
              </div>

              {error && <div className="field-error">{error}</div>}

              <button className="btn-primary" style={{ marginTop: 16 }} disabled={!prompt.trim() || busy} onClick={createTrueFalse}>
                {busy ? "Saving…" : "Save question"}
              </button>
            </>
          ) : (
            <>
              <label className="field-label" style={{ marginTop: 14 }}>Paste numbered questions</label>
              <p className="field-hint" style={{ marginTop: 0, marginBottom: 8 }}>
                One per line, like: "1. The company was founded before 1990." — anything not numbered this way is ignored.
              </p>
              <textarea
                className="field-input textarea"
                style={{ minHeight: 140 }}
                placeholder={"1. First statement.\n2. Second statement.\n3. Third statement."}
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
              />

              {parsedBulk.length > 0 && (
                <div className="qe-bulk-preview">
                  <div className="field-label" style={{ marginTop: 14 }}>
                    {parsedBulk.length} question{parsedBulk.length > 1 ? "s" : ""} detected — pick the correct answer for each
                  </div>
                  {parsedBulk.map((item) => (
                    <div key={item.number} className="qe-bulk-row">
                      <div className="qe-bulk-text">{item.number}. {item.text}</div>
                      <div className="type-row">
                        {["positive", "negative", "not_given"].map((key) => (
                          <button
                            key={key}
                            type="button"
                            className={`type-chip ${bulkAnswers[item.number] === key ? "active" : ""}`}
                            onClick={() => setBulkAnswers((prev) => ({ ...prev, [item.number]: key }))}
                          >
                            {tfLabels[key]}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {error && <div className="field-error">{error}</div>}

              <button className="btn-primary" style={{ marginTop: 16 }} disabled={!allBulkAnswered || busy} onClick={createBulkTrueFalse}>
                {busy ? "Saving…" : `Create ${parsedBulk.length || ""} question${parsedBulk.length > 1 ? "s" : ""}`}
              </button>
            </>
          )}
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
              <button key={c.letter} type="button" className={`type-chip ${mcCorrectLetter === c.letter ? "active" : ""}`} onClick={() => setMcCorrectLetter(c.letter)}>
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
