import React from "react";
import { Check, X as XIcon } from "lucide-react";
import { HighlightableText } from "../HighlightableText";

// correctAnswer (an array of letters) is only passed on review screens.
// When present, the question is being reviewed rather than taken: every
// option shows ✓/✗ directly in the list, and nothing is dimmed — the
// student can't change anything anyway, so full legibility matters more
// than signalling which options are still pickable.
export function MultipleSelection({ questionId, choices = [], requiredCount = 2, value = [], onChange, disabled, assignmentId, userId, correctAnswer }) {
  const atLimit = value.length >= requiredCount;
  const reviewing = Array.isArray(correctAnswer) && correctAnswer.length > 0;
  const selected = Array.isArray(value) ? value : [];

  function toggle(letter) {
    if (selected.includes(letter)) {
      onChange(selected.filter((l) => l !== letter));
    } else if (!atLimit) {
      onChange([...selected, letter]);
    }
  }

  return (
    <div className="qe-question">
      {!reviewing && (
        <p className="qe-ms-hint">Choose {requiredCount} — {selected.length} of {requiredCount} selected</p>
      )}
      <div className="qe-options">
        {choices.map((choice) => {
          const checked = selected.includes(choice.letter);
          const isCorrectOption = reviewing && correctAnswer.includes(choice.letter);
          const wronglyPicked = reviewing && checked && !isCorrectOption;
          // Never dim anything while reviewing.
          const lockedOut = !reviewing && !checked && atLimit;
          return (
            <label key={choice.letter} className={`qe-option ${checked ? "qe-option-selected" : ""} ${lockedOut ? "qe-option-locked" : ""}`}>
              <input
                type="checkbox"
                checked={checked}
                disabled={disabled || lockedOut}
                onChange={() => toggle(choice.letter)}
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
