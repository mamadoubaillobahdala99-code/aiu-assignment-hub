import React, { useRef } from "react";
import { Check, X as XIcon } from "lucide-react";
import { HighlightableText } from "./HighlightableText";
import { useElementWidth } from "./useViewport";

// How much room the sentence needs before the grid stops being a good
// idea, and how much each letter column costs (see matching.css).
//
// Below the sum of the two, the grid used to keep every letter column at
// its full 46px and take the whole shortfall out of the sentence: on a
// phone with eight options the sentence column reached ZERO pixels and
// one question ran 950px down the screen, one letter per line. Measured,
// not guessed. The same thing happened on a computer as soon as the
// splitter was pushed far enough — which is why this is measured on the
// panel and not on the window.
const MIN_PROMPT_PX = 220;
const CELL_PX = 46;

// questions: the group's questions, each sharing the same options.choices
// bank (every question in a matching group carries its own identical
// copy of the bank — same convention as multiple_choice/multiple_selection).
export function MatchingGrid({ questions, answers, onChange, results, disabled, startNumber = 1, assignmentId, userId, correctAnswers }) {
  const wrapRef = useRef(null);
  const width = useElementWidth(wrapRef);

  if (questions.length === 0) return null;
  const choices = questions[0].options?.choices || [];
  // Map/plan labelling: the letters are on the image itself, so the
  // choices have no text and the legend is not shown.
  const legend = choices.filter((c) => c.text && c.text.trim());

  // null = not measured yet: assume there is room, so a computer never
  // flashes the narrow layout on the first paint.
  const stacked = width !== null && width < MIN_PROMPT_PX + CELL_PX * choices.length;

  // The number, the sentence, and — on a review screen — the verdict and
  // the right answer. Identical in both layouts, so a correction reads
  // the same whichever one is on screen.
  function promptBody(q, num) {
    const result = results?.[q.id];
    return (
      <>
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
      </>
    );
  }

  return (
    <div className="qe-matching-wrap" ref={wrapRef}>
      {legend.length > 0 && (
        <ul className="qe-matching-legend">
          {legend.map((c) => (
            <li key={c.letter}><strong>{c.letter}.</strong> {c.text}</li>
          ))}
        </ul>
      )}

      {stacked ? (
        // Not enough room for a grid: the sentence takes the full width
        // and the letters sit underneath as buttons big enough for a
        // finger. Everything is visible at once — no sideways scrolling
        // to reach the right column.
        <div className="qe-match-list">
          {questions.map((q, i) => {
            const num = startNumber + i;
            return (
              <div key={q.id} id={`question-${num}`} className="qe-match-card">
                <div className="qe-match-card-prompt">{promptBody(q, num)}</div>
                <div className="qe-match-card-choices" role="radiogroup" aria-label={`Question ${num}`}>
                  {choices.map((c) => {
                    const picked = answers[q.id] === c.letter;
                    return (
                      <label key={c.letter} className={`qe-match-chip ${picked ? "selected" : ""} ${disabled ? "disabled" : ""}`}>
                        <input
                          type="radio"
                          name={`q-${q.id}`}
                          checked={picked}
                          onChange={() => onChange(q.id, c.letter)}
                          disabled={disabled}
                        />
                        <span>{c.letter}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
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
              return (
                <tr key={q.id} id={`question-${num}`}>
                  <td className="qe-matching-prompt">{promptBody(q, num)}</td>
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
      )}
    </div>
  );
}
