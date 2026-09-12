import React from "react";
import { TrueFalseNotGiven } from "./types/TrueFalseNotGiven";
import { MultipleChoice } from "./types/MultipleChoice";
import { MultipleSelection } from "./types/MultipleSelection";
import { HighlightableText } from "./HighlightableText";

// Add new question types here as they're built — this is the ONLY
// place that needs to know about all the types. Everywhere else in
// the app just calls <QuestionRenderer /> without caring what's inside.
export function QuestionRenderer({ question, value, onChange, disabled, assignmentId, userId }) {
  const prompt = assignmentId && userId ? (
    <HighlightableText assignmentId={assignmentId} userId={userId} scopeType="question" scopeId={question.id} text={question.prompt} className="qe-prompt-highlightable" />
  ) : (
    <p className="qe-prompt">{question.prompt}</p>
  );

  switch (question.type) {
    case "true_false_not_given":
      return (
        <>
          {prompt}
          <TrueFalseNotGiven
            questionId={question.id}
            labelSet={question.options?.label_set || "true_false"}
            value={value}
            onChange={onChange}
            disabled={disabled}
          />
        </>
      );
    case "multiple_choice":
      return (
        <>
          {prompt}
          <MultipleChoice
            questionId={question.id}
            choices={question.options?.choices || []}
            value={value}
            onChange={onChange}
            disabled={disabled}
          />
        </>
      );
    case "multiple_selection":
      return (
        <>
          {prompt}
          <MultipleSelection
            questionId={question.id}
            choices={question.options?.choices || []}
            requiredCount={question.options?.required_count || 2}
            value={value || []}
            onChange={onChange}
            disabled={disabled}
          />
        </>
      );
    default:
      return <p className="qe-prompt">Unsupported question type: {question.type}</p>;
  }
}
