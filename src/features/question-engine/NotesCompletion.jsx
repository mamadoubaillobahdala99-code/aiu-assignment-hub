
import React from "react";

// blocks: [{ type: "h2" | "h3" | "bullet" | "p", text }], produced by
// parseNotesMarkdown or the visual builder. Any block's text may contain
// "___" (3+ underscores) marking a blank, in reading order across all
// blocks. questions is the ordered list of gap_fill questions, one per
// blank, in that same order.
export function NotesCompletion({ blocks, questions, answers, onChange, results, disabled, startNumber = 1 }) {
  let blankCursor = 0;

  function renderText(text, keyPrefix) {
    const parts = text.split(/_{3,}/);
    return parts.map((part, i) => {
      if (i === parts.length - 1) return <React.Fragment key={`${keyPrefix}-${i}`}>{part}</React.Fragment>;
      const question = questions[blankCursor];
      const num = startNumber + blankCursor;
      blankCursor += 1;
      return (
        <React.Fragment key={`${keyPrefix}-${i}`}>
          {part}
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

  const rendered = [];
  let bulletBuffer = [];

  function flushBullets(key) {
    if (bulletBuffer.length > 0) {
      rendered.push(<ul className="qe-notes-list" key={`ul-${key}`}>{bulletBuffer}</ul>);
      bulletBuffer = [];
    }
  }

  blocks.forEach((block, idx) => {
    if (block.type === "bullet") {
      bulletBuffer.push(<li key={idx}>{renderText(block.text, `b${idx}`)}</li>);
      return;
    }
    flushBullets(idx);
    if (block.type === "h2") rendered.push(<h4 className="qe-notes-h2" key={idx}>{renderText(block.text, `h2-${idx}`)}</h4>);
    else if (block.type === "h3") rendered.push(<h5 className="qe-notes-h3" key={idx}>{renderText(block.text, `h3-${idx}`)}</h5>);
    else rendered.push(<p className="qe-notes-p" key={idx}>{renderText(block.text, `p-${idx}`)}</p>);
  });
  flushBullets("end");

  return <div className="qe-notes-completion">{rendered}</div>;
}
