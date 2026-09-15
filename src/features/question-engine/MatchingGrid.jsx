import React from "react";
import { Check, X as XIcon } from "lucide-react";
import { HighlightableText } from "./HighlightableText";

// questions: the group's questions, each sharing the same options.choices
// bank (every question in a matching group carries its own identical
// copy of the bank — same convention as multiple_choice/multiple_selection).
export function MatchingGrid({ questions, answers, onChange, results, disabled, startNumber = 1, assignmentId, userId, correctAnswers }) {
  if (questions.length === 0) return null;
  const choices = questions[0].options?.choices || [];

  return (
    <div className="qe-matching-wrap">
      <ul className="qe-matching-legend">
        {choices.map((c) => (
          <li key={c.letter}><strong>{c.letter}.</strong> {c.text}</li>
        ))}
      </ul>

      <table className="qe-matching-grid">
        <thead>
          <tr>
            <th></th>
            {choices.map((c) => (
              <th key={c.letter}>{c.letter}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {questions.map((q, i) => {
            const num = startNumber + i;
            const result = results?.[q.id];
            return (
              <tr key={q.id} id={`question-${num}`}>
                <td className="qe-matching-prompt">
                  <span className="rf-answer-num" style={{ marginRight: 6 }}>{num}</span>
                  {assignmentId && userId ? (
                    <HighlightableText inline assignmentId={assignmentId} userId={userId} scopeType="question" scopeId={q.id} text={q.prompt} />
                  ) : (
                    q.prompt
                  )}
                  {result && (
                    <span className={result.isCorrect ? "qe-result-correct" : "qe-result-incorrect"} style={{ marginLeft: 6 }}>
                      {result.isCorrect ? <Check size={13} /> : <XIcon size={13} />}
                    </span>
                  )}
                  {result && !result.isCorrect && correctAnswers?.[q.id] && (
                    <span className="qe-review-correct-inline"> (correct: {correctAnswers[q.id]})</span>
                  )}
                </td>
                {choices.map((c) => (
                  <td key={c.letter} className="qe-matching-cell">
                    <input
                      type="radio"
                      name={`q-${q.id}`}
                      checked={answers[q.id] === c.letter}
                      onChange={() => onChange(q.id, c.letter)}
                      disabled={disabled}
                    />
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
