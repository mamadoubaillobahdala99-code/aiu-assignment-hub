
import React, { useState, useMemo } from "react";
import { supabase } from "../../supabaseClient";
import { parseMatchingItems } from "./bulkParse";
import { MatchingGrid } from "./MatchingGrid";

// Plan / Map / Diagram labelling — teacher builder (IELTS computer-delivered style).
//
// "map"     : the image already shows letters (A, B, C…). Each question is
//             a place/feature; the student picks its letter in a grid.
//             Stored as type "matching_map_labelling" (graded like every
//             other matching type: exact letter).
// "diagram" : the image shows numbered labels. The student writes a word
//             or short phrase for each one. Stored as "gap_fill" (graded
//             case-insensitively, several accepted answers allowed with "/").
//
// The image itself belongs to the group (question_groups.image_url) and
// is chosen with the image picker shown above this builder.

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

export function defaultLabellingInstruction(kind, lastLetter) {
  if (kind === "map") return `Label the map below.\nWrite the correct letter, A–${lastLetter}, next to each question.`;
  return "Label the diagram below.\nWrite NO MORE THAN TWO WORDS for each answer.";
}

// "river / the river" → ["river", "the river"]
function splitAccepted(text) {
  return text
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function LabellingBuilder({ group, teacherId, skill = "listening", kind, onQuestionsCreated }) {
  const [lastLetter, setLastLetter] = useState("H");
  const [itemsText, setItemsText] = useState("");
  const [picks, setPicks] = useState({}); // map: item index -> letter
  const [accepted, setAccepted] = useState({}); // diagram: item index -> "a / b"
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const letters = useMemo(() => LETTERS.slice(0, LETTERS.indexOf(lastLetter) + 1), [lastLetter]);
  const items = useMemo(() => parseMatchingItems(itemsText), [itemsText]);
  const alreadyCreated = group.questions.length > 0;

  const ready =
    items.length > 0 &&
    (kind === "map" ? items.every((_, i) => picks[i]) : items.every((_, i) => splitAccepted(accepted[i] || "").length > 0));

  async function createAll() {
    if (!ready) return;
    setBusy(true);
    setError("");
    const created = [];
    for (let i = 0; i < items.length; i++) {
      const row =
        kind === "map"
          ? { teacher_id: teacherId, type: "matching_map_labelling", skill, prompt: items[i].text, options: { choices: letters.map((l) => ({ letter: l, text: "" })) } }
          : { teacher_id: teacherId, type: "gap_fill", skill, prompt: items[i].text, options: { labelling: true } };
      const { data: question, error: qError } = await supabase.from("questions").insert(row).select().single();
      if (qError || !question) {
        setBusy(false);
        setError(`Stopped at item ${i + 1}: ` + (qError?.message || "unknown error"));
        return;
      }
      const key = kind === "map" ? picks[i] : splitAccepted(accepted[i]);
      const { error: kError } = await supabase.from("question_answer_key").insert({ question_id: question.id, correct_answer: key });
      if (kError) {
        setBusy(false);
        setError(`Item ${i + 1} created, but its answer failed to save: ` + kError.message);
        return;
      }
      created.push(question);
    }
    setBusy(false);
    onQuestionsCreated(created, defaultLabellingInstruction(kind, lastLetter));
  }

  if (alreadyCreated) {
    return kind === "map" || group.questions[0]?.type === "matching_map_labelling" ? (
      <div style={{ marginTop: 14 }}>
        <MatchingGrid questions={group.questions} answers={{}} onChange={() => {}} disabled startNumber={1} />
      </div>
    ) : (
      <ol className="qe-label-preview">
        {group.questions.map((q) => (
          <li key={q.id}>{q.prompt || <em>Label</em>}</li>
        ))}
      </ol>
    );
  }

  return (
    <div style={{ marginTop: 14 }}>
      {kind === "map" && (
        <>
          <label className="field-label">Letters shown on the image</label>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="field-hint" style={{ margin: 0 }}>A to</span>
            <select className="field-input" style={{ maxWidth: 90 }} value={lastLetter} onChange={(e) => setLastLetter(e.target.value)}>
              {LETTERS.slice(2, 16).map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </div>
        </>
      )}

      <label className="field-label" style={{ marginTop: 14 }}>{kind === "map" ? "Places / features to locate" : "Labels to complete"}</label>
      <p className="field-hint" style={{ marginTop: 0, marginBottom: 8 }}>
        {kind === "map"
          ? "One per line, in question order (numbers are added automatically), e.g. Car park · Ticket office · Café"
          : "One per line, in question order — a short description of where each numbered label is (e.g. \"top of the tower\"). You can leave a line as just \"Label\"."}
      </p>
      <textarea className="field-input textarea" style={{ minHeight: 110 }} value={itemsText} onChange={(e) => setItemsText(e.target.value)} />

      {items.length > 0 && (
        <div className="qe-bulk-preview">
          <div className="field-label" style={{ marginTop: 14 }}>
            {items.length} question{items.length > 1 ? "s" : ""} — {kind === "map" ? "pick the correct letter for each" : "type the correct answer for each (separate accepted alternatives with /)"}
          </div>
          {items.map((item, i) => (
            <div key={i} className="qe-bulk-row">
              <div className="qe-bulk-text">{i + 1}. {item.text}</div>
              {kind === "map" ? (
                <select className="field-input" style={{ maxWidth: 90 }} value={picks[i] || ""} onChange={(e) => setPicks((p) => ({ ...p, [i]: e.target.value }))}>
                  <option value="">—</option>
                  {letters.map((l) => (
                    <option key={l} value={l}>{l}</option>
                  ))}
                </select>
              ) : (
                <input
                  className="field-input"
                  style={{ maxWidth: 240 }}
                  placeholder="e.g. valve / the valve"
                  value={accepted[i] || ""}
                  onChange={(e) => setAccepted((a) => ({ ...a, [i]: e.target.value }))}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {error && <div className="field-error">{error}</div>}

      <button className="btn-primary" style={{ marginTop: 16 }} disabled={!ready || busy} onClick={createAll}>
        {busy ? "Saving…" : `Save ${items.length || ""} question${items.length > 1 ? "s" : ""}`}
      </button>
    </div>
  );
}
