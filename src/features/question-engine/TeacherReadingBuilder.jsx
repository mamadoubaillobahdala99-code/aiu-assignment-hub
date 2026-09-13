import React, { useState, useMemo } from "react";
import { Plus, X, Check } from "lucide-react";
import { supabase } from "../../supabaseClient";
import { TeacherQuestionForm } from "./TeacherQuestionForm";
import { guessPassageTitle, defaultInstructionFor, parseNotesMarkdown, countBlanksInTexts, parseCompletionPayload } from "./bulkParse";
import { NotesCompletion } from "./NotesCompletion";
import { TableCompletion } from "./TableCompletion";

function newGroup() {
  return { localId: crypto.randomUUID(), instruction: "", mode: "questions", completionStyle: "paragraph", questions: [], summaryText: "" };
}
function newPart() {
  return { localId: crypto.randomUUID(), passageText: "", passageTitle: "", titleTouched: false, groups: [newGroup()] };
}

export function TeacherReadingBuilder({ classId, teacherId, setScreen, showToast }) {
  const [title, setTitle] = useState("");
  const [titleTouched, setTitleTouched] = useState(false);
  const [dueDate, setDueDate] = useState("");
  const [timeLimit, setTimeLimit] = useState("60");
  const [parts, setParts] = useState([newPart()]);
  const [addingQuestionFor, setAddingQuestionFor] = useState(null); // groupLocalId
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState("");

  function handlePassageChange(partLocalId, text) {
    setParts((prev) =>
      prev.map((p) => {
        if (p.localId !== partLocalId) return p;
        const guess = !p.titleTouched ? guessPassageTitle(text) : p.passageTitle;
        return { ...p, passageText: text, passageTitle: guess || p.passageTitle };
      })
    );
    // The very first passage also suggests the overall assignment name, separately.
    if (partLocalId === parts[0].localId && !titleTouched) {
      const guess = guessPassageTitle(text);
      if (guess) setTitle(guess);
    }
  }

  function handlePassageTitleChange(partLocalId, text) {
    setParts((prev) => prev.map((p) => (p.localId === partLocalId ? { ...p, passageTitle: text, titleTouched: true } : p)));
  }

  function handleTitleChange(text) {
    setTitle(text);
    setTitleTouched(true);
  }

  function addPart() {
    if (parts.length >= 3) return;
    setParts((prev) => [...prev, newPart()]);
  }
  function removePart(partLocalId) {
    setParts((prev) => (prev.length > 1 ? prev.filter((p) => p.localId !== partLocalId) : prev));
  }

  function addGroup(partLocalId) {
    setParts((prev) => prev.map((p) => (p.localId === partLocalId ? { ...p, groups: [...p.groups, newGroup()] } : p)));
  }
  function removeGroup(partLocalId, groupLocalId) {
    setParts((prev) =>
      prev.map((p) => (p.localId === partLocalId ? { ...p, groups: p.groups.filter((g) => g.localId !== groupLocalId) } : p))
    );
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
        p.passageText.trim() &&
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
        type: "Reading",
        description: parts[0].passageText.trim(), // kept for lists/dashboards that show a short preview
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
        .insert({ assignment_id: assignment.id, title: `Part ${pi + 1}`, passage_title: part.passageTitle.trim() || null, passage_text: part.passageText.trim(), order_index: pi })
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
    showToast?.("Reading assignment published");
    setScreen({ name: "class", classId });
  }

  return (
    <div className="page">
      <div className="eyebrow">Structured Reading</div>
      <h1 className="page-title">New Reading assignment</h1>

      <label className="field-label" style={{ marginTop: 16 }}>Title</label>
      <input className="field-input" placeholder="e.g. IELTS Reading Practice Test 1" value={title} onChange={(e) => handleTitleChange(e.target.value)} />

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
              <button className="btn-ghost" onClick={() => removePart(part.localId)}><X size={13} /> Remove this passage</button>
            )}
          </div>

          <label className="field-label" style={{ marginTop: 14 }}>Passage title (shown to students above this passage)</label>
          <input
            className="field-input"
            placeholder="e.g. The Rise of Vertical Farming"
            value={part.passageTitle}
            onChange={(e) => handlePassageTitleChange(part.localId, e.target.value)}
          />

          <label className="field-label" style={{ marginTop: 14 }}>Passage text</label>
          {pi === 0 && <p className="field-hint" style={{ marginTop: 0, marginBottom: 8 }}>If the first line looks like a title, it'll fill in both the title above and the assignment name automatically.</p>}
          <textarea
            className="field-input textarea"
            style={{ minHeight: 160 }}
            placeholder="Paste this passage's text here…"
            value={part.passageText}
            onChange={(e) => handlePassageChange(part.localId, e.target.value)}
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
                    onSummaryTextChange={(text) => updateSummaryText(part.localId, group.localId, text)}
                    onBlanksCreated={(questions) => onBlanksCreated(part.localId, group.localId, questions)}
                  />
                ) : group.completionStyle === "table" ? (
                  <TableCompletionBuilder
                    group={group}
                    teacherId={teacherId}
                    onSummaryTextChange={(text) => updateSummaryText(part.localId, group.localId, text)}
                    onBlanksCreated={(questions) => onBlanksCreated(part.localId, group.localId, questions)}
                  />
                ) : (
                  <SummaryCompletionBuilder
                    group={group}
                    teacherId={teacherId}
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
                      <TeacherQuestionForm teacherId={teacherId} skill="reading" onCreated={(q) => onQuestionCreated(part.localId, group.localId, q)} />
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

      {parts.length < 3 && (
        <button className="btn-ghost" style={{ marginTop: 20 }} onClick={addPart}><Plus size={14} /> Add another passage (Part {parts.length + 1})</button>
      )}

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
              <input className="field-input" placeholder="e.g. prosperity, size (comma-separated if more than one is accepted)" value={accepted[i] || ""} onChange={(e) => setAccepted((prev) => ({ ...prev, [i]: e.target.value }))} />
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

// ---------- Notes builder, local to this file ----------
// Two entry paths, same destination: paste Markdown ("## ", "### ", "- ")
// and get a live structured preview, or — if that markup isn't detected —
// switch to a small visual builder that never loses what was already
// typed. Either path produces the same { style: "notes", blocks } payload,
// saved into passage_text only once every blank has an accepted answer.
function NotesCompletionBuilder({ group, teacherId, onSummaryTextChange, onBlanksCreated }) {
  const [inputMode, setInputMode] = useState("markdown"); // "markdown" | "visual"
  const [markdownText, setMarkdownText] = useState("");
  const [visualBlocks, setVisualBlocks] = useState([{ type: "bullet", text: "" }]);
  const [accepted, setAccepted] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const parsedMarkdown = useMemo(() => parseNotesMarkdown(markdownText), [markdownText]);
  const activeBlocks = inputMode === "markdown" ? parsedMarkdown.blocks : visualBlocks;
  const blankCount = useMemo(() => countBlanksInTexts(activeBlocks.map((b) => b.text)), [activeBlocks]);
  const alreadyCreated = group.questions.length > 0;
  const allFilled = blankCount > 0 && Array.from({ length: blankCount }).every((_, i) => (accepted[i] || "").trim());

  function switchToVisual() {
    const seed = parsedMarkdown.blocks.length > 0 ? parsedMarkdown.blocks : [{ type: "bullet", text: markdownText.trim() }];
    setVisualBlocks(seed);
    setInputMode("visual");
  }

  function updateVisualBlock(i, patch) {
    setVisualBlocks((prev) => prev.map((b, bi) => (bi === i ? { ...b, ...patch } : b)));
  }
  function addVisualBlock(type) {
    setVisualBlocks((prev) => [...prev, { type, text: "" }]);
  }
  function removeVisualBlock(i) {
    setVisualBlocks((prev) => (prev.length > 1 ? prev.filter((_, bi) => bi !== i) : prev));
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
    onSummaryTextChange(JSON.stringify({ style: "notes", blocks: activeBlocks }));
    setBusy(false);
    onBlanksCreated(created);
  }

  if (alreadyCreated) {
    const payload = parseCompletionPayload(group.summaryText);
    return (
      <div style={{ marginTop: 14 }}>
        <NotesCompletion blocks={payload.blocks || []} questions={group.questions} answers={{}} onChange={() => {}} disabled startNumber={1} />
        <div className="qe-question-list">
          {group.questions.map((q, i) => <div key={q.id} className="qe-question-row"><Check size={14} className="qe-question-check" /><span>Blank {i + 1} — answer saved</span></div>)}
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginTop: 14 }}>
      {inputMode === "markdown" ? (
        <>
          <label className="field-label">Notes (paste)</label>
          <p className="field-hint" style={{ marginTop: 0, marginBottom: 8 }}>
            Start a line with "## " for a title, "### " for a subtitle, "- " for a bullet. Mark each blank with three or more underscores.
          </p>
          <textarea
            className="field-input textarea"
            style={{ minHeight: 160 }}
            placeholder={"## The history of frozen food\n### 1851, USA\n- ___ was kept cool by ice during transportation."}
            value={markdownText}
            onChange={(e) => setMarkdownText(e.target.value)}
          />
          {markdownText.trim() && !parsedMarkdown.recognized && (
            <div className="field-error" style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span>Couldn't recognize a title or bullet structure. Make sure lines start with "## ", "### " or "- ".</span>
              <button type="button" className="btn-ghost" onClick={switchToVisual}>Switch to visual builder</button>
            </div>
          )}
        </>
      ) : (
        <>
          <label className="field-label">Notes (visual builder)</label>
          {visualBlocks.map((block, i) => (
            <div key={i} className="qe-notes-block-row" style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "flex-start" }}>
              <select className="field-input" style={{ maxWidth: 110 }} value={block.type} onChange={(e) => updateVisualBlock(i, { type: e.target.value })}>
                <option value="h2">Title</option>
                <option value="h3">Subtitle</option>
                <option value="bullet">Bullet</option>
              </select>
              <textarea className="field-input" style={{ flex: 1, minHeight: 44 }} placeholder="Use ___ for a blank" value={block.text} onChange={(e) => updateVisualBlock(i, { text: e.target.value })} />
              {visualBlocks.length > 1 && <button type="button" className="btn-ghost" onClick={() => removeVisualBlock(i)}><X size={13} /></button>}
            </div>
          ))}
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button type="button" className="btn-ghost" onClick={() => addVisualBlock("h2")}><Plus size={13} /> Title</button>
            <button type="button" className="btn-ghost" onClick={() => addVisualBlock("h3")}><Plus size={13} /> Subtitle</button>
            <button type="button" className="btn-ghost" onClick={() => addVisualBlock("bullet")}><Plus size={13} /> Bullet</button>
          </div>
        </>
      )}

      {blankCount > 0 && (
        <div className="qe-bulk-preview">
          <div className="field-label" style={{ marginTop: 14 }}>{blankCount} blank{blankCount > 1 ? "s" : ""} detected — enter the accepted answer(s) for each</div>
          {Array.from({ length: blankCount }).map((_, i) => (
            <div key={i} className="qe-bulk-row">
              <div className="qe-bulk-text">Blank {i + 1}</div>
              <input className="field-input" placeholder="e.g. prosperity, size (comma-separated if more than one is accepted)" value={accepted[i] || ""} onChange={(e) => setAccepted((prev) => ({ ...prev, [i]: e.target.value }))} />
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

// ---------- Table builder, local to this file ----------
// Visual grid only, deliberately — no raw pipe-table paste. A row label
// column plus N data columns, each cell a small textarea that accepts
// "- " bullet lines and "___" blanks, detected in the same reading order
// the student will see: row by row, column by column within a row.
function TableCompletionBuilder({ group, teacherId, onSummaryTextChange, onBlanksCreated }) {
  const [headers, setHeaders] = useState(["Column 1"]);
  const [rows, setRows] = useState([{ label: "", cells: [""] }]);
  const [accepted, setAccepted] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const blankCount = useMemo(() => countBlanksInTexts(rows.flatMap((r) => r.cells)), [rows]);
  const alreadyCreated = group.questions.length > 0;
  const allFilled = blankCount > 0 && Array.from({ length: blankCount }).every((_, i) => (accepted[i] || "").trim());

  function addColumn() {
    setHeaders((prev) => [...prev, `Column ${prev.length + 1}`]);
    setRows((prev) => prev.map((r) => ({ ...r, cells: [...r.cells, ""] })));
  }
  function removeColumn(ci) {
    if (headers.length <= 1) return;
    setHeaders((prev) => prev.filter((_, i) => i !== ci));
    setRows((prev) => prev.map((r) => ({ ...r, cells: r.cells.filter((_, i) => i !== ci) })));
  }
  function updateHeader(ci, text) {
    setHeaders((prev) => prev.map((h, i) => (i === ci ? text : h)));
  }
  function addRow() {
    setRows((prev) => [...prev, { label: "", cells: headers.map(() => "") }]);
  }
  function removeRow(ri) {
    setRows((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== ri) : prev));
  }
  function updateRowLabel(ri, text) {
    setRows((prev) => prev.map((r, i) => (i === ri ? { ...r, label: text } : r)));
  }
  function updateCell(ri, ci, text) {
    setRows((prev) => prev.map((r, i) => (i === ri ? { ...r, cells: r.cells.map((c, j) => (j === ci ? text : c)) } : r)));
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
    onSummaryTextChange(JSON.stringify({ style: "table", headers, rows }));
    setBusy(false);
    onBlanksCreated(created);
  }

  if (alreadyCreated) {
    const payload = parseCompletionPayload(group.summaryText);
    return (
      <div style={{ marginTop: 14 }}>
        <TableCompletion headers={payload.headers || []} rows={payload.rows || []} questions={group.questions} answers={{}} onChange={() => {}} disabled startNumber={1} />
        <div className="qe-question-list">
          {group.questions.map((q, i) => <div key={q.id} className="qe-question-row"><Check size={14} className="qe-question-check" /><span>Blank {i + 1} — answer saved</span></div>)}
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginTop: 14 }}>
      <label className="field-label">Table</label>
      <p className="field-hint" style={{ marginTop: 0, marginBottom: 8 }}>
        Add rows and columns. Inside a cell, start a line with "- " for a bullet, and use ___ for a blank.
      </p>

      <div style={{ overflowX: "auto" }}>
        <table className="qe-table-builder-grid">
          <thead>
            <tr>
              <th></th>
              {headers.map((h, ci) => (
                <th key={ci}>
                  <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                    <input className="field-input" value={h} onChange={(e) => updateHeader(ci, e.target.value)} />
                    {headers.length > 1 && <button type="button" className="btn-ghost" onClick={() => removeColumn(ci)}><X size={12} /></button>}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri}>
                <th>
                  <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                    <input className="field-input" placeholder="Row label" value={row.label} onChange={(e) => updateRowLabel(ri, e.target.value)} />
                    {rows.length > 1 && <button type="button" className="btn-ghost" onClick={() => removeRow(ri)}><X size={12} /></button>}
                  </div>
                </th>
                {row.cells.map((cell, ci) => (
                  <td key={ci}>
                    <textarea className="field-input" style={{ minHeight: 60, minWidth: 180 }} value={cell} onChange={(e) => updateCell(ri, ci, e.target.value)} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button type="button" className="btn-ghost" onClick={addRow}><Plus size={13} /> Add row</button>
        <button type="button" className="btn-ghost" onClick={addColumn}><Plus size={13} /> Add column</button>
      </div>

      {blankCount > 0 && (
        <div className="qe-bulk-preview">
          <div className="field-label" style={{ marginTop: 14 }}>{blankCount} blank{blankCount > 1 ? "s" : ""} detected — enter the accepted answer(s) for each</div>
          {Array.from({ length: blankCount }).map((_, i) => (
            <div key={i} className="qe-bulk-row">
              <div className="qe-bulk-text">Blank {i + 1}</div>
              <input className="field-input" placeholder="e.g. prosperity, size (comma-separated if more than one is accepted)" value={accepted[i] || ""} onChange={(e) => setAccepted((prev) => ({ ...prev, [i]: e.target.value }))} />
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
