import React from "react";
import { TrueFalseNotGiven } from "./types/TrueFalseNotGiven";
import { MultipleChoice } from "./types/MultipleChoice";
import { MultipleSelection } from "./types/MultipleSelection";
import { HighlightableText } from "./HighlightableText";

// Add new question types here as they're built — this is the ONLY
// place that needs to know about all the types. Everywhere else in
// the app just calls <QuestionRenderer /> without caring what's inside.
//
// assignmentId/userId, once passed here, are threaded down to every
// type component automatically — any future type built the same way
// (accepting them and using HighlightableText for its option text)
// gets highlighting for free, with no new plumbing required.
export function QuestionRenderer({ question, value, onChange, disabled, assignmentId, userId }) {
  const prompt = assignmentId && userId ? (
    <HighlightableText assignmentId={assignmentId} userId={userId} scopeType="question" scopeId={question.id} text={question.prompt} className="qe-prompt-highlightable" />
  ) : (
    <p className="qe-prompt">{question.prompt}</p>
  );

  const commonProps = { questionId: question.id, value, onChange, disabled, assignmentId, userId };

  switch (question.type) {
    case "true_false_not_given":
      return (
        <>
          {prompt}
          <TrueFalseNotGiven {...commonProps} labelSet={question.options?.label_set || "true_false"} />
        </>
      );
    case "multiple_choice":
      return (
        <>
          {prompt}
          <MultipleChoice {...commonProps} choices={question.options?.choices || []} />
        </>
      );
    case "multiple_selection":
      return (
        <>
          {prompt}
          <MultipleSelection {...commonProps} choices={question.options?.choices || []} requiredCount={question.options?.required_count || 2} value={value || []} />
        </>
      );
    default:
      return <p className="qe-prompt">Unsupported question type: {question.type}</p>;
  }
}
