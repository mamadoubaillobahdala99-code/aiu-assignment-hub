import React from "react";
import { HighlightableText } from "../HighlightableText";

export function MultipleChoice({ questionId, choices = [], value, onChange, disabled, assignmentId, userId }) {
  return (
    <div className="qe-question">
      <div className="qe-options">
        {choices.map((choice) => (
          <label key={choice.letter} className={`qe-option ${value === choice.letter ? "qe-option-selected" : ""}`}>
            <input
              type="radio"
              name={`mc-${questionId}`}
              checked={value === choice.letter}
              disabled={disabled}
              onChange={() => onChange(choice.letter)}
            />
            <span className="qe-letter-badge">{choice.letter}</span>
            {assignmentId && userId ? (
              <HighlightableText assignmentId={assignmentId} userId={userId} scopeType="question" scopeId={questionId} optionKey={choice.letter} text={choice.text} inline />
            ) : (
              <span>{choice.text}</span>
            )}
          </label>
        ))}
      </div>
    </div>
  );
}
