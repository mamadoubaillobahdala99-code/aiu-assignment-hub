
import React, { useState, useMemo } from "react";
import { Check } from "lucide-react";
import { supabase } from "../../supabaseClient";
import {
  countBlanksInTexts,
  parseCompletionPayload,
  splitAlternatives,
  parseFormCompletion,
  formBlankTexts,
  parseFlowchart,
  parseWordBank,
  parseShortAnswers,
} from "./bulkParse";
import { FormCompletion, FlowchartCompletion, WordBankCompletion } from "./CompletionExtras";

// Teacher builders for four IELTS formats:
//   FormCompletionBuilder      — "Label: value" lines, ___ for blanks
//   FlowchartCompletionBuilder — one box per line, ___ for blanks
//   WordBankCompletionBuilder  — summary + lettered word list; the teacher
//                                picks the correct letter for each gap
//   ShortAnswerBuilder         — "Question — answer / alternative" lines
// Every answer is a gap_fill question with its key in question_answer_key
// (never visible to students). Only the layout goes into passage_text.

// Creates one gap_fill question + answer key per entry, in order.
// entries: [{ prompt, options, key }]
async function createGapFills({ teacherId, skill, entries, label = "Blank" }) {
  const created = [];
  for (let i = 0; i < entries.length; i++) {
    const { prompt, options, key } = entries[i];
    const { data: question, error: qError } = await supabase
      .from("questions")
      .insert({ teacher_id: teacherId, type: "gap_fill", skill, prompt, options: options || {} })
      .select()
      .single();
    if (qError || !question) {
      return { created, error: `Stopped at ${label.toLowerCase()} ${i + 1}: ` + (qError?.message || "unknown error") };
    }
    const { error: kError } = await supabase.from("question_answer_key").insert({ question_id: question.id, correct_answer: key });
    if (kError) {
      return { created, error: `${label} ${i + 1} created, but its answer key failed: ` + kError.message };
    }
    created.push(question);
  }
  return { created, error: "" };
}

const ACCEPTED_PLACEHOLDER = "e.g. river / the river (separate accepted answers with , or /)";

function AcceptedAnswersInputs({ count, accepted, setAccepted }) {
  if (count <= 0) return null;
  return (
    <div className="qe-bulk-preview">
      <div className="field-label" style={{ marginTop: 14 }}>
        {count} blank{count > 1 ? "s" : ""} detected — enter the accepted answer(s) for each
      </div>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="qe-bulk-row">
          <div className="qe-bulk-text">Blank {i + 1}</div>
          <input
            className="field-input"
            placeholder={ACCEPTED_PLACEHOLDER}
            value={accepted[i] || ""}
            onChange={(e) => setAccepted((prev) => ({ ...prev, [i]: e.target.value }))}
          />
        </div>
      ))}
    </div>
  );
}

function SavedList({ questions, label = "Blank" }) {
  return (
    <div className="qe-question-list">
      {questions.map((q, i) => (
        <div key={q.id} className="qe-question-row">
          <Check size={14} className="qe-question-check" />
          <span>{label} {i + 1} — answer saved</span>
        </div>
      ))}
    </div>
  );
}

function PreviewBox({ children }) {
  return (
    <div className="qe-builder-preview">
      <div className="qe-builder-preview-tag">Student preview</div>
      {children}
    </div>
  );
}

const noop = () => {};

