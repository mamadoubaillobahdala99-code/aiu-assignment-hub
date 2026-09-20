
import React from "react";
import { ArrowDown } from "lucide-react";

// Student / review rendering for three IELTS completion formats:
//   FormCompletion       — a real form: labels on the left, answers on the right
//   FlowchartCompletion  — boxes linked by arrows
//   WordBankCompletion   — summary where each gap is chosen from a lettered word list
// All three use gap_fill questions, one per blank, in reading order, and
// the same props as the other completion components.

function ResultMark({ question, results, correctAnswers, label }) {
  if (!results) return null;
  const ok = results[question.id]?.isCorrect;
  return (
    <>
      <span className={ok ? "qe-result-correct" : "qe-result-incorrect"} style={{ marginLeft: 4 }}>{ok ? "✓" : "✗"}</span>
      {!ok && correctAnswers?.[question.id] && (
        <span className="qe-review-correct-inline"> (correct: {label ? label(correctAnswers[question.id]) : correctAnswers[question.id]})</span>
      )}
    </>
  );
}

// Splits a text on ___ blanks and renders an answer box for each one,
// advancing the shared cursor so numbering continues across rows/boxes.
function renderBlanks(text, cursor, props) {
  const { questions, answers, onChange, results, disabled, startNumber, correctAnswers } = props;
  const parts = String(text || "").split(/_{3,}/);
  return parts.map((part, i) => {
    if (i === parts.length - 1) return <React.Fragment key={i}>{part}</React.Fragment>;
    const question = questions[cursor.n];
    const num = startNumber + cursor.n;
    cursor.n += 1;
    return (
      <React.Fragment key={i}>
        {part}
        {question && (
          <span className="qe-completion-blank-wrap" id={`question-${num}`}>
            <span className="rf-answer-num" style={{ marginRight: 4 }}>{num}</span>
            <input
              className="qe-completion-blank"
              value={answers[question.id] ?? ""}
              onChange={(e) => onChange(question.id, e.target.value)}
              disabled={disabled}
              spellCheck={false}
              autoComplete="off"
              aria-label={`Question ${num}`}
            />
            <ResultMark question={question} results={results} correctAnswers={correctAnswers} />
          </span>
        )}
      </React.Fragment>
    );
  });
}

export function FormCompletion({ title, rows, startNumber = 1, ...rest }) {
  const cursor = { n: 0 };
  const props = { startNumber, ...rest };
  return (
    <div className="qe-form-card">
      {title && <div className="qe-form-title">{title}</div>}
      <table className="qe-form-table">
        <tbody>
          {(rows || []).map((row, ri) => (
            <tr key={ri} className={row.example ? "qe-form-example" : ""}>
              {row.label ? (
                <>
                  <th scope="row">
                    {row.label}
                    {row.example && <span className="qe-form-example-tag">Example</span>}
                  </th>
                  <td>{row.example ? row.value : renderBlanks(row.value, cursor, props)}</td>
                </>
              ) : (
                <td colSpan={2} className="qe-form-fullrow">{row.example ? row.value : renderBlanks(row.value, cursor, props)}</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function FlowchartCompletion({ title, steps, startNumber = 1, ...rest }) {
  const cursor = { n: 0 };
  const props = { startNumber, ...rest };
  return (
    <div className="qe-flow">
      {title && <div className="qe-flow-title">{title}</div>}
      {(steps || []).map((step, si) => (
        <React.Fragment key={si}>
          <div className="qe-flow-box">{renderBlanks(step, cursor, props)}</div>
          {si < steps.length - 1 && (
            <div className="qe-flow-arrow" aria-hidden="true"><ArrowDown size={20} strokeWidth={2.4} /></div>
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

export function WordBankCompletion({ text, options, questions, answers, onChange, results, disabled, startNumber = 1, correctAnswers }) {
  const bank = options || [];
  const labelFor = (value) => {
    const letter = Array.isArray(value) ? value[0] : String(value || "").split(" / ")[0];
    const o = bank.find((x) => x.letter.toLowerCase() === String(letter).toLowerCase());
    return o ? `${o.letter} — ${o.text}` : String(value);
  };
  const parts = String(text || "").split(/_{3,}/);

  return (
    <div className="qe-wordbank">
      <ul className="qe-wordbank-list" aria-label="List of words">
        {bank.map((o) => (
          <li key={o.letter}><strong>{o.letter}</strong> {o.text}</li>
        ))}
      </ul>
      <p className="qe-completion-text">
        {parts.map((part, i) => {
          if (i === parts.length - 1) return <React.Fragment key={i}>{part}</React.Fragment>;
          const question = questions[i];
          const num = startNumber + i;
          return (
            <React.Fragment key={i}>
              {part}
              {question && (
                <span className="qe-completion-blank-wrap" id={`question-${num}`}>
                  <span className="rf-answer-num" style={{ marginRight: 4 }}>{num}</span>
                  <select
                    className="qe-wordbank-select"
                    value={answers[question.id] ?? ""}
                    onChange={(e) => onChange(question.id, e.target.value)}
                    disabled={disabled}
                    aria-label={`Question ${num}`}
                  >
                    <option value="">—</option>
                    {bank.map((o) => (
                      <option key={o.letter} value={o.letter}>{o.letter} — {o.text}</option>
                    ))}
                  </select>
                  <ResultMark question={question} results={results} correctAnswers={correctAnswers} label={labelFor} />
                </span>
              )}
            </React.Fragment>
          );
        })}
      </p>
    </div>
  );
}
