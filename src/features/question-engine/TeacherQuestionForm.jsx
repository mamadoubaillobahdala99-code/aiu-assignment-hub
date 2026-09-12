import React, { useState, useMemo } from "react";
import { Plus, X } from "lucide-react";
import { supabase } from "../../supabaseClient";
import { parseBulkTrueFalse, parseBulkMultipleChoice } from "./bulkParse";

export function TeacherQuestionForm({ teacherId, skill = "reading", onCreated }) {
  const [questionType, setQuestionType] = useState("true_false_not_given");
  const [bulkMode, setBulkMode] = useState(false);

  // --- True/False/Not Given — single question state ---
  const [prompt, setPrompt] = useState("");
  const [labelSet, setLabelSet] = useState("true_false");
  const [correctAnswer, setCorrectAnswer] = useState("positive");

  // --- True/False/Not Given — bulk paste state ---
  const [bulkText, setBulkText] = useState("");
  const [bulkAnswers, setBulkAnswers] = useState({}); // { [itemKey]: "positive" | "negative" | "not_given" }

  // --- Multiple Choice — single question state ---
  const [mcPrompt, setMcPrompt] = useState("");
  const [choices, setChoices] = useState([{ letter: "A", text: "" }, { letter: "B", text: "" }]);
  const [mcCorrectLetter, setMcCorrectLetter] = useState("A");

  // --- Multiple Choice — bulk paste state ---
  const [mcBulkText, setMcBulkText] = useState("");
  const [mcBulkAnswers, setMcBulkAnswers] = useState({});

  // --- Multiple Selection (choose N of M) state ---
  const [msPrompt, setMsPrompt] = useState("");
  const [msChoices, setMsChoices] = useState([{ letter: "A", text: "" }, { letter: "B", text: "" }, { letter: "C", text: "" }]);
  const [msRequiredCount, setMsRequiredCount] = useState(2);
  const [msCorrectLetters, setMsCorrectLetters] = useState([]);

  // --- Multiple Selection — bulk paste state ---
  const [msBulkText, setMsBulkText] = useState("");
  const [msBulkConfig, setMsBulkConfig] = useState({}); // { [itemKey]: { requiredCount, correctLetters: [] } } // { [itemKey]: letter }

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const tfBulkResult = useMemo(() => parseBulkTrueFalse(bulkText), [bulkText]);
  const tfBulkItems = tfBulkResult.items;
  const allTfBulkAnswered = tfBulkItems.length > 0 && tfBulkItems.every((item) => bulkAnswers[item.key]);

  const mcBulkItems = useMemo(() => parseBulkMultipleChoice(mcBulkText), [mcBulkText]);
  const allMcBulkAnswered = mcBulkItems.length > 0 && mcBulkItems.every((item) => mcBulkAnswers[item.key]);

  const msBulkItems = useMemo(() => parseBulkMultipleChoice(msBulkText), [msBulkText]);
  const allMsBulkConfigured =
    msBulkItems.length > 0 &&
    msBulkItems.every((item) => {
      const cfg = msBulkConfig[item.key];
      return cfg && cfg.requiredCount > 0 && cfg.correctLetters.length === cfg.requiredCount;
    });

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
    const { error: kError } = await supabase.from("question_answer_key").insert({ question_id: question.id, correct_answer: correctAnswer });
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
    if (!allTfBulkAnswered) return;
    setBusy(true);
    setError("");
    for (const item of tfBulkItems) {
      const { data: question, error: qError } = await supabase
        .from("questions")
        .insert({ teacher_id: teacherId, type: "true_false_not_given", skill, prompt: item.text, options: { label_set: labelSet } })
        .select()
        .single();
      if (qError || !question) {
        setBusy(false);
        setError(`Stopped at "${item.text.slice(0, 30)}…": ` + (qError?.message || "unknown error"));
        return;
      }
      const { error: kError } = await supabase.from("question_answer_key").insert({ question_id: question.id, correct_answer: bulkAnswers[item.key] });
      if (kError) {
        setBusy(false);
        setError("A question was created, but its answer key failed: " + kError.message);
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
    const { error: kError } = await supabase.from("question_answer_key").insert({ question_id: question.id, correct_answer: mcCorrectLetter });
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

  async function createBulkMultipleChoice() {
    if (!allMcBulkAnswered) return;
    setBusy(true);
    setError("");
    for (const item of mcBulkItems) {
      const { data: question, error: qError } = await supabase
        .from("questions")
        .insert({ teacher_id: teacherId, type: "multiple_choice", skill, prompt: item.prompt, options: { choices: item.choices } })
        .select()
        .single();
      if (qError || !question) {
        setBusy(false);
        setError(`Stopped at "${item.prompt.slice(0, 30)}…": ` + (qError?.message || "unknown error"));
        return;
      }
      const { error: kError } = await supabase.from("question_answer_key").insert({ question_id: question.id, correct_answer: mcBulkAnswers[item.key] });
      if (kError) {
        setBusy(false);
        setError("A question was created, but its answer key failed: " + kError.message);
        return;
      }
      onCreated?.(question);
    }
    setBusy(false);
    setMcBulkText("");
    setMcBulkAnswers({});
  }

  function addMsChoice() {
    const nextLetter = String.fromCharCode(65 + msChoices.length);
    setMsChoices((prev) => [...prev, { letter: nextLetter, text: "" }]);
  }
  function removeMsChoice(letter) {
    setMsChoices((prev) =>
      prev.filter((c) => c.letter !== letter).map((c, i) => ({ ...c, letter: String.fromCharCode(65 + i) }))
    );
    setMsCorrectLetters((prev) => prev.filter((l) => l !== letter));
  }
  function updateMsChoiceText(letter, text) {
    setMsChoices((prev) => prev.map((c) => (c.letter === letter ? { ...c, text } : c)));
  }
  function toggleMsCorrect(letter) {
    setMsCorrectLetters((prev) => {
      if (prev.includes(letter)) return prev.filter((l) => l !== letter);
      if (prev.length >= msRequiredCount) return prev; // capped, same limit shown to students
      return [...prev, letter];
    });
  }

  function updateMsBulkRequiredCount(key, count) {
    setMsBulkConfig((prev) => ({
      ...prev,
      [key]: { requiredCount: count, correctLetters: (prev[key]?.correctLetters || []).slice(0, count) },
    }));
  }
  function toggleMsBulkCorrect(key, letter) {
    setMsBulkConfig((prev) => {
      const cfg = prev[key] || { requiredCount: 2, correctLetters: [] };
      const already = cfg.correctLetters.includes(letter);
      let correctLetters;
      if (already) correctLetters = cfg.correctLetters.filter((l) => l !== letter);
      else if (cfg.correctLetters.length >= cfg.requiredCount) return prev; // capped
      else correctLetters = [...cfg.correctLetters, letter];
      return { ...prev, [key]: { ...cfg, correctLetters } };
    });
  }

  async function createBulkMultipleSelection() {
    if (!allMsBulkConfigured) return;
    setBusy(true);
    setError("");
    for (const item of msBulkItems) {
      const cfg = msBulkConfig[item.key];
      const { data: question, error: qError } = await supabase
        .from("questions")
        .insert({
          teacher_id: teacherId,
          type: "multiple_selection",
          skill,
          prompt: item.prompt,
          options: { choices: item.choices, required_count: cfg.requiredCount },
          points: cfg.requiredCount,
        })
        .select()
        .single();
      if (qError || !question) {
        setBusy(false);
        setError(`Stopped at "${item.prompt.slice(0, 30)}…": ` + (qError?.message || "unknown error"));
        return;
      }
      const { error: kError } = await supabase.from("question_answer_key").insert({ question_id: question.id, correct_answer: cfg.correctLetters });
      if (kError) {
        setBusy(false);
        setError("A question was created, but its answer key failed: " + kError.message);
        return;
      }
      onCreated?.(question);
    }
    setBusy(false);
    setMsBulkText("");
    setMsBulkConfig({});
  }

  async function createMultipleSelection() {
    const trimmedChoices = msChoices.map((c) => ({ ...c, text: c.text.trim() }));
    if (!msPrompt.trim() || trimmedChoices.some((c) => !c.text) || msCorrectLetters.length !== msRequiredCount) return;
    setBusy(true);
    setError("");
    const { data: question, error: qError } = await supabase
      .from("questions")
      .insert({
        teacher_id: teacherId,
        type: "multiple_selection",
        skill,
        prompt: msPrompt.trim(),
        options: { choices: trimmedChoices, required_count: msRequiredCount },
        points: msRequiredCount,
      })
      .select()
      .single();
    if (qError || !question) {
      setBusy(false);
      setError("Could not create question: " + (qError?.message || "unknown error"));
      return;
    }
    const { error: kError } = await supabase.from("question_answer_key").insert({ question_id: question.id, correct_answer: msCorrectLetters });
    setBusy(false);
    if (kError) {
      setError("Question created, but saving the answer key failed: " + kError.message);
      return;
    }
    setMsPrompt("");
    setMsChoices([{ letter: "A", text: "" }, { letter: "B", text: "" }, { letter: "C", text: "" }]);
    setMsCorrectLetters([]);
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
        <button type="button" className={`type-chip ${questionType === "multiple_selection" ? "active" : ""}`} onClick={() => setQuestionType("multiple_selection")}>
          Choose Multiple Letters
        </button>
      </div>

      {questionType === "true_false_not_given" && (
        <>
          <label className="field-label" style={{ marginTop: 14 }}>Label style</label>
          <div className="type-row">
            <button type="button" className={`type-chip ${labelSet === "true_false" ? "active" : ""}`} onClick={() => setLabelSet("true_false")}>True / False / Not Given</button>
            <button type="button" className={`type-chip ${labelSet === "yes_no" ? "active" : ""}`} onClick={() => setLabelSet("yes_no")}>Yes / No / Not Given</button>
          </div>

          <label className="field-label" style={{ marginTop: 14 }}>Add questions</label>
          <div className="type-row">
            <button type="button" className={`type-chip ${!bulkMode ? "active" : ""}`} onClick={() => setBulkMode(false)}>One at a time</button>
            <button type="button" className={`type-chip ${bulkMode ? "active" : ""}`} onClick={() => setBulkMode(true)}>Paste several at once</button>
          </div>

          {!bulkMode ? (
            <>
              <label className="field-label" style={{ marginTop: 14 }}>Question text</label>
              <textarea className="field-input textarea" placeholder="e.g. The company was founded before 1990." value={prompt} onChange={(e) => setPrompt(e.target.value)} />
              <label className="field-label" style={{ marginTop: 14 }}>Correct answer</label>
              <div className="type-row">
                {["positive", "negative", "not_given"].map((key) => (
                  <button key={key} type="button" className={`type-chip ${correctAnswer === key ? "active" : ""}`} onClick={() => setCorrectAnswer(key)}>{tfLabels[key]}</button>
                ))}
              </div>
              {error && <div className="field-error">{error}</div>}
              <button className="btn-primary" style={{ marginTop: 16 }} disabled={!prompt.trim() || busy} onClick={createTrueFalse}>{busy ? "Saving…" : "Save question"}</button>
            </>
          ) : (
            <>
              <label className="field-label" style={{ marginTop: 14 }}>Paste your questions</label>
              <p className="field-hint" style={{ marginTop: 0, marginBottom: 8 }}>
                Numbered lines work best (e.g. "1. The company was founded before 1990."). If there are no numbers, one statement per paragraph or per line also works.
              </p>
              <textarea className="field-input textarea" style={{ minHeight: 140 }} placeholder={"1. First statement.\n2. Second statement.\n3. Third statement."} value={bulkText} onChange={(e) => setBulkText(e.target.value)} />

              {bulkText.trim() && tfBulkItems.length === 0 && (
                <div className="field-error">Couldn't separate your questions automatically. Try adding a number before each one (1., 2., 3.), or leave a blank line between them.</div>
              )}

              {tfBulkItems.length > 0 && (
                <div className="qe-bulk-preview">
                  <div className="field-label" style={{ marginTop: 14 }}>{tfBulkItems.length} question{tfBulkItems.length > 1 ? "s" : ""} detected — pick the correct answer for each</div>
                  {tfBulkItems.map((item) => (
                    <div key={item.key} className="qe-bulk-row">
                      <div className="qe-bulk-text">{item.text}</div>
                      <div className="type-row">
                        {["positive", "negative", "not_given"].map((key) => (
                          <button key={key} type="button" className={`type-chip ${bulkAnswers[item.key] === key ? "active" : ""}`} onClick={() => setBulkAnswers((prev) => ({ ...prev, [item.key]: key }))}>{tfLabels[key]}</button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {error && <div className="field-error">{error}</div>}
              <button className="btn-primary" style={{ marginTop: 16 }} disabled={!allTfBulkAnswered || busy} onClick={createBulkTrueFalse}>
                {busy ? "Saving…" : `Create ${tfBulkItems.length || ""} question${tfBulkItems.length > 1 ? "s" : ""}`}
              </button>
            </>
          )}
        </>
      )}

      {questionType === "multiple_choice" && (
        <>
          <label className="field-label" style={{ marginTop: 14 }}>Add questions</label>
          <div className="type-row">
            <button type="button" className={`type-chip ${!bulkMode ? "active" : ""}`} onClick={() => setBulkMode(false)}>One at a time</button>
            <button type="button" className={`type-chip ${bulkMode ? "active" : ""}`} onClick={() => setBulkMode(true)}>Paste several at once</button>
          </div>

          {!bulkMode ? (
            <>
              <label className="field-label" style={{ marginTop: 14 }}>Question text</label>
              <textarea className="field-input textarea" placeholder="e.g. What is the main advantage of vertical farming?" value={mcPrompt} onChange={(e) => setMcPrompt(e.target.value)} />
              <label className="field-label" style={{ marginTop: 14 }}>Choices</label>
              {choices.map((choice) => (
                <div key={choice.letter} className="qe-mc-choice-row">
                  <span className="qe-mc-letter">{choice.letter}</span>
                  <input className="field-input" placeholder={`Option ${choice.letter}…`} value={choice.text} onChange={(e) => updateChoiceText(choice.letter, e.target.value)} />
                  {choices.length > 2 && <button type="button" className="btn-ghost qe-mc-remove" onClick={() => removeChoice(choice.letter)}><X size={13} /></button>}
                </div>
              ))}
              <button type="button" className="btn-ghost" style={{ marginTop: 6 }} onClick={addChoice}><Plus size={13} /> Add option</button>
              <label className="field-label" style={{ marginTop: 14 }}>Correct answer</label>
              <div className="type-row">
                {choices.map((c) => (
                  <button key={c.letter} type="button" className={`type-chip ${mcCorrectLetter === c.letter ? "active" : ""}`} onClick={() => setMcCorrectLetter(c.letter)}>{c.letter}</button>
                ))}
              </div>
              {error && <div className="field-error">{error}</div>}
              <button className="btn-primary" style={{ marginTop: 16 }} disabled={!mcPrompt.trim() || choices.some((c) => !c.text.trim()) || busy} onClick={createMultipleChoice}>{busy ? "Saving…" : "Save question"}</button>
            </>
          ) : (
            <>
              <label className="field-label" style={{ marginTop: 14 }}>Paste your questions</label>
              <p className="field-hint" style={{ marginTop: 0, marginBottom: 8 }}>
                Number each question, with its options listed right below it — e.g. "1. What is..." then "A option one" / "B option two" on the following lines.
              </p>
              <textarea className="field-input textarea" style={{ minHeight: 200 }} placeholder={"1. What was the traditional view of trees?\nA They competed for resources.\nB They communicated constantly.\n\n2. What role do mother trees play?\nA They absorb insect attacks.\nB They distribute nutrients."} value={mcBulkText} onChange={(e) => setMcBulkText(e.target.value)} />

              {mcBulkText.trim() && mcBulkItems.length === 0 && (
                <div className="field-error">Couldn't detect any questions with their options. Make sure each question starts with a number (1., 2., 3.) and its options follow right below, starting with a letter (A, B, C…).</div>
              )}

              {mcBulkItems.length > 0 && (
                <div className="qe-bulk-preview">
                  <div className="field-label" style={{ marginTop: 14 }}>{mcBulkItems.length} question{mcBulkItems.length > 1 ? "s" : ""} detected — pick the correct answer for each</div>
                  {mcBulkItems.map((item) => (
                    <div key={item.key} className="qe-bulk-row">
                      <div className="qe-bulk-text">{item.prompt}</div>
                      {item.choices.map((c) => (
                        <div key={c.letter} className="qe-bulk-choice-line">{c.letter}. {c.text}</div>
                      ))}
                      <div className="type-row" style={{ marginTop: 8 }}>
                        {item.choices.map((c) => (
                          <button key={c.letter} type="button" className={`type-chip ${mcBulkAnswers[item.key] === c.letter ? "active" : ""}`} onClick={() => setMcBulkAnswers((prev) => ({ ...prev, [item.key]: c.letter }))}>{c.letter}</button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {error && <div className="field-error">{error}</div>}
              <button className="btn-primary" style={{ marginTop: 16 }} disabled={!allMcBulkAnswered || busy} onClick={createBulkMultipleChoice}>
                {busy ? "Saving…" : `Create ${mcBulkItems.length || ""} question${mcBulkItems.length > 1 ? "s" : ""}`}
              </button>
            </>
          )}
        </>
      )}

      {questionType === "multiple_selection" && (
        <>
          <label className="field-label" style={{ marginTop: 14 }}>Add questions</label>
          <div className="type-row">
            <button type="button" className={`type-chip ${!bulkMode ? "active" : ""}`} onClick={() => setBulkMode(false)}>One at a time</button>
            <button type="button" className={`type-chip ${bulkMode ? "active" : ""}`} onClick={() => setBulkMode(true)}>Paste several at once</button>
          </div>

          {!bulkMode ? (
            <>
              <label className="field-label" style={{ marginTop: 14 }}>Question text</label>
              <textarea className="field-input textarea" placeholder="e.g. Which TWO advantages of geothermal energy are mentioned?" value={msPrompt} onChange={(e) => setMsPrompt(e.target.value)} />

              <label className="field-label" style={{ marginTop: 14 }}>How many correct answers?</label>
              <input
                type="number"
                min="2"
                max={msChoices.length}
                className="field-input"
                style={{ maxWidth: 100 }}
                value={msRequiredCount}
                onChange={(e) => {
                  const n = parseInt(e.target.value, 10) || 2;
                  setMsRequiredCount(n);
                  setMsCorrectLetters((prev) => prev.slice(0, n));
                }}
              />

              <label className="field-label" style={{ marginTop: 14 }}>Choices</label>
              {msChoices.map((choice) => (
                <div key={choice.letter} className="qe-mc-choice-row">
                  <span className="qe-mc-letter">{choice.letter}</span>
                  <input className="field-input" placeholder={`Option ${choice.letter}…`} value={choice.text} onChange={(e) => updateMsChoiceText(choice.letter, e.target.value)} />
                  {msChoices.length > 2 && <button type="button" className="btn-ghost qe-mc-remove" onClick={() => removeMsChoice(choice.letter)}><X size={13} /></button>}
                </div>
              ))}
              <button type="button" className="btn-ghost" style={{ marginTop: 6 }} onClick={addMsChoice}><Plus size={13} /> Add option</button>

              <label className="field-label" style={{ marginTop: 14 }}>Correct answers ({msCorrectLetters.length} / {msRequiredCount} selected)</label>
              <div className="type-row">
                {msChoices.map((c) => (
                  <button key={c.letter} type="button" className={`type-chip ${msCorrectLetters.includes(c.letter) ? "active" : ""}`} onClick={() => toggleMsCorrect(c.letter)}>{c.letter}</button>
                ))}
              </div>

              {error && <div className="field-error">{error}</div>}
              <button
                className="btn-primary"
                style={{ marginTop: 16 }}
                disabled={!msPrompt.trim() || msChoices.some((c) => !c.text.trim()) || msCorrectLetters.length !== msRequiredCount || busy}
                onClick={createMultipleSelection}
              >
                {busy ? "Saving…" : "Save question"}
              </button>
            </>
          ) : (
            <>
              <label className="field-label" style={{ marginTop: 14 }}>Paste your questions</label>
              <p className="field-hint" style={{ marginTop: 0, marginBottom: 8 }}>
                Number each question, with its options listed right below it. The number of correct answers can be different for each question.
              </p>
              <textarea className="field-input textarea" style={{ minHeight: 200 }} placeholder={"20. Which TWO pieces of information are mentioned?\nA Not everyone used gold as payment.\nB Items were placed near royal burials.\nC The most valuable item was a sceptre.\nD A decoration style was shared with another kingdom.\nE Working with gold was respected."} value={msBulkText} onChange={(e) => setMsBulkText(e.target.value)} />

              {msBulkText.trim() && msBulkItems.length === 0 && (
                <div className="field-error">Couldn't detect any questions with their options. Make sure each question starts with a number, and its options follow right below, starting with a letter.</div>
              )}

              {msBulkItems.length > 0 && (
                <div className="qe-bulk-preview">
                  <div className="field-label" style={{ marginTop: 14 }}>{msBulkItems.length} question{msBulkItems.length > 1 ? "s" : ""} detected</div>
                  {msBulkItems.map((item) => {
                    const cfg = msBulkConfig[item.key] || { requiredCount: 2, correctLetters: [] };
                    return (
                      <div key={item.key} className="qe-bulk-row">
                        <div className="qe-bulk-text">{item.prompt}</div>
                        {item.choices.map((c) => (
                          <div key={c.letter} className="qe-bulk-choice-line">{c.letter}. {c.text}</div>
                        ))}
                        <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 10 }}>
                          <span className="field-label" style={{ margin: 0 }}>Correct answers needed:</span>
                          <input
                            type="number"
                            min="2"
                            max={item.choices.length}
                            className="field-input"
                            style={{ maxWidth: 70 }}
                            value={cfg.requiredCount}
                            onChange={(e) => updateMsBulkRequiredCount(item.key, parseInt(e.target.value, 10) || 2)}
                          />
                        </div>
                        <div className="type-row" style={{ marginTop: 8 }}>
                          {item.choices.map((c) => (
                            <button key={c.letter} type="button" className={`type-chip ${cfg.correctLetters.includes(c.letter) ? "active" : ""}`} onClick={() => toggleMsBulkCorrect(item.key, c.letter)}>{c.letter}</button>
                          ))}
                        </div>
                        <div className="field-hint" style={{ marginTop: 4 }}>{cfg.correctLetters.length} / {cfg.requiredCount} selected</div>
                      </div>
                    );
                  })}
                </div>
              )}

              {error && <div className="field-error">{error}</div>}
              <button className="btn-primary" style={{ marginTop: 16 }} disabled={!allMsBulkConfigured || busy} onClick={createBulkMultipleSelection}>
                {busy ? "Saving…" : `Create ${msBulkItems.length || ""} question${msBulkItems.length > 1 ? "s" : ""}`}
              </button>
            </>
          )}
        </>
      )}
    </div>
  );
}
