import React, { useState, useMemo } from "react";
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
  const [groups, setGroups] = useState([]);
  // group: { localId, instruction, mode: "questions"|"completion",
  //          questions: [], summaryText: "" (completion mode only) }
  const [addingQuestionFor, setAddingQuestionFor] = useState(null);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState("");

  function handlePassageChange(text) {
    setPassageText(text);
    if (!titleTouched) {
      const guess = guessPassageTitle(text);
      if (guess) setTitle(guess);
    }
  }

  function handleTitleChange(text) {
    setTitle(text);
    setTitleTouched(true);
  }

  function addGroup() {
    setGroups((prev) => [
      ...prev,
      { localId: crypto.randomUUID(), instruction: "", mode: "questions", questions: [], summaryText: "" },
    ]);
  }

  function updateInstruction(localId, text) {
    setGroups((prev) => prev.map((g) => (g.localId === localId ? { ...g, instruction: text } : g)));
  }

  function setGroupMode(localId, mode) {
    setGroups((prev) => prev.map((g) => (g.localId === localId ? { ...g, mode, questions: [], summaryText: "" } : g)));
  }

  function updateSummaryText(localId, text) {
    setGroups((prev) => prev.map((g) => (g.localId === localId ? { ...g, summaryText: text } : g)));
  }

  function removeGroup(localId) {
    setGroups((prev) => prev.filter((g) => g.localId !== localId));
  }

  function onQuestionCreated(localId, question) {
    setGroups((prev) =>
      prev.map((g) => {
        if (g.localId !== localId) return g;
        const instruction = g.questions.length === 0 && !g.instruction
          ? defaultInstructionFor(question.type, question.options)
          : g.instruction;
        return { ...g, instruction, questions: [...g.questions, question] };
      })
    );
    setAddingQuestionFor(null);
  }

  // Running question count so each group can preview its own
  // "Questions X-Y" heading, exactly as it will appear to students.
  const groupRanges = useMemo(() => {
    let counter = 0;
    return groups.map((g) => {
      const start = counter + 1;
      counter += g.questions.length;
      return { start, end: counter };
    });
  }, [groups]);

  const canPublish =
    title.trim() &&
    passageText.trim() &&
    groups.length > 0 &&
    groups.every((g) => (g.mode === "completion" ? g.summaryText.trim() && g.questions.length > 0 : g.questions.length > 0));

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

    // One passage container for now (Step B will allow up to 3).
    const { data: sectionRow, error: sError } = await supabase
      .from("exam_sections")
      .insert({ assignment_id: assignment.id, title: "Part 1", order_index: 0 })
      .select()
      .single();

    if (sError || !sectionRow) {
      setPublishing(false);
      setError("Assignment created, but the passage failed to save: " + sError?.message);
      return;
    }

    for (let i = 0; i < groups.length; i++) {
      const group = groups[i];
      const { data: groupRow, error: gError } = await supabase
        .from("question_groups")
        .insert({
          section_id: sectionRow.id,
          instruction: group.instruction || null,
          passage_text: group.mode === "completion" ? group.summaryText.trim() : null,
          order_index: i,
        })
        .select()
        .single();

      if (gError || !groupRow) {
        setPublishing(false);
        setError("Assignment created, but a question group failed to save: " + gError?.message);
        return;
      }

      const links = group.questions.map((q, qi) => ({
        section_id: sectionRow.id, // kept for backward compatibility
        group_id: groupRow.id,
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

      <h3 className="section-title" style={{ marginTop: 28 }}>Question groups</h3>
      <p className="field-hint" style={{ marginTop: 0 }}>Add as many groups as you need — each can be a different question type with its own instruction, stacked one after another, just like a real IELTS passage.</p>

      {groups.map((group, gi) => (
        <div key={group.localId} className="feedback-panel" style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <span className="qe-group-heading-preview">
              {group.questions.length > 0
                ? group.questions.length === 1
                  ? `Question ${groupRanges[gi].start}`
                  : `Questions ${groupRanges[gi].start}-${groupRanges[gi].end}`
                : "New group"}
            </span>
            <button className="btn-ghost" onClick={() => removeGroup(group.localId)}><X size={13} /> Remove group</button>
          </div>

          <label className="field-label">Instructions shown to students</label>
          <textarea
            className="field-input textarea"
            style={{ minHeight: 90 }}
            placeholder="Appears automatically once you add the first question below"
            value={group.instruction}
            onChange={(e) => updateInstruction(group.localId, e.target.value)}
          />

          {group.questions.length === 0 && (
            <>
              <label className="field-label" style={{ marginTop: 14 }}>Group type</label>
              <div className="type-row">
                <button type="button" className={`type-chip ${group.mode === "questions" ? "active" : ""}`} onClick={() => setGroupMode(group.localId, "questions")}>
                  Question list
                </button>
                <button type="button" className={`type-chip ${group.mode === "completion" ? "active" : ""}`} onClick={() => setGroupMode(group.localId, "completion")}>
                  Summary Completion
                </button>
              </div>
            </>
          )}

          {group.mode === "completion" ? (
            <SummaryCompletionBuilder
              group={group}
              teacherId={teacherId}
              onSummaryTextChange={(text) => updateSummaryText(group.localId, text)}
              onBlanksCreated={(questions) =>
                setGroups((prev) => prev.map((g) => (g.localId === group.localId ? { ...g, questions } : g)))
              }
            />
          ) : (
            <>
              <div style={{ marginTop: 14 }}>
                {group.questions.length === 0 ? (
                  <p className="empty-inline">No questions yet in this group.</p>
                ) : (
                  <div className="qe-question-list">
                    {group.questions.map((q, i) => (
                      <div key={q.id} className="qe-question-row">
                        <Check size={14} className="qe-question-check" />
                        <span>{groupRanges[gi].start + i}. {q.prompt}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {addingQuestionFor === group.localId ? (
                <div style={{ marginTop: 12 }}>
                  <TeacherQuestionForm
                    teacherId={teacherId}
                    skill="reading"
                    onCreated={(q) => onQuestionCreated(group.localId, q)}
                  />
                  <button className="btn-ghost" style={{ marginTop: 8 }} onClick={() => setAddingQuestionFor(null)}>Cancel</button>
                </div>
              ) : (
                <button className="btn-ghost" style={{ marginTop: 10 }} onClick={() => setAddingQuestionFor(group.localId)}>
                  <Plus size={13} /> Add question
                </button>
              )}
            </>
          )}
        </div>
      ))}

      <button className="btn-ghost" onClick={addGroup}><Plus size={14} /> Add question group</button>

      {error && <div className="field-error" style={{ marginTop: 16 }}>{error}</div>}

      <button className="btn-primary" style={{ marginTop: 24 }} disabled={!canPublish || publishing} onClick={publish}>
        {publishing ? "Publishing…" : "Publish assignment"}
      </button>
    </div>
  );
}

// ---------- Summary Completion builder, local to this file ----------
function SummaryCompletionBuilder({ group, teacherId, onSummaryTextChange, onBlanksCreated }) {
  const [localText, setLocalText] = useState(group.summaryText);
  const [accepted, setAccepted] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const blankCount = useMemo(() => Math.max(0, localText.split(/_{3,}/).length - 1), [localText]);
  const alreadyCreated = group.questions.length > 0;
  const allFilled = blankCount > 0 && Array.from({ length: blankCount }).every((_, i) => (accepted[i] || "").trim());

  function handleTextChange(text) {
    setLocalText(text);
    onSummaryTextChange(text);
  }

  async function createBlanks() {
    if (!allFilled) return;
    setBusy(true);
    setError("");
    const created = [];
    for (let i = 0; i < blankCount; i++) {
      const alternatives = accepted[i].split(",").map((a) => a.trim()).filter(Boolean);
      const { data: question, error: qError } = await supabase
        .from("questions")
        .insert({ teacher_id: teacherId, type: "gap_fill", skill: "reading", prompt: `Gap ${i + 1}`, options: {} })
        .select()
        .single();
      if (qError || !question) {
        setBusy(false);
        setError(`Stopped at blank ${i + 1}: ` + (qError?.message || "unknown error"));
        return;
      }
      const { error: kError } = await supabase.from("question_answer_key").insert({ question_id: question.id, correct_answer: alternatives });
      if (kError) {
        setBusy(false);
        setError(`Blank ${i + 1} created, but its answer key failed: ` + kError.message);
        return;
      }
      created.push(question);
    }
    setBusy(false);
    onBlanksCreated(created);
  }

  if (alreadyCreated) {
    return (
      <div style={{ marginTop: 14 }}>
        <p className="qe-completion-text" style={{ marginBottom: 8 }}>{group.summaryText}</p>
        <div className="qe-question-list">
          {group.questions.map((q, i) => <div key={q.id} className="qe-question-row"><Check size={14} className="qe-question-check" /><span>Blank {i + 1} — answer saved</span></div>)}
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginTop: 14 }}>
      <label className="field-label">Summary text</label>
      <p className="field-hint" style={{ marginTop: 0, marginBottom: 8 }}>Mark each blank with three or more underscores, e.g. "The community's ___ is indicated by…"</p>
      <textarea className="field-input textarea" style={{ minHeight: 140 }} placeholder="Paste your summary paragraph with ___ for each blank…" value={localText} onChange={(e) => handleTextChange(e.target.value)} />

      {blankCount > 0 && (
        <div className="qe-bulk-preview">
          <div className="field-label" style={{ marginTop: 14 }}>{blankCount} blank{blankCount > 1 ? "s" : ""} detected — enter the accepted answer(s) for each</div>
          {Array.from({ length: blankCount }).map((_, i) => (
            <div key={i} className="qe-bulk-row">
              <div className="qe-bulk-text">Blank {i + 1}</div>
              <input
                className="field-input"
                placeholder="e.g. prosperity, size (comma-separated if more than one is accepted)"
                value={accepted[i] || ""}
                onChange={(e) => setAccepted((prev) => ({ ...prev, [i]: e.target.value }))}
              />
            </div>
          ))}
        </div>
      )}

      {error && <div className="field-error">{error}</div>}

      <button className="btn-primary" style={{ marginTop: 16 }} disabled={!allFilled || busy} onClick={createBlanks}>
        {busy ? "Saving…" : `Save ${blankCount || ""} blank${blankCount > 1 ? "s" : ""}`}
      </button>
    </div>
  );
}
