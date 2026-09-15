import React from "react";
import { HighlightableText } from "./HighlightableText";

// sentences: array of raw sentence strings, each possibly containing
// one or more ___ blanks. questions: ordered gap_fill questions, one
// per blank, in reading order across all sentences.
export function SentenceCompletion({ sentences, questions, answers, onChange, results, disabled, startNumber = 1, assignmentId, userId, correctAnswers }) {
  let blankCursor = 0;
  const anchorId = questions[0]?.id;
  const canHighlight = Boolean(assignmentId && userId && anchorId);

  function renderSentence(sentence, si) {
    const parts = sentence.split(/_{3,}/);
    return parts.map((part, i) => {
      const segment = part ? (
        canHighlight ? (
          <HighlightableText inline assignmentId={assignmentId} userId={userId} scopeType="question" scopeId={anchorId} optionKey={`s${si}-${i}`} text={part} />
        ) : (
          <React.Fragment>{part}</React.Fragment>
        )
      ) : null;

      if (i === parts.length - 1) return <React.Fragment key={i}>{segment}</React.Fragment>;
      const question = questions[blankCursor];
      const num = startNumber + blankCursor;
      blankCursor += 1;
      return (
        <React.Fragment key={i}>
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
              {results && !results[question.id]?.isCorrect && correctAnswers?.[question.id] && (
                <span className="qe-review-correct-inline"> (correct: {correctAnswers[question.id]})</span>
              )}
            </span>
          )}
        </React.Fragment>
      );
    });
  }

  return (
    <ol className="qe-sentence-completion">
      {sentences.map((sentence, si) => (
        <li key={si}>{renderSentence(sentence, si)}</li>
      ))}
    </ol>
  );
}