// ---------------------------------------------------------------------
// Form completion
// ---------------------------------------------------------------------
export function FormCompletionBuilder({ group, teacherId, skill = "reading", onSummaryTextChange, onBlanksCreated }) {
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [accepted, setAccepted] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const rows = useMemo(() => parseFormCompletion(text), [text]);
  const blankCount = useMemo(() => countBlanksInTexts(formBlankTexts(rows)), [rows]);
  const allFilled = blankCount > 0 && Array.from({ length: blankCount }).every((_, i) => splitAlternatives(accepted[i]).length > 0);

  async function save() {
    if (!allFilled) return;
    setBusy(true);
    setError("");
    const entries = Array.from({ length: blankCount }).map((_, i) => ({ prompt: `Gap ${i + 1}`, key: splitAlternatives(accepted[i]) }));
    const { created, error: e } = await createGapFills({ teacherId, skill, entries });
    setBusy(false);
    if (e) return setError(e);
    onSummaryTextChange(JSON.stringify({ style: "form", title: title.trim(), rows }));
    onBlanksCreated(created);
  }

  if (group.questions.length > 0) {
    const payload = parseCompletionPayload(group.summaryText);
    return (
      <div style={{ marginTop: 14 }}>
        <FormCompletion title={payload.title} rows={payload.rows || []} questions={group.questions} answers={{}} onChange={noop} disabled startNumber={1} />
        <SavedList questions={group.questions} />
      </div>
    );
  }

  const fakeQuestions = Array.from({ length: blankCount }).map((_, i) => ({ id: `preview-${i}` }));

  return (
    <div style={{ marginTop: 14 }}>
      <label className="field-label">Form title (optional)</label>
      <input className="field-input" placeholder="e.g. CUSTOMER BOOKING FORM" value={title} onChange={(e) => setTitle(e.target.value)} />

      <label className="field-label" style={{ marginTop: 12 }}>Form lines (paste)</label>
      <p className="field-hint" style={{ marginTop: 0, marginBottom: 8 }}>
        One line per field: "Label: value". Use ___ for each blank. A line starting with "Example" is shown greyed, without a blank.
      </p>
      <textarea
        className="field-input textarea"
        style={{ minHeight: 160 }}
        placeholder={"Example Name: Sarah Brown\nAddress: 24 ___ Road\nPostcode: ___\nDate of birth: 15/06/1998\nPreferred time: ___ in the morning"}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />

      {rows.length > 0 && (
        <PreviewBox>
          <FormCompletion title={title.trim()} rows={rows} questions={fakeQuestions} answers={{}} onChange={noop} disabled startNumber={1} />
        </PreviewBox>
      )}

      <AcceptedAnswersInputs count={blankCount} accepted={accepted} setAccepted={setAccepted} />
      {error && <div className="field-error">{error}</div>}
      <button className="btn-primary" style={{ marginTop: 16 }} disabled={!allFilled || busy} onClick={save}>
        {busy ? "Saving…" : `Save ${blankCount || ""} blank${blankCount > 1 ? "s" : ""}`}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------
// Flow-chart completion
// ---------------------------------------------------------------------
export function FlowchartCompletionBuilder({ group, teacherId, skill = "reading", onSummaryTextChange, onBlanksCreated }) {
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [accepted, setAccepted] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const steps = useMemo(() => parseFlowchart(text), [text]);
  const blankCount = useMemo(() => countBlanksInTexts(steps), [steps]);
  const allFilled = blankCount > 0 && Array.from({ length: blankCount }).every((_, i) => splitAlternatives(accepted[i]).length > 0);

  async function save() {
    if (!allFilled) return;
    setBusy(true);
    setError("");
    const entries = Array.from({ length: blankCount }).map((_, i) => ({ prompt: `Gap ${i + 1}`, key: splitAlternatives(accepted[i]) }));
    const { created, error: e } = await createGapFills({ teacherId, skill, entries });
    setBusy(false);
    if (e) return setError(e);
    onSummaryTextChange(JSON.stringify({ style: "flowchart", title: title.trim(), steps }));
    onBlanksCreated(created);
  }

  if (group.questions.length > 0) {
    const payload = parseCompletionPayload(group.summaryText);
    return (
      <div style={{ marginTop: 14 }}>
        <FlowchartCompletion title={payload.title} steps={payload.steps || []} questions={group.questions} answers={{}} onChange={noop} disabled startNumber={1} />
        <SavedList questions={group.questions} />
      </div>
    );
  }

  const fakeQuestions = Array.from({ length: blankCount }).map((_, i) => ({ id: `preview-${i}` }));

  return (
    <div style={{ marginTop: 14 }}>
      <label className="field-label">Flow-chart title (optional)</label>
      <input className="field-input" placeholder="e.g. The recycling process" value={title} onChange={(e) => setTitle(e.target.value)} />

      <label className="field-label" style={{ marginTop: 12 }}>Steps (paste)</label>
      <p className="field-hint" style={{ marginTop: 0, marginBottom: 8 }}>
        One box per line, from top to bottom. Arrows are added automatically. Use ___ for each blank.
      </p>
      <textarea
        className="field-input textarea"
        style={{ minHeight: 160 }}
        placeholder={"Bottles are collected from ___\nThey are sorted by ___\nThe glass is crushed and ___\nNew bottles are made"}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />

      {steps.length > 0 && (
        <PreviewBox>
          <FlowchartCompletion title={title.trim()} steps={steps} questions={fakeQuestions} answers={{}} onChange={noop} disabled startNumber={1} />
        </PreviewBox>
      )}

      <AcceptedAnswersInputs count={blankCount} accepted={accepted} setAccepted={setAccepted} />
      {error && <div className="field-error">{error}</div>}
      <button className="btn-primary" style={{ marginTop: 16 }} disabled={!allFilled || busy} onClick={save}>
        {busy ? "Saving…" : `Save ${blankCount || ""} blank${blankCount > 1 ? "s" : ""}`}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------
// Summary with a word list (the student chooses a letter in a list)
// ---------------------------------------------------------------------
export function WordBankCompletionBuilder({ group, teacherId, skill = "reading", onSummaryTextChange, onBlanksCreated }) {
  const [text, setText] = useState("");
  const [bankText, setBankText] = useState("");
  const [picks, setPicks] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const bank = useMemo(() => parseWordBank(bankText), [bankText]);
  const blankCount = useMemo(() => countBlanksInTexts([text]), [text]);
  const letters = bank.map((o) => o.letter);
  const allPicked = blankCount > 0 && bank.length > 1 && Array.from({ length: blankCount }).every((_, i) => letters.includes(picks[i]));

  async function save() {
    if (!allPicked) return;
    setBusy(true);
    setError("");
    const entries = Array.from({ length: blankCount }).map((_, i) => ({ prompt: `Gap ${i + 1}`, options: { word_bank: true }, key: [picks[i]] }));
    const { created, error: e } = await createGapFills({ teacherId, skill, entries });
    setBusy(false);
    if (e) return setError(e);
    onSummaryTextChange(JSON.stringify({ style: "wordbank", text: text.trim(), options: bank }));
    onBlanksCreated(created);
  }

  if (group.questions.length > 0) {
    const payload = parseCompletionPayload(group.summaryText);
    return (
      <div style={{ marginTop: 14 }}>
        <WordBankCompletion text={payload.text} options={payload.options || []} questions={group.questions} answers={{}} onChange={noop} disabled startNumber={1} />
        <SavedList questions={group.questions} label="Gap" />
      </div>
    );
  }

  const fakeQuestions = Array.from({ length: blankCount }).map((_, i) => ({ id: `preview-${i}` }));

  return (
    <div style={{ marginTop: 14 }}>
      <label className="field-label">Summary text</label>
      <p className="field-hint" style={{ marginTop: 0, marginBottom: 8 }}>Mark each gap with three or more underscores.</p>
      <textarea
        className="field-input textarea"
        style={{ minHeight: 130 }}
        placeholder={"Early farmers relied on ___ methods, but later the use of ___ increased yields."}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />

      <label className="field-label" style={{ marginTop: 12 }}>List of words</label>
      <p className="field-hint" style={{ marginTop: 0, marginBottom: 8 }}>
        One word or phrase per line. Write the letter first ("A biological") or leave it out and letters are added automatically. Add more options than gaps, as in the real test.
      </p>
      <textarea
        className="field-input textarea"
        style={{ minHeight: 130 }}
        placeholder={"A biological\nB chemical\nC traditional\nD fertilisers\nE machinery"}
        value={bankText}
        onChange={(e) => setBankText(e.target.value)}
      />

      {blankCount > 0 && bank.length > 0 && (
        <PreviewBox>
          <WordBankCompletion text={text} options={bank} questions={fakeQuestions} answers={{}} onChange={noop} disabled startNumber={1} />
        </PreviewBox>
      )}

      {blankCount > 0 && (
        <div className="qe-bulk-preview">
          <div className="field-label" style={{ marginTop: 14 }}>
            {blankCount} gap{blankCount > 1 ? "s" : ""} detected — choose the correct letter for each
          </div>
          {bank.length < 2 && <p className="field-hint">Add at least two words to the list first.</p>}
          {bank.length >= 2 &&
            Array.from({ length: blankCount }).map((_, i) => (
              <div key={i} className="qe-bulk-row">
                <div className="qe-bulk-text">Gap {i + 1}</div>
                <select className="field-input" value={picks[i] || ""} onChange={(e) => setPicks((prev) => ({ ...prev, [i]: e.target.value }))}>
                  <option value="">Choose the correct word…</option>
                  {bank.map((o) => (
                    <option key={o.letter} value={o.letter}>{o.letter} — {o.text}</option>
                  ))}
                </select>
              </div>
            ))}
        </div>
      )}

      {error && <div className="field-error">{error}</div>}
      <button className="btn-primary" style={{ marginTop: 16 }} disabled={!allPicked || busy} onClick={save}>
        {busy ? "Saving…" : `Save ${blankCount || ""} gap${blankCount > 1 ? "s" : ""}`}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------
// Short-answer questions
// ---------------------------------------------------------------------
export function ShortAnswerBuilder({ group, teacherId, skill = "reading", onQuestionsCreated }) {
  const [text, setText] = useState("");
  const [edits, setEdits] = useState({}); // row index -> edited answer
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const items = useMemo(() => parseShortAnswers(text), [text]);
  const answerFor = (i) => (edits[i] !== undefined ? edits[i] : items[i]?.answer || "");
  const ready = items.length > 0 && items.every((it, i) => it.prompt && splitAlternatives(answerFor(i)).length > 0);

  async function save() {
    if (!ready) return;
    setBusy(true);
    setError("");
    const entries = items.map((it, i) => ({ prompt: it.prompt, options: { short_answer: true }, key: splitAlternatives(answerFor(i)) }));
    const { created, error: e } = await createGapFills({ teacherId, skill, entries, label: "Question" });
    setBusy(false);
    if (e) return setError(e);
    onQuestionsCreated(created);
  }

  if (group.questions.length > 0) {
    return (
      <div style={{ marginTop: 14 }}>
        <div className="qe-question-list">
          {group.questions.map((q, i) => (
            <div key={q.id} className="qe-question-row">
              <Check size={14} className="qe-question-check" />
              <span>{i + 1}. {q.prompt} — answer saved</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginTop: 14 }}>
      <label className="field-label">Questions (paste)</label>
      <p className="field-hint" style={{ marginTop: 0, marginBottom: 8 }}>
        One question per line: "Question — answer". Separate several accepted answers with , or /. You can also paste the questions only and type the answers below.
      </p>
      <textarea
        className="field-input textarea"
        style={{ minHeight: 150 }}
        placeholder={"What did the first farmers grow? — wheat\nWhere was the oldest tool found? — in a cave / a cave\nHow many workers were needed? — 12, twelve"}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setEdits({});
        }}
      />

      {items.length > 0 && (
        <div className="qe-bulk-preview">
          <div className="field-label" style={{ marginTop: 14 }}>
            {items.length} question{items.length > 1 ? "s" : ""} detected — check the accepted answer(s)
          </div>
          {items.map((it, i) => (
            <div key={i} className="qe-bulk-row">
              <div className="qe-bulk-text">{i + 1}. {it.prompt}</div>
              <input
                className="field-input"
                placeholder={ACCEPTED_PLACEHOLDER}
                value={answerFor(i)}
                onChange={(e) => setEdits((prev) => ({ ...prev, [i]: e.target.value }))}
              />
            </div>
          ))}
        </div>
      )}

      {error && <div className="field-error">{error}</div>}
      <button className="btn-primary" style={{ marginTop: 16 }} disabled={!ready || busy} onClick={save}>
        {busy ? "Saving…" : `Save ${items.length || ""} question${items.length > 1 ? "s" : ""}`}
      </button>
    </div>
  );
}
