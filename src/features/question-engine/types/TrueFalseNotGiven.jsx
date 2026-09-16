import React from "react";
import { Check, X as XIcon } from "lucide-react";
import { HighlightableText } from "../HighlightableText";

const LABEL_SETS = {
  true_false: { positive: "True", negative: "False", not_given: "Not Given" },
  yes_no: { positive: "Yes", negative: "No", not_given: "Not Given" },
};
const LETTERS = { positive: "A", negative: "B", not_given: "C" };

// correctAnswer (one of the keys) is only passed on review screens.
export function TrueFalseNotGiven({ questionId, labelSet = "true_false", value, onChange, disabled, assignmentId, userId, correctAnswer }) {
  const labels = LABEL_SETS[labelSet] || LABEL_SETS.true_false;
  const reviewing = Boolean(correctAnswer);

  return (
    <div className="qe-question">
      <div className="qe-options">
        {["positive", "negative", "not_given"].map((key) => {
          const checked = value === key;
          const isCorrectOption = reviewing && correctAnswer === key;
          const wronglyPicked = reviewing && checked && !isCorrectOption;
          return (
            <label key={key} className={`qe-option ${checked ? "qe-option-selected" : ""}`}>
              <input
                type="radio"
                name={`tfng-${questionId}`}
                checked={checked}
                disabled={disabled}
                onChange={() => onChange(key)}
              />
              <span className="qe-letter-badge">{LETTERS[key]}</span>
              {assignmentId && userId ? (
                <HighlightableText assignmentId={assignmentId} userId={userId} scopeType="question" scopeId={questionId} optionKey={key} text={labels[key]} inline />
              ) : (
                <span>{labels[key]}</span>
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
