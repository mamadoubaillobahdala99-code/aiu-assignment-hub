import React from "react";

// value: array of selected letters, e.g. ["B", "D"]
export function MultipleSelection({ questionId, choices = [], requiredCount = 2, value = [], onChange, disabled }) {
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
              <span>{choice.text}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
