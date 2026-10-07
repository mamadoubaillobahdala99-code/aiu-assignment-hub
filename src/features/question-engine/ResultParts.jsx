import React, { useMemo, useState } from "react";
import { Check, X as XIcon, Minus } from "lucide-react";
import { formatAnswerValue } from "./answerFormat";
import { questionSlotCount } from "./bulkParse";
import { sanitizeWritingHtml } from "./writingHtml";

// Livraison 74 — pieces shared by the RESULT screens (student) and the
// CORRECTION screens (teacher), so both sides show a copy the same way:
//   - the answer sheet: one line per question, the answer given, the
//     correct answer (only when it may be shown), right / wrong;
//   - the list of the teacher's notes in a Writing copy.
// Nothing here reads the database: the screens pass what they already
// have, read with the viewer's own rights.

// One line per question, in the paper's order and numbering. A question
// worth several answers ("choose TWO letters") keeps one line, labelled
// "Q21–22", and counts as partly right when only some letters are.
export function buildSheet(sections) {
  const rows = [];
  for (const s of sections || []) {
    for (const g of s.groups || []) {
      (g.questions || []).forEach((q, i) => {
        if (!q) return;
        const first = g.questionNumbers?.[i] ?? null;
        const slots = questionSlotCount(q);
        rows.push({ q, first, slots, label: first == null ? "Q" : slots > 1 ? `Q${first}–${first + slots - 1}` : `Q${first}`, part: s.title || "" });
      });
    }
  }
  return rows;
}

// "right" | "partial" | "wrong" (a question left blank is wrong).
export function rowState(row, resultsByQ) {
  const r = resultsByQ?.[row.q.id];
  if (!r) return "wrong";
  if (r.isCorrect) return "right";
  if (row.slots > 1 && (r.earned || 0) > 0) return "partial";
  return "wrong";
}

export function sheetCounts(rows, resultsByQ) {
  let right = 0, wrong = 0, partial = 0;
  for (const row of rows) {
    const s = rowState(row, resultsByQ);
    if (s === "right") right++; else if (s === "partial") partial++; else wrong++;
  }
  return { right, wrong, partial, all: rows.length };
}

// The answer sheet. `mine` changes the words ("Your answer").
// showCorrect = false: the correct answers are never shown (only right /
// wrong) — the database does not send them in that case anyway.
export function AnswerSheet({ rows, answersByQ, resultsByQ, correctFormatted, showCorrect, mine = false, filterLabels }) {
  const [show, setShow] = useState("all");
  const counts = useMemo(() => sheetCounts(rows, resultsByQ), [rows, resultsByQ]);
  const list = rows.filter((row) => {
    const s = rowState(row, resultsByQ);
    return show === "all" || (show === "wrong" ? s !== "right" : s === "right");
  });
  const labels = filterLabels || { wrong: mine ? "My mistakes" : "Wrong", right: "Correct" };
  const wrongCount = counts.wrong + counts.partial;

  return (
    <div className="rs-sheet">
      <div className="dt-chips rs-sheet-chips" role="group" aria-label="Filter the answers">
        {[["all", `All ${counts.all}`], ["wrong", `${labels.wrong} ${wrongCount}`], ["right", `${labels.right} ${counts.right}`]].map(([k, l]) => (
          <button key={k} type="button" className={`dt-chip ${show === k ? "on" : ""}`} aria-pressed={show === k} onClick={() => setShow(k)}>{l}</button>
        ))}
      </div>
      {list.length === 0 ? (
        <p className="empty-inline">{show === "wrong" ? (mine ? "No mistake — well done." : "No wrong answer.") : "No correct answer."}</p>
      ) : (
        <div className="dt-wrap">
          <table className="dt rs-sheet-table">
            <thead>
              <tr>
                <th>#</th>
                <th>{mine ? "Your answer" : "Answer"}</th>
                {showCorrect && <th className="hide-sm">Correct answer</th>}
                <th className="rs-res-h">Result</th>
              </tr>
            </thead>
            <tbody>
              {list.map((row) => {
                const s = rowState(row, resultsByQ);
                const given = answersByQ?.[row.q.id];
                const givenText = formatAnswerValue(row.q, given);
                const blank = givenText === "(no answer)";
                const correct = correctFormatted?.[row.q.id];
                return (
                  <tr key={row.q.id} id={`sheet-${row.q.id}`} className={`rs-row rs-${s}`}>
                    <td className="dt-nowrap"><b>{row.label}</b></td>
                    <td>
                      <span className={blank ? "dt-muted" : ""}>{blank ? "no answer" : givenText}</span>
                      {showCorrect && correct && <span className="dt-sub show-sm">Correct: {correct}</span>}
                    </td>
                    {showCorrect && <td className="hide-sm">{correct || <span className="dt-muted">—</span>}</td>}
                    <td className="rs-res">
                      {s === "right" ? <span className="rs-ok"><Check size={14} /> Correct</span>
                        : s === "partial" ? <span className="rs-part"><Minus size={14} /> Partly</span>
                        : <span className="rs-ko"><XIcon size={14} /> Wrong</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// The teacher's error marks in a corrected Writing copy, in order:
// [{ text, note }]. The HTML is sanitized first, as for display.
export function listMarks(html) {
  const clean = sanitizeWritingHtml(html || "", { allowMarks: true });
  if (!clean.includes("<mark")) return [];
  const doc = new DOMParser().parseFromString(`<body>${clean}</body>`, "text/html");
  return [...doc.querySelectorAll("mark")].map((m) => ({ text: m.textContent || "", note: m.getAttribute("data-note") || "" }));
}

// The notes, as a list. Clicking one shows where it is in the text
// (the n-th red mark inside `containerRef`).
export function NotesList({ marks, containerRef, empty = "No error marked." }) {
  const [active, setActive] = useState(null);
  function show(i) {
    setActive(i);
    const all = containerRef?.current?.querySelectorAll("mark") || [];
    all.forEach((m, k) => m.classList.toggle("rs-mark-on", k === i));
    all[i]?.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  if (!marks.length) return <p className="empty-inline" style={{ margin: 0 }}>{empty}</p>;
  return (
    <div className="rs-notes">
      {marks.map((m, i) => (
        <button key={i} type="button" className={`rs-note ${active === i ? "on" : ""}`} onClick={() => show(i)}>
          <b>“{m.text.length > 40 ? `${m.text.slice(0, 38)}…` : m.text}”</b>
          <span>{m.note || "Marked as an error (no note)."}</span>
        </button>
      ))}
    </div>
  );
}

export const fmtWhen = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.toLocaleDateString(undefined, { day: "numeric", month: "short" })}, ${d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`;
};
