
import React, { useState, useMemo } from "react";
import { supabase } from "../../supabaseClient";
import { parseMatchingOptions, parseMatchingItems } from "./bulkParse";
import { MatchingGrid } from "./MatchingGrid";

const LABELS = {
  matching_headings: { title: "Matching Headings", labelStyle: "roman", optionsHint: "Paste each heading on its own line — numbered i, ii, iii… automatically.", itemsHint: "Paste each paragraph reference or item to match, one per line (or numbered, or separated by a blank line)." },
  matching_information: { title: "Matching Information", labelStyle: "letter", optionsHint: "Paste each paragraph label on its own line (e.g. Paragraph A) — lettered A, B, C… automatically.", itemsHint: "Paste each statement to match, one per line (or numbered, or separated by a blank line)." },
  matching_features: { title: "Matching Features", labelStyle: "letter", optionsHint: "Paste each name/feature on its own line — lettered A, B, C… automatically.", itemsHint: "Paste each statement to match, one per line (or numbered, or separated by a blank line)." },
  matching_sentence_endings: { title: "Matching Sentence Endings", labelStyle: "letter", optionsHint: "Paste each sentence ending on its own line — lettered A, B, C… automatically.", itemsHint: "Paste each sentence beginning, one per line (or numbered, or separated by a blank line)." },
};

export function MatchingBuilder({ group, teacherId, matchingType, onQuestionsCreated }) {
  const meta = LABELS[matchingType] || LABELS.matching_information;
  const [optionsText, setOptionsText] = useState("");
  const [itemsText, setItemsText] = useState("");
  const [picks, setPicks] = useState({}); // item index -> chosen letter
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const options = useMemo(() => parseMatchingOptions(optionsText, meta.labelStyle), [optionsText, meta.labelStyle]);
  const items = useMemo(() => parseMatchingItems(itemsText), [itemsText]);
  const alreadyCreated = group.questions.length > 0;
  const allPicked = items.length > 0 && options.length > 0 && items.every((_, i) => picks[i]);

  async function createAll() {
    if (!allPicked) return;
    setBusy(true);
    setError("");
    const created = [];
    for (let i = 0; i < items.length; i++) {
      const { data: question, error: qError } = await supabase
        .from("questions")
        .insert({ teacher_id: teacherId, type: matchingType, skill: "reading", prompt: items[i].text, options: { choices: options } })
        .select()
        .single();
      if (qError || !question) {
        setBusy(false);
        setError(`Stopped at item ${i + 1}: ` + (qError?.message || "unknown error"));
        return;
      }
      const { error: kError } = await supabase.from("question_answer_key").insert({ question_id: question.id, correct_answer: picks[i] });
      if (kError) {
        setBusy(false);
        setError(`Item ${i + 1} created, but its answer key failed: ` + kError.message);
        return;
      }
      created.push(question);
    }
    setBusy(false);
    onQuestionsCreated(created);
  }

  if (alreadyCreated) {
    return (
      <div style={{ marginTop: 14 }}>
        <MatchingGrid questions={group.questions} answers={{}} onChange={() => {}} disabled startNumber={1} />
      </div>
    );
  }

  return (
    <div style={{ marginTop: 14 }}>
      <label className="field-label">{meta.title} — option bank</label>
      <p className="field-hint" style={{ marginTop: 0, marginBottom: 8 }}>{meta.optionsHint}</p>
      <textarea className="field-input textarea" style={{ minHeight: 100 }} value={optionsText} onChange={(e) => setOptionsText(e.target.value)} />
      {options.length > 0 && (
        <ul className="qe-matching-legend" style={{ marginTop: 8 }}>
          {options.map((o) => (
            <li key={o.letter}><strong>{o.letter}.</strong> {o.text}</li>
          ))}
        </ul>
      )}

      <label className="field-label" style={{ marginTop: 16 }}>Items to match</label>
      <p className="field-hint" style={{ marginTop: 0, marginBottom: 8 }}>{meta.itemsHint}</p>
      <textarea className="field-input textarea" style={{ minHeight: 100 }} value={itemsText} onChange={(e) => setItemsText(e.target.value)} />

      {items.length > 0 && options.length > 0 && (
        <div className="qe-bulk-preview">
          <div className="field-label" style={{ marginTop: 14 }}>{items.length} item{items.length > 1 ? "s" : ""} — pick the correct option for each</div>
          {items.map((item, i) => (
            <div key={i} className="qe-bulk-row">
              <div className="qe-bulk-text">{item.text}</div>
              <select className="field-input" style={{ maxWidth: 90 }} value={picks[i] || ""} onChange={(e) => setPicks((p) => ({ ...p, [i]: e.target.value }))}>
                <option value="">—</option>
                {options.map((o) => (
                  <option key={o.letter} value={o.letter}>{o.letter}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}

      {error && <div className="field-error">{error}</div>}

      <button className="btn-primary" style={{ marginTop: 16 }} disabled={!allPicked || busy} onClick={createAll}>
        {busy ? "Saving…" : `Save ${items.length || ""} item${items.length > 1 ? "s" : ""}`}
      </button>
    </div>
  );
}
