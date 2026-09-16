import React from "react";
import { Check, X as XIcon } from "lucide-react";
import { HighlightableText } from "../HighlightableText";

// correctAnswer (a single letter) is only passed on review screens —
// when present, ✓ marks the right option and ✗ marks a wrong pick,
// straight in the list, instead of restating the answer underneath.
export function MultipleChoice({ questionId, choices = [], value, onChange, disabled, assignmentId, userId, correctAnswer }) {
  const reviewing = Boolean(correctAnswer);

  return (
    <div className="qe-question">
      <div className="qe-options">
        {choices.map((choice) => {
          const checked = value === choice.letter;
          const isCorrectOption = reviewing && correctAnswer === choice.letter;
          const wronglyPicked = reviewing && checked && !isCorrectOption;
          return (
            <label key={choice.letter} className={`qe-option ${checked ? "qe-option-selected" : ""}`}>
              <input
                type="radio"
                name={`mc-${questionId}`}
                checked={checked}
                disabled={disabled}
                onChange={() => onChange(choice.letter)}
              />
              <span className="qe-letter-badge">{choice.letter}</span>
              {assignmentId && userId ? (
                <HighlightableText assignmentId={assignmentId} userId={userId} scopeType="question" scopeId={questionId} optionKey={choice.letter} text={choice.text} inline />
              ) : (
                <span>{choice.text}</span>
              )}
              {isCorrectOption && <Check size={15} className="qe-option-mark qe-option-mark-correct" />}
              {wronglyPicked && <XIcon size={15} className="qe-option-mark qe-option-mark-wrong" />}
            </label>
          );
        })}
      </div>
    </div>
  );
}
