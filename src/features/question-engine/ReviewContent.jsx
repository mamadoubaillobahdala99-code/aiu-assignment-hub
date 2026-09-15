import React from "react";
import { Check, X as XIcon } from "lucide-react";
import { QuestionRenderer } from "./QuestionRenderer";
import { SummaryCompletion } from "./SummaryCompletion";
import { NotesCompletion } from "./NotesCompletion";
import { TableCompletion } from "./TableCompletion";
import { SentenceCompletion } from "./SentenceCompletion";
import { MatchingGrid } from "./MatchingGrid";
import { parseCompletionPayload } from "./bulkParse";

// showCorrectAnswers: when false, only ✓/✗ is shown — never the actual
// correct answer text (used for the student view when show_answer_review
// is off, or as a defensive default).
export function ReviewContent({ sections, answersByQ, resultsByQ, correctAnswersFormatted, showCorrectAnswers, assignmentId, viewerUserId }) {
  const correctMap = showCorrectAnswers ? correctAnswersFormatted : {};

  return (
    <div className="qe-review-content">
      {sections.map((section) => (
        <div key={section.id} className="qe-review-part">
          <h3 className="section-title">{section.title}</h3>
          {section.groups.map((group) => (
            <div key={group.id} className="qe-group-block">
              {group.instruction && <p className="qe-section-instruction">{group.instruction}</p>}
              {group.passageText ? (
                (() => {
                  const payload = parseCompletionPayload(group.passageText);
                  const commonProps = {
                    questions: group.questions,
                    answers: answersByQ,
                    onChange: () => {},
                    results: resultsByQ,
                    disabled: true,
                    startNumber: group.startNumber,
                    correctAnswers: correctMap,
                  };
                  if (payload.style === "notes") return <NotesCompletion blocks={payload.blocks || []} {...commonProps} />;
                  if (payload.style === "table") return <TableCompletion headers={payload.headers || []} rows={payload.rows || []} {...commonProps} />;
                  if (payload.style === "sentences") return <SentenceCompletion sentences={payload.sentences || []} {...commonProps} />;
                  return <SummaryCompletion text={payload.text} {...commonProps} />;
                })()
              ) : group.questions[0]?.type?.startsWith("matching_") ? (
                <MatchingGrid
                  questions={group.questions}
                  answers={answersByQ}
                  onChange={() => {}}
                  results={resultsByQ}
                  disabled
                  startNumber={group.startNumber}
                  assignmentId={assignmentId}
                  userId={viewerUserId}
                  correctAnswers={correctMap}
                />
              ) : (
                group.questions.map((q, i) => {
                  const num = group.startNumber + i;
                  const result = resultsByQ[q.id];
                  return (
                    <div key={q.id} id={`review-question-${num}`} className="qe-numbered-question qe-review-question">
                      <span className="rf-answer-num qe-question-badge">{num}</span>
                      <div style={{ flex: 1 }}>
                        <QuestionRenderer question={q} value={answersByQ[q.id] ?? null} onChange={() => {}} disabled assignmentId={assignmentId} userId={viewerUserId} />
                        <div className={result?.isCorrect ? "qe-result-correct" : "qe-result-incorrect"}>
                          {result ? (result.isCorrect ? <><Check size={13} /> Correct</> : <><XIcon size={13} /> Incorrect</>) : "Not answered"}
                        </div>
                        {result && !result.isCorrect && correctMap[q.id] && (
                          <div className="qe-review-correct-answer">Correct answer: {correctMap[q.id]}</div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
