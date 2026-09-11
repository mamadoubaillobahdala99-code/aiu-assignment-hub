import React from "react";

// value: the letter of the chosen option, e.g. "A" | "B" | "C" | null
export function MultipleChoice({ prompt, choices = [], value, onChange, disabled }) {
  return (
    <div className="qe-question">
      <p className="qe-prompt">{prompt}</p>
      <div className="qe-options">
        {choices.map((choice) => (
          <label key={choice.letter} className={`qe-option ${value === choice.letter ? "qe-option-selected" : ""}`}>
            <input
              type="radio"
              name={`mc-${prompt}`}
              checked={value === choice.letter}
              disabled={disabled}
              onChange={() => onChange(choice.letter)}
            />
            <span className="qe-letter-badge">{choice.letter}</span>
            <span>{choice.text}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
