// =====================================================================
// The four « gaps » builders shared by the Reading builder, the Listening
// builder and the paper editor (AddGroupPanel): summary, notes, table and
// sentence completion.
// Livraison 100 — moved out of TeacherReadingBuilder.jsx without any
// change; TeacherReadingBuilder still exports them, so nothing that
// imports them from there changes.
// =====================================================================
import React, { useState, useMemo } from "react";
import { Plus, X, Check } from "lucide-react";
import { supabase } from "../../supabaseClient";
import { parseNotesMarkdown, countBlanksInTexts, parseCompletionPayload, parseSentenceCompletion, splitAlternatives } from "./bulkParse";
import { SentenceCompletion } from "./SentenceCompletion";
import { NotesCompletion } from "./NotesCompletion";
import { TableCompletion } from "./TableCompletion";

// ---------- Summary Completion builder, local to this file ----------
export function SummaryCompletionBuilder({ group, teacherId, skill = "reading", onSummaryTextChange, onBlanksCreated }) {
  const [localText, setLocalText] = useState(group.summaryText);
  const [accepted, setAccepted] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const blankCount = useMemo(() => Math.max(0, localText.split(/_{3,}/).length - 1), [localText]);
  const alreadyCreated = group.questions.length > 0;
  const allFilled = blankCount > 0 && Array.from({ length: blankCount }).every((_, i) => splitAlternatives(accepted[i]).length > 0);

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
      const alternatives = splitAlternatives(accepted[i]);
      const { data: question, error: qError } = await supabase
        .from("questions")
        .insert({ teacher_id: teacherId, type: "gap_fill", skill, prompt: `Gap ${i + 1}`, options: {} })
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
              <input className="field-input" placeholder="e.g. prosperity, size (separate accepted answers with , or /)" value={accepted[i] || ""} onChange={(e) => setAccepted((prev) => ({ ...prev, [i]: e.target.value }))} />
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
export function NotesCompletionBuilder({ group, teacherId, skill = "reading", onSummaryTextChange, onBlanksCreated }) {
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
  const allFilled = blankCount > 0 && Array.from({ length: blankCount }).every((_, i) => splitAlternatives(accepted[i]).length > 0);

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
      const alternatives = splitAlternatives(accepted[i]);
      const { data: question, error: qError } = await supabase
        .from("questions")
        .insert({ teacher_id: teacherId, type: "gap_fill", skill, prompt: `Gap ${i + 1}`, options: {} })
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
          {parsedMarkdown.warnings.length > 0 && (
            <div className="field-error" style={{ marginTop: 8 }}>
              <div>These line(s) look like a title/bullet marker but are missing the space right after it, so they'll show up as plain text with the symbol still in it:</div>
              <ul style={{ margin: "6px 0 0 18px" }}>
                {parsedMarkdown.warnings.map((w, i) => (
                  <li key={i}><code>{w}</code></li>
                ))}
              </ul>
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
              <input className="field-input" placeholder="e.g. prosperity, size (separate accepted answers with , or /)" value={accepted[i] || ""} onChange={(e) => setAccepted((prev) => ({ ...prev, [i]: e.target.value }))} />
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
export function TableCompletionBuilder({ group, teacherId, skill = "reading", onSummaryTextChange, onBlanksCreated }) {
  const [headers, setHeaders] = useState(["Column 1"]);
  const [rows, setRows] = useState([{ label: "", cells: [""] }]);
  const [accepted, setAccepted] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const blankCount = useMemo(() => countBlanksInTexts(rows.flatMap((r) => r.cells)), [rows]);
  const alreadyCreated = group.questions.length > 0;
  const allFilled = blankCount > 0 && Array.from({ length: blankCount }).every((_, i) => splitAlternatives(accepted[i]).length > 0);

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
      const alternatives = splitAlternatives(accepted[i]);
      const { data: question, error: qError } = await supabase
        .from("questions")
        .insert({ teacher_id: teacherId, type: "gap_fill", skill, prompt: `Gap ${i + 1}`, options: {} })
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
                  <textarea className="field-input" style={{ minHeight: 60, width: "100%", boxSizing: "border-box" }} value={cell} onChange={(e) => updateCell(ri, ci, e.target.value)} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

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
              <input className="field-input" placeholder="e.g. prosperity, size (separate accepted answers with , or /)" value={accepted[i] || ""} onChange={(e) => setAccepted((prev) => ({ ...prev, [i]: e.target.value }))} />
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

// ---------- Sentence Completion builder, local to this file ----------
// No syntax to remember, unlike Notes — every pasted non-empty line is
// automatically its own separate numbered sentence.
export function SentenceCompletionBuilder({ group, teacherId, skill = "reading", onSummaryTextChange, onBlanksCreated }) {
  const [text, setText] = useState("");
  const [accepted, setAccepted] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const sentences = useMemo(() => parseSentenceCompletion(text), [text]);
  const blankCount = useMemo(() => countBlanksInTexts(sentences), [sentences]);
  const alreadyCreated = group.questions.length > 0;
  const allFilled = blankCount > 0 && Array.from({ length: blankCount }).every((_, i) => splitAlternatives(accepted[i]).length > 0);

  async function createBlanks() {
    if (!allFilled) return;
    setBusy(true);
    setError("");
    const created = [];
    for (let i = 0; i < blankCount; i++) {
      const alternatives = splitAlternatives(accepted[i]);
      const { data: question, error: qError } = await supabase
        .from("questions")
        .insert({ teacher_id: teacherId, type: "gap_fill", skill, prompt: `Gap ${i + 1}`, options: {} })
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
    onSummaryTextChange(JSON.stringify({ style: "sentences", sentences }));
    setBusy(false);
    onBlanksCreated(created);
  }

  if (alreadyCreated) {
    const payload = parseCompletionPayload(group.summaryText);
    return (
      <div style={{ marginTop: 14 }}>
        <SentenceCompletion sentences={payload.sentences || []} questions={group.questions} answers={{}} onChange={() => {}} disabled startNumber={1} />
        <div className="qe-question-list">
          {group.questions.map((q, i) => <div key={q.id} className="qe-question-row"><Check size={14} className="qe-question-check" /><span>Blank {i + 1} — answer saved</span></div>)}
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginTop: 14 }}>
      <label className="field-label">Sentences (paste)</label>
      <p className="field-hint" style={{ marginTop: 0, marginBottom: 8 }}>
        One sentence per line — no special formatting needed. Mark each blank with three or more underscores.
      </p>
      <textarea
        className="field-input textarea"
        style={{ minHeight: 140 }}
        placeholder={"The findings at Kalambo Falls revealed that ___.\nEvidence from high-altitude regions suggests that ___."}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />

      {blankCount > 0 && (
        <div className="qe-bulk-preview">
          <div className="field-label" style={{ marginTop: 14 }}>{blankCount} blank{blankCount > 1 ? "s" : ""} detected — enter the accepted answer(s) for each</div>
          {Array.from({ length: blankCount }).map((_, i) => (
            <div key={i} className="qe-bulk-row">
              <div className="qe-bulk-text">Blank {i + 1}</div>
              <input className="field-input" placeholder="e.g. prosperity, size (separate accepted answers with , or /)" value={accepted[i] || ""} onChange={(e) => setAccepted((prev) => ({ ...prev, [i]: e.target.value }))} />
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
