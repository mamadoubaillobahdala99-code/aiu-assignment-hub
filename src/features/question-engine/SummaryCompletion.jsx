import React from "react";

// text contains "___" (3+ underscores) marking each blank, in order.
// questions is the ordered list of gap_fill questions, one per blank.
export function SummaryCompletion({ text, questions, answers, onChange, results, disabled }) {
  const parts = text.split(/_{3,}/);

  return (
    <p className="qe-completion-text">
      {parts.map((part, i) => {
        const question = questions[i];
        return (
          <React.Fragment key={i}>
            {part}
            {question && (
              <span className="qe-completion-blank-wrap">
                <span className="rf-answer-num" style={{ marginRight: 4 }}>{i + 1}</span>
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
      })}
    </p>
  );
}
