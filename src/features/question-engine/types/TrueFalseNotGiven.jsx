import React from "react";
import { HighlightableText } from "../HighlightableText";

const LABEL_SETS = {
  true_false: { positive: "True", negative: "False", not_given: "Not Given" },
  yes_no: { positive: "Yes", negative: "No", not_given: "Not Given" },
};
const LETTERS = { positive: "A", negative: "B", not_given: "C" };

export function TrueFalseNotGiven({ questionId, labelSet = "true_false", value, onChange, disabled, assignmentId, userId }) {
  const labels = LABEL_SETS[labelSet] || LABEL_SETS.true_false;

  return (
    <div className="qe-question">
      <div className="qe-options">
        {["positive", "negative", "not_given"].map((key) => (
          <label key={key} className={`qe-option ${value === key ? "qe-option-selected" : ""}`}>
            <input
              type="radio"
              name={`tfng-${questionId}`}
              checked={value === key}
              disabled={disabled}
              onChange={() => onChange(key)}
            />
            <span className="qe-letter-badge">{LETTERS[key]}</span>
            {assignmentId && userId ? (
              <HighlightableText assignmentId={assignmentId} userId={userId} scopeType="question" scopeId={questionId} optionKey={key} text={labels[key]} inline />
            ) : (
              <span>{labels[key]}</span>
            )}
          </label>
        ))}
      </div>
    </div>
  );
}
