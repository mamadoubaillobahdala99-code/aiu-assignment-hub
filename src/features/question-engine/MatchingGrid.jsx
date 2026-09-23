import React from "react";
import { Check, X as XIcon } from "lucide-react";
import { HighlightableText } from "./HighlightableText";
import { useIsPhone } from "./useViewport";

// The grid is the real thing — it is what an IELTS paper looks like, and
// it stays on every screen big enough to hold a mouse: tablet and
// computer, always. When the questions panel is too narrow for it, it
// SLIDES sideways with the sentence column pinned, rather than squeezing
// the sentence (see matching.css).
//
// Only a phone gets the stacked layout instead. Sliding a grid with a
// thumb, on a screen where the pinned sentence would already eat half
// the width, is not worth defending; and a phone is barred from a real
// exam anyway, so nothing there has to look like the paper.
//
// An earlier version decided this from the width of the PANEL. It read
// the crushing correctly but drew the wrong conclusion: the questions
// panel is narrow by design — it is 44% of the screen next to the
// passage — so on an ordinary 1280px laptop even a four-option grid
// turned into a list. The panel being tight is normal; it is what
// sliding is for.

// questions: the group's questions, each sharing the same options.choices
// bank (every question in a matching group carries its own identical
// copy of the bank — same convention as multiple_choice/multiple_selection).
export function MatchingGrid({ questions, answers, onChange, results, disabled, startNumber = 1, assignmentId, userId, correctAnswers }) {
  const stacked = useIsPhone();

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
    <div className="qe-matching-wrap">
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
        // Slides sideways when the panel is narrower than the grid,
        // instead of the sentence column being squeezed to nothing.
        <div className="qe-matching-scroll">
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
        </div>
      )}
    </div>
  );
}
