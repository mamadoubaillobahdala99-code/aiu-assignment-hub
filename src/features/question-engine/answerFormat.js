const TFNG_LABELS = {
  true_false: { positive: "True", negative: "False", not_given: "Not Given" },
  yes_no: { positive: "Yes", negative: "No", not_given: "Not Given" },
};

// Works for both a student's response and a question_answer_key's
// correct_answer — they use the same encoding per type, just that
// gap_fill's correct_answer is an array of accepted alternatives while
// its response is a single typed string.
export function formatAnswerValue(question, value) {
  if (value == null || value === "" || (Array.isArray(value) && value.length === 0)) return "(no answer)";

  if (question.type === "true_false_not_given") {
    const labels = TFNG_LABELS[question.options?.label_set] || TFNG_LABELS.true_false;
    return labels[value] || value;
  }

  if (question.type === "multiple_choice" || question.type.startsWith("matching_")) {
    const choice = question.options?.choices?.find((c) => c.letter === value);
    return choice ? `${value}. ${choice.text}` : String(value);
  }

  if (question.type === "multiple_selection") {
    const letters = Array.isArray(value) ? value : [value];
    return letters
      .map((letter) => {
        const choice = question.options?.choices?.find((c) => c.letter === letter);
        return choice ? `${letter}. ${choice.text}` : letter;
      })
      .join("; ");
  }

  // gap_fill (and any future plain-text type): correct_answer is an
  // array of accepted alternatives, response is one typed string.
  if (Array.isArray(value)) return value.join(" / ");
  return String(value);
}
