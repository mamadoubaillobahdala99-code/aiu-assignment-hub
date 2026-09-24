import React, { useRef } from "react";
import { Check, X as XIcon } from "lucide-react";
import { HighlightableText } from "./HighlightableText";
import { useIsPhone, useElementWidth } from "./useViewport";

// The grid is the real thing — it is what an IELTS paper looks like, and
// it stays on every screen big enough to hold a mouse: tablet and
// computer, always. It always fits its panel: when the panel narrows,
// the sentence wraps and the letter columns close up (see matching.css),
// so every letter stays in sight.
//
// Only a phone gets the stacked layout instead: a phone is barred from a
// real exam anyway, so nothing there has to look like the paper.

// How the grid gives way when its panel narrows. Measured, because the
// browser's own table layout does it in the worst order: it crushed the
// sentence to 30px — one question 597px tall, a ribbon of single letters
// — while the letter columns never gave up a pixel.
//
// Here both give way together. Past the comfortable width, every missing
// pixel is shared between the sentence (which wraps onto more lines) and
// the letter columns (which close up), in proportion to how much each can
// still give. The letters stop at the width of the tick box itself; the
// sentence keeps whatever is left. Nothing is ever pushed out of sight.
const LETTER_MAX = 62;   // the width these columns always had
const LETTER_MIN = 24;   // the 16px tick box and a little air
const PROMPT_EASY = 280; // above this the sentence reads on one or two lines
const PROMPT_FLOOR = 150; // below this it gets cramped

export function letterColumnWidth(available, count) {
  if (!available || !count) return LETTER_MAX;
  if (available >= PROMPT_EASY + count * LETTER_MAX) return LETTER_MAX;
  if (available <= PROMPT_FLOOR + count * LETTER_MIN) return LETTER_MIN;
  const promptGive = PROMPT_EASY - PROMPT_FLOOR;
  const lettersGive = count * (LETTER_MAX - LETTER_MIN);
  const missing = PROMPT_EASY + count * LETTER_MAX - available;
  return LETTER_MAX - (missing * lettersGive) / (promptGive + lettersGive) / count;
}

// questions: the group's questions, each sharing the same options.choices
// bank (every question in a matching group carries its own identical
// copy of the bank — same convention as multiple_choice/multiple_selection).
export function MatchingGrid({ questions, answers, onChange, results, disabled, startNumber = 1, assignmentId, userId, correctAnswers }) {
  const stacked = useIsPhone();
  const wrapRef = useRef(null);
  const width = useElementWidth(wrapRef);

  if (questions.length === 0) return null;
  const choices = questions[0].options?.choices || [];
  // Map/plan labelling: the letters are on the image itself, so the
  // choices have no text and the legend is not shown.
  const legend = choices.filter((c) => c.text && c.text.trim());

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
          {/* The sentence column has no width of its own: with a fixed
              layout it takes exactly what the letters leave. */}
          <colgroup>
            <col />
            {choices.map((c) => (
              <col key={c.letter} style={{ width: `${Math.round(letterColumnWidth(width, choices.length))}px` }} />
            ))}
          </colgroup>
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
