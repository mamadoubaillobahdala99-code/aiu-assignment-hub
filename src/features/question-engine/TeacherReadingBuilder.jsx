import React, { useState } from "react";
import { Plus, X, Check } from "lucide-react";
import { supabase } from "../../supabaseClient";
import { TeacherQuestionForm } from "./TeacherQuestionForm";
import { guessPassageTitle, defaultInstructionFor } from "./bulkParse";

export function TeacherReadingBuilder({ classId, teacherId, setScreen, showToast }) {
  const [title, setTitle] = useState("");
  const [titleTouched, setTitleTouched] = useState(false);
  const [dueDate, setDueDate] = useState("");
  const [timeLimit, setTimeLimit] = useState("60");
  const [passageText, setPassageText] = useState("");
  const [sections, setSections] = useState([]); // [{ localId, title, instruction, questions: [] }]
  const [addingQuestionFor, setAddingQuestionFor] = useState(null);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState("");

  function handlePassageChange(text) {
    setPassageText(text);
    // Only ever suggest a title if the teacher hasn't typed one themselves.
    if (!titleTouched) {
      const guess = guessPassageTitle(text);
      if (guess) setTitle(guess);
    }
  }

  function handleTitleChange(text) {
    setTitle(text);
    setTitleTouched(true);
  }

  function addSection() {
    setSections((prev) => [
      ...prev,
      { localId: crypto.randomUUID(), title: `Part ${prev.length + 1}`, instruction: "", questions: [] },
    ]);
  }

  function renameSection(localId, newTitle) {
    setSections((prev) => prev.map((s) => (s.localId === localId ? { ...s, title: newTitle } : s)));
  }

  function updateInstruction(localId, text) {
    setSections((prev) => prev.map((s) => (s.localId === localId ? { ...s, instruction: text } : s)));
  }

  function removeSection(localId) {
    setSections((prev) => prev.filter((s) => s.localId !== localId));
  }

  function onQuestionCreated(localId, question) {
    setSections((prev) =>
      prev.map((s) => {
        if (s.localId !== localId) return s;
        // The first question added to a section suggests that section's
        // instruction line automatically — always editable afterwards.
        const instruction = s.questions.length === 0 && !s.instruction
          ? defaultInstructionFor(question.type, question.options)
          : s.instruction;
        return { ...s, instruction, questions: [...s.questions, question] };
      })
    );
    setAddingQuestionFor(null);
  }

  const canPublish =
    title.trim() && passageText.trim() && sections.length > 0 && sections.every((s) => s.questions.length > 0);

  async function publish() {
    setError("");
    if (!canPublish) return;
    setPublishing(true);

    const { data: assignment, error: aError } = await supabase
      .from("assignments")
      .insert({
        class_id: classId,
        title: title.trim(),
        type: "Reading",
        description: passageText.trim(),
        due_date: dueDate || null,
        time_limit_minutes: timeLimit ? parseInt(timeLimit, 10) : null,
      })
      .select()
      .single();

    if (aError || !assignment) {
      setPublishing(false);
      setError("Could not create the assignment: " + (aError?.message || "unknown error"));
      return;
    }

    for (let i = 0; i < sections.length; i++) {
      const section = sections[i];
      const { data: sectionRow, error: sError } = await supabase
        .from("exam_sections")
        .insert({ assignment_id: assignment.id, title: section.title, instruction: section.instruction || null, order_index: i })
        .select()
        .single();

      if (sError || !sectionRow) {
        setPublishing(false);
        setError("Assignment created, but a section failed to save: " + sError?.message);
        return;
      }

      const links = section.questions.map((q, qi) => ({
        section_id: sectionRow.id,
        question_id: q.id,
        order_index: qi,
      }));
      const { error: linkError } = await supabase.from("assignment_questions").insert(links);
      if (linkError) {
        setPublishing(false);
        setError("Assignment created, but linking questions failed: " + linkError.message);
        return;
      }
    }

    setPublishing(false);
    showToast?.("Reading assignment published");
    setScreen({ name: "class", classId });
  }

  return (
    <div className="page">
      <div className="eyebrow">Structured Reading</div>
      <h1 className="page-title">New Reading assignment</h1>

      <label className="field-label" style={{ marginTop: 16 }}>Title</label>
      <input className="field-input" placeholder="e.g. Reading Passage — Renewable Energy" value={title} onChange={(e) => handleTitleChange(e.target.value)} />

      <div style={{ display: "flex", gap: 16, marginTop: 14 }}>
        <div style={{ flex: 1 }}>
          <label className="field-label">Due date (optional)</label>
          <input type="date" className="field-input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
        <div style={{ flex: 1 }}>
          <label className="field-label">Time limit, minutes (optional)</label>
          <input type="number" min="1" className="field-input" value={timeLimit} onChange={(e) => setTimeLimit(e.target.value)} />
        </div>
      </div>

      <label className="field-label" style={{ marginTop: 14 }}>Passage text</label>
      <p className="field-hint" style={{ marginTop: 0, marginBottom: 8 }}>If the first line looks like a title, it'll fill in the Title field above automatically — you can always change it.</p>
      <textarea
        className="field-input textarea"
        style={{ minHeight: 180 }}
        placeholder="Paste the full reading passage here…"
        value={passageText}
        onChange={(e) => handlePassageChange(e.target.value)}
      />

      <h3 className="section-title" style={{ marginTop: 28 }}>Sections</h3>

      {sections.map((section) => (
        <div key={section.localId} className="feedback-panel" style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <input
              className="field-input"
              style={{ maxWidth: 220 }}
              value={section.title}
              onChange={(e) => renameSection(section.localId, e.target.value)}
            />
            <button className="btn-ghost" onClick={() => removeSection(section.localId)}><X size={13} /> Remove section</button>
          </div>

          <label className="field-label">Instructions shown to students</label>
          <input
            className="field-input"
            placeholder="Appears automatically once you add the first question below"
            value={section.instruction}
            onChange={(e) => updateInstruction(section.localId, e.target.value)}
          />

          <div style={{ marginTop: 14 }}>
            {section.questions.length === 0 ? (
              <p className="empty-inline">No questions yet in this section.</p>
            ) : (
              <div className="qe-question-list">
                {section.questions.map((q, i) => (
                  <div key={q.id} className="qe-question-row">
                    <Check size={14} className="qe-question-check" />
                    <span>{i + 1}. {q.prompt}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {addingQuestionFor === section.localId ? (
            <div style={{ marginTop: 12 }}>
              <TeacherQuestionForm
                teacherId={teacherId}
                skill="reading"
                onCreated={(q) => onQuestionCreated(section.localId, q)}
              />
              <button className="btn-ghost" style={{ marginTop: 8 }} onClick={() => setAddingQuestionFor(null)}>Cancel</button>
            </div>
          ) : (
            <button className="btn-ghost" style={{ marginTop: 10 }} onClick={() => setAddingQuestionFor(section.localId)}>
              <Plus size={13} /> Add question
            </button>
          )}
        </div>
      ))}

      <button className="btn-ghost" onClick={addSection}><Plus size={14} /> Add section</button>

      {error && <div className="field-error" style={{ marginTop: 16 }}>{error}</div>}

      <button className="btn-primary" style={{ marginTop: 24 }} disabled={!canPublish || publishing} onClick={publish}>
        {publishing ? "Publishing…" : "Publish assignment"}
      </button>
    </div>
  );
}
