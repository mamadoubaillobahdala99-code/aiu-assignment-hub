import React, { useState, useMemo } from "react";
import { Plus, X, Check } from "lucide-react";
import { supabase } from "../../supabaseClient";
import { TeacherQuestionForm } from "./TeacherQuestionForm";
import { defaultInstructionFor } from "./bulkParse";
import { AudioFilePicker } from "./AudioFilePicker";
import { SummaryCompletionBuilder, NotesCompletionBuilder, TableCompletionBuilder } from "./TeacherReadingBuilder";

const MAX_LISTENING_PARTS = 4;

function newGroup() {
  return { localId: crypto.randomUUID(), instruction: "", mode: "questions", completionStyle: "paragraph", questions: [], summaryText: "" };
}
function newPart() {
  return { localId: crypto.randomUUID(), audioUrl: "", audioFilename: "", maxPlays: "", groups: [newGroup()] };
}

export function TeacherListeningBuilder({ classId, teacherId, setScreen, showToast }) {
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [timeLimit, setTimeLimit] = useState("60");
  const [parts, setParts] = useState([newPart()]);
  const [addingQuestionFor, setAddingQuestionFor] = useState(null);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState("");

  function handleAudioChange(partLocalId, f) {
    setParts((prev) => prev.map((p) => (p.localId === partLocalId ? { ...p, audioUrl: f?.url || "", audioFilename: f?.filename || "" } : p)));
  }
  function handleMaxPlaysChange(partLocalId, value) {
    setParts((prev) => prev.map((p) => (p.localId === partLocalId ? { ...p, maxPlays: value } : p)));
  }

  function addPart() {
    if (parts.length >= MAX_LISTENING_PARTS) return;
    setParts((prev) => [...prev, newPart()]);
  }
  function removePart(partLocalId) {
    setParts((prev) => (prev.length > 1 ? prev.filter((p) => p.localId !== partLocalId) : prev));
  }

  function addGroup(partLocalId) {
    setParts((prev) => prev.map((p) => (p.localId === partLocalId ? { ...p, groups: [...p.groups, newGroup()] } : p)));
  }
  function removeGroup(partLocalId, groupLocalId) {
    setParts((prev) => prev.map((p) => (p.localId === partLocalId ? { ...p, groups: p.groups.filter((g) => g.localId !== groupLocalId) } : p)));
  }
  function updateInstruction(partLocalId, groupLocalId, text) {
    setParts((prev) =>
      prev.map((p) =>
        p.localId !== partLocalId ? p : { ...p, groups: p.groups.map((g) => (g.localId === groupLocalId ? { ...g, instruction: text } : g)) }
      )
    );
  }
  function setGroupMode(partLocalId, groupLocalId, mode) {
    setParts((prev) =>
      prev.map((p) =>
        p.localId !== partLocalId ? p : { ...p, groups: p.groups.map((g) => (g.localId === groupLocalId ? { ...g, mode, questions: [], summaryText: "" } : g)) }
      )
    );
  }
  function setCompletionStyle(partLocalId, groupLocalId, completionStyle) {
    setParts((prev) =>
      prev.map((p) =>
        p.localId !== partLocalId
          ? p
          : { ...p, groups: p.groups.map((g) => (g.localId === groupLocalId ? { ...g, completionStyle, questions: [], summaryText: "" } : g)) }
      )
    );
  }
  function updateSummaryText(partLocalId, groupLocalId, text) {
    setParts((prev) =>
      prev.map((p) =>
        p.localId !== partLocalId ? p : { ...p, groups: p.groups.map((g) => (g.localId === groupLocalId ? { ...g, summaryText: text } : g)) }
      )
    );
  }
  function onQuestionCreated(partLocalId, groupLocalId, question) {
    setParts((prev) =>
      prev.map((p) =>
        p.localId !== partLocalId
          ? p
          : {
              ...p,
              groups: p.groups.map((g) => {
                if (g.localId !== groupLocalId) return g;
                const instruction = g.questions.length === 0 && !g.instruction ? defaultInstructionFor(question.type, question.options) : g.instruction;
                return { ...g, instruction, questions: [...g.questions, question] };
              }),
            }
      )
    );
    setAddingQuestionFor(null);
  }
  function onBlanksCreated(partLocalId, groupLocalId, questions) {
    setParts((prev) =>
      prev.map((p) =>
        p.localId !== partLocalId ? p : { ...p, groups: p.groups.map((g) => (g.localId === groupLocalId ? { ...g, questions } : g)) }
      )
    );
  }

  // Continuous numbering across every part, in order — never resets.
  const numbering = useMemo(() => {
    let counter = 0;
    const perPart = [];
    for (const part of parts) {
      const perGroup = [];
      for (const group of part.groups) {
        const start = counter + 1;
        counter += group.questions.length;
        perGroup.push({ start, end: counter });
      }
      perPart.push(perGroup);
    }
    return perPart;
  }, [parts]);

  const canPublish =
    title.trim() &&
    parts.every(
      (p) =>
        p.audioUrl &&
        p.groups.length > 0 &&
        p.groups.every((g) => (g.mode === "completion" ? g.summaryText.trim() && g.questions.length > 0 : g.questions.length > 0))
    );

  async function publish() {
    setError("");
    if (!canPublish) return;
    setPublishing(true);

    const { data: assignment, error: aError } = await supabase
      .from("assignments")
      .insert({
        class_id: classId,
        title: title.trim(),
        type: "Listening",
        description: null,
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

    for (let pi = 0; pi < parts.length; pi++) {
      const part = parts[pi];
      const { data: sectionRow, error: sError } = await supabase
        .from("exam_sections")
        .insert({
          assignment_id: assignment.id,
          title: `Part ${pi + 1}`,
          audio_url: part.audioUrl,
          max_plays: part.maxPlays ? parseInt(part.maxPlays, 10) : null,
          order_index: pi,
        })
        .select()
        .single();

      if (sError || !sectionRow) {
        setPublishing(false);
        setError(`Assignment created, but Part ${pi + 1} failed to save: ` + sError?.message);
        return;
      }

      for (let gi = 0; gi < part.groups.length; gi++) {
        const group = part.groups[gi];
        const { data: groupRow, error: gError } = await supabase
          .from("question_groups")
          .insert({
            section_id: sectionRow.id,
            instruction: group.instruction || null,
            passage_text: group.mode === "completion" ? group.summaryText.trim() : null,
            order_index: gi,
          })
          .select()
          .single();

        if (gError || !groupRow) {
          setPublishing(false);
          setError(`Assignment created, but a question group in Part ${pi + 1} failed to save: ` + gError?.message);
          return;
        }

        const links = group.questions.map((q, qi) => ({
          section_id: sectionRow.id,
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
    }

    setPublishing(false);
    showToast?.("Listening assignment published");
    setScreen({ name: "class", classId });
  }

  return (
    <div className="page page-wide">
      <div className="eyebrow">Structured Listening</div>
      <h1 className="page-title">New Listening assignment</h1>

      <label className="field-label" style={{ marginTop: 16 }}>Title</label>
      <input className="field-input" placeholder="e.g. IELTS Listening Practice Test 1" value={title} onChange={(e) => setTitle(e.target.value)} />

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

      {parts.map((part, pi) => (
        <div key={part.localId} className="qe-part-block">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 28 }}>
            <h3 className="section-title" style={{ margin: 0 }}>Part {pi + 1}</h3>
            {parts.length > 1 && (
              <button className="btn-ghost" onClick={() => removePart(part.localId)}><X size={13} /> Remove this part</button>
            )}
          </div>

          <label className="field-label" style={{ marginTop: 14 }}>Audio file</label>
          <AudioFilePicker
            teacherId={teacherId}
            value={part.audioUrl ? { url: part.audioUrl, filename: part.audioFilename } : null}
            onChange={(f) => handleAudioChange(part.localId, f)}
          />

          <label className="field-label" style={{ marginTop: 14 }}>Plays allowed (leave blank for unlimited)</label>
          <input
            type="number"
            min="1"
            className="field-input"
            style={{ maxWidth: 160 }}
            placeholder="Unlimited"
            value={part.maxPlays}
            onChange={(e) => handleMaxPlaysChange(part.localId, e.target.value)}
          />

          <h4 className="section-title" style={{ marginTop: 20, fontSize: 14 }}>Question groups</h4>

          {part.groups.map((group, gi) => (
            <div key={group.localId} className="feedback-panel" style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <span className="qe-group-heading-preview">
                  {group.questions.length > 0
                    ? group.questions.length === 1
                      ? `Question ${numbering[pi][gi].start}`
                      : `Questions ${numbering[pi][gi].start}-${numbering[pi][gi].end}`
                    : "New group"}
                </span>
                <button className="btn-ghost" onClick={() => removeGroup(part.localId, group.localId)}><X size={13} /> Remove group</button>
              </div>

              <label className="field-label">Instructions shown to students</label>
              <textarea
                className="field-input textarea"
                style={{ minHeight: 90 }}
                placeholder="Appears automatically once you add the first question below"
                value={group.instruction}
                onChange={(e) => updateInstruction(part.localId, group.localId, e.target.value)}
              />

              {group.questions.length === 0 && (
                <>
                  <label className="field-label" style={{ marginTop: 14 }}>Group type</label>
                  <div className="type-row">
                    <button type="button" className={`type-chip ${group.mode === "questions" ? "active" : ""}`} onClick={() => setGroupMode(part.localId, group.localId, "questions")}>Question list</button>
                    <button type="button" className={`type-chip ${group.mode === "completion" ? "active" : ""}`} onClick={() => setGroupMode(part.localId, group.localId, "completion")}>Summary Completion</button>
                  </div>

                  {group.mode === "completion" && (
                    <>
                      <label className="field-label" style={{ marginTop: 14 }}>Completion style</label>
                      <div className="type-row">
                        <button type="button" className={`type-chip ${group.completionStyle === "paragraph" ? "active" : ""}`} onClick={() => setCompletionStyle(part.localId, group.localId, "paragraph")}>Plain text</button>
                        <button type="button" className={`type-chip ${group.completionStyle === "notes" ? "active" : ""}`} onClick={() => setCompletionStyle(part.localId, group.localId, "notes")}>Notes</button>
                        <button type="button" className={`type-chip ${group.completionStyle === "table" ? "active" : ""}`} onClick={() => setCompletionStyle(part.localId, group.localId, "table")}>Table</button>
                      </div>
                    </>
                  )}
                </>
              )}

              {group.mode === "completion" ? (
                group.completionStyle === "notes" ? (
                  <NotesCompletionBuilder
                    group={group}
                    teacherId={teacherId}
                    skill="listening"
                    onSummaryTextChange={(text) => updateSummaryText(part.localId, group.localId, text)}
                    onBlanksCreated={(questions) => onBlanksCreated(part.localId, group.localId, questions)}
                  />
                ) : group.completionStyle === "table" ? (
                  <TableCompletionBuilder
                    group={group}
                    teacherId={teacherId}
                    skill="listening"
                    onSummaryTextChange={(text) => updateSummaryText(part.localId, group.localId, text)}
                    onBlanksCreated={(questions) => onBlanksCreated(part.localId, group.localId, questions)}
                  />
                ) : (
                  <SummaryCompletionBuilder
                    group={group}
                    teacherId={teacherId}
                    skill="listening"
                    onSummaryTextChange={(text) => updateSummaryText(part.localId, group.localId, text)}
                    onBlanksCreated={(questions) => onBlanksCreated(part.localId, group.localId, questions)}
                  />
                )
              ) : (
                <>
                  <div style={{ marginTop: 14 }}>
                    {group.questions.length === 0 ? (
                      <p className="empty-inline">No questions yet in this group.</p>
                    ) : (
                      <div className="qe-question-list">
                        {group.questions.map((q, i) => (
                          <div key={q.id} className="qe-question-row"><Check size={14} className="qe-question-check" /><span>{numbering[pi][gi].start + i}. {q.prompt}</span></div>
                        ))}
                      </div>
                    )}
                  </div>

                  {addingQuestionFor === group.localId ? (
                    <div style={{ marginTop: 12 }}>
                      <TeacherQuestionForm teacherId={teacherId} skill="listening" onCreated={(q) => onQuestionCreated(part.localId, group.localId, q)} />
                      <button className="btn-ghost" style={{ marginTop: 8 }} onClick={() => setAddingQuestionFor(null)}>Cancel</button>
                    </div>
                  ) : (
                    <button className="btn-ghost" style={{ marginTop: 10 }} onClick={() => setAddingQuestionFor(group.localId)}><Plus size={13} /> Add question</button>
                  )}
                </>
              )}
            </div>
          ))}

          <button className="btn-ghost" onClick={() => addGroup(part.localId)}><Plus size={14} /> Add question group</button>
        </div>
      ))}

      {parts.length < MAX_LISTENING_PARTS && (
        <button className="btn-ghost" style={{ marginTop: 20 }} onClick={addPart}><Plus size={14} /> Add another part (Part {parts.length + 1})</button>
      )}

      {error && <div className="field-error" style={{ marginTop: 16 }}>{error}</div>}

      <button className="btn-primary" style={{ marginTop: 24 }} disabled={!canPublish || publishing} onClick={publish}>
        {publishing ? "Publishing…" : "Publish assignment"}
      </button>
    </div>
  );
}
