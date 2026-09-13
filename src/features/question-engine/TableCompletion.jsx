import React from "react";
import { HighlightableText } from "./HighlightableText";

// headers: column titles for the data columns (row-label column is implicit).
// rows: [{ label, cells: [cellText, ...] }]. A cell's text may hold several
// lines — a line starting with "-" renders as a bullet — and any line may
// contain "___" (3+ underscores) marking a blank. Blanks are numbered in
// reading order: row by row, top to bottom, then column by column within
// a row, matching how a person reads the table left to right.
//
// Highlighting uses the same anchor-question technique as NotesCompletion
// — see the comment there for why.
export function TableCompletion({ headers, rows, questions, answers, onChange, results, disabled, startNumber = 1, assignmentId, userId }) {
  let blankCursor = 0;
  const anchorId = questions[0]?.id;
  const canHighlight = Boolean(assignmentId && userId && anchorId);

  function renderLine(line, keyPrefix) {
    const parts = line.split(/_{3,}/);
    return parts.map((part, i) => {
      const segment = part ? (
        canHighlight ? (
          <HighlightableText
            inline
            assignmentId={assignmentId}
            userId={userId}
            scopeType="question"
            scopeId={anchorId}
            optionKey={`${keyPrefix}-${i}`}
            text={part}
          />
        ) : (
          <React.Fragment>{part}</React.Fragment>
        )
      ) : null;

      if (i === parts.length - 1) return <React.Fragment key={`${keyPrefix}-${i}`}>{segment}</React.Fragment>;
      const question = questions[blankCursor];
      const num = startNumber + blankCursor;
      blankCursor += 1;
      return (
        <React.Fragment key={`${keyPrefix}-${i}`}>
          {segment}
          {question && (
            <span className="qe-completion-blank-wrap" id={`question-${num}`}>
              <span className="rf-answer-num" style={{ marginRight: 4 }}>{num}</span>
              <input
                className="qe-completion-blank"
                value={answers[question.id] ?? ""}
                onChange={(e) => onChange(question.id, e.target.value)}
                disabled={disabled}
              />
              {results && (
                <span className={results[question.id]?.isCorrect ? "qe-result-correct" : "qe-result-incorrect"} style={{ marginLeft: 4 }}>
                  {results[question.id]?.isCorrect ? "✓" : "✗"}
                </span>
              )}
            </span>
          )}
        </React.Fragment>
      );
    });
  }

  function renderCell(text, keyPrefix) {
    const lines = (text || "").split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) return null;
    if (lines.length === 1 && !lines[0].startsWith("- ")) {
      return <span>{renderLine(lines[0], keyPrefix)}</span>;
    }
    return (
      <ul className="qe-table-cell-list">
        {lines.map((line, li) => (
          <li key={li}>{renderLine(line.replace(/^-\s*/, ""), `${keyPrefix}-${li}`)}</li>
        ))}
      </ul>
    );
  }

  return (
    <table className="qe-completion-table">
      <thead>
        <tr>
          <th></th>
          {headers.map((h, ci) => (
            <th key={ci}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, ri) => (
          <tr key={ri}>
            <th className="qe-table-row-label">{row.label}</th>
            {row.cells.map((cell, ci) => (
              <td key={ci}>{renderCell(cell, `r${ri}c${ci}`)}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
