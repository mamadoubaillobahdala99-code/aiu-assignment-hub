import React from "react";
import { HighlightableText } from "../HighlightableText";

export function MultipleSelection({ questionId, choices = [], requiredCount = 2, value = [], onChange, disabled, assignmentId, userId }) {
  const atLimit = value.length >= requiredCount;

  function toggle(letter) {
    if (value.includes(letter)) {
      onChange(value.filter((l) => l !== letter));
    } else if (!atLimit) {
      onChange([...value, letter]);
    }
  }

  return (
    <div className="qe-question">
      <p className="qe-ms-hint">Choose {requiredCount} — {value.length} of {requiredCount} selected</p>
      <div className="qe-options">
        {choices.map((choice) => {
          const checked = value.includes(choice.letter);
          const lockedOut = !checked && atLimit;
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
            </label>
          );
        })}
      </div>
    </div>
  );
}
