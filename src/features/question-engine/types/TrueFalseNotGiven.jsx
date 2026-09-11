import React from "react";

const LABEL_SETS = {
  true_false: { positive: "True", negative: "False", not_given: "Not Given" },
  yes_no: { positive: "Yes", negative: "No", not_given: "Not Given" },
};
const LETTERS = { positive: "A", negative: "B", not_given: "C" };

// value: "positive" | "negative" | "not_given" | null
export function TrueFalseNotGiven({ prompt, labelSet = "true_false", value, onChange, disabled }) {
  const labels = LABEL_SETS[labelSet] || LABEL_SETS.true_false;

  return (
    <div className="qe-question">
      <p className="qe-prompt">{prompt}</p>
      <div className="qe-options">
        {["positive", "negative", "not_given"].map((key) => (
          <label key={key} className={`qe-option ${value === key ? "qe-option-selected" : ""}`}>
            <input
              type="radio"
              name={`tfng-${prompt}`}
              checked={value === key}
              disabled={disabled}
              onChange={() => onChange(key)}
            />
            <span className="qe-letter-badge">{LETTERS[key]}</span>
            <span>{labels[key]}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
