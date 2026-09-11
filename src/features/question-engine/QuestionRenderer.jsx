import React from "react";
import { TrueFalseNotGiven } from "./types/TrueFalseNotGiven";
import { MultipleChoice } from "./types/MultipleChoice";

// Add new question types here as they're built — this is the ONLY
// place that needs to know about all the types. Everywhere else in
// the app just calls <QuestionRenderer /> without caring what's inside.
export function QuestionRenderer({ question, value, onChange, disabled }) {
  switch (question.type) {
    case "true_false_not_given":
      return (
        <TrueFalseNotGiven
          prompt={question.prompt}
          labelSet={question.options?.label_set || "true_false"}
          value={value}
          onChange={onChange}
          disabled={disabled}
        />
      );
    case "multiple_choice":
      return (
        <MultipleChoice
          prompt={question.prompt}
          choices={question.options?.choices || []}
          value={value}
          onChange={onChange}
          disabled={disabled}
        />
      );
    default:
      return <p className="qe-prompt">Unsupported question type: {question.type}</p>;
  }
}

