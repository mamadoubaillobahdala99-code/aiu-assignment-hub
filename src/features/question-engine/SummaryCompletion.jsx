import React from "react";
import { HighlightableText } from "./HighlightableText";

// text contains "___" (3+ underscores) marking each blank, in order.
// questions is the ordered list of gap_fill questions, one per blank.
//
// Highlighting uses the same anchor-question technique as NotesCompletion
// and TableCompletion: reading_highlights.question_id has a foreign key
// into questions, so every static text segment is scoped under this
// group's first blank's question id (always present once blanks exist)
// with a unique optionKey per segment, keeping each segment's highlights
// independent without needing a question row for the surrounding prose.
export function SummaryCompletion({ text, questions, answers, onChange, results, disabled, startNumber = 1, assignmentId, userId, correctAnswers }) {
  const parts = text.split(/_{3,}/);
  const anchorId = questions[0]?.id;
  const canHighlight = Boolean(assignmentId && userId && anchorId);

  return (
    <p className="qe-completion-text">
      {parts.map((part, i) => {
        const question = questions[i];
        const segment = part ? (
          canHighlight ? (
            <HighlightableText
              inline
              assignmentId={assignmentId}
              userId={userId}
              scopeType="question"
              scopeId={anchorId}
              optionKey={`seg-${i}`}
              text={part}
            />
          ) : (
            <React.Fragment>{part}</React.Fragment>
          )
        ) : null;

        return (
          <React.Fragment key={i}>
            {segment}
            {question && (
              <span className="qe-completion-blank-wrap" id={`question-${startNumber + i}`}>
                <span className="rf-answer-num" style={{ marginRight: 4 }}>{startNumber + i}</span>
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
            {question && results && !results[question.id]?.isCorrect && correctAnswers?.[question.id] && (
              <span className="qe-review-correct-inline">correct: {correctAnswers[question.id]}</span>
            )}
          </React.Fragment>
        );
      })}
    </p>
  );
}
