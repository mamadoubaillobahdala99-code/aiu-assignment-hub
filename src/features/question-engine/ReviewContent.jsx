import React, { useState } from "react";
import { Check, X as XIcon, BookOpen } from "lucide-react";
import { QuestionRenderer } from "./QuestionRenderer";
import { SummaryCompletion } from "./SummaryCompletion";
import { NotesCompletion } from "./NotesCompletion";
import { TableCompletion } from "./TableCompletion";
import { SentenceCompletion } from "./SentenceCompletion";
import { PassageView } from "./PassageImages";
import { FormCompletion, FlowchartCompletion, WordBankCompletion } from "./CompletionExtras";
import { MatchingGrid } from "./MatchingGrid";
import { AudioPlayer } from "./AudioPlayer";
import { parseCompletionPayload, numberQuestions, questionSlotCount } from "./bulkParse";
import { GroupImage } from "./GroupImage";

// Shown above a Part's questions on the review/feedback screens — lets
// the student (or teacher) look back at the original passage or replay
// the audio once the exam is over. Audio is always unlimited here: the
// answers are already locked in, so the original play-limit no longer
// serves any purpose.
function SectionPassage({ section }) {
  const [expanded, setExpanded] = useState(false);
  if (!section.passageText && !section.audioUrl) return null;

  return (
    <div className="qe-review-passage">
      {section.audioUrl && <AudioPlayer inline url={section.audioUrl} filename={section.passageTitle || section.title} maxPlays={null} />}
      {section.passageText && (
        <>
          <button type="button" className="btn-ghost" onClick={() => setExpanded((v) => !v)}>
            <BookOpen size={13} /> {expanded ? "Hide passage" : "View reading passage"}
          </button>
          {expanded && (
            <div className="qe-review-passage-text">
              {section.passageTitle && <h4>{section.passageTitle}</h4>}
              <PassageView text={section.passageText} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

// showCorrectAnswers: when false, only ✓/✗ is shown — never the actual
// correct answer text (used for the student view when show_answer_review
// is off, or as a defensive default).
//
// correctAnswersRaw carries the stored answer values (a letter, or an
// array of letters) so option-based types can mark the right option
// directly in the list. correctAnswersFormatted is the human-readable
// version, still needed by gap-fill style questions that have no option
// list to mark.
export function ReviewContent({ sections, answersByQ, resultsByQ, correctAnswersFormatted, correctAnswersRaw, showCorrectAnswers, assignmentId, viewerUserId, answerKeyMode = false }) {
  const correctMap = showCorrectAnswers ? correctAnswersFormatted : {};
  const rawMap = showCorrectAnswers ? (correctAnswersRaw || {}) : {};

  return (
    <div className="qe-review-content">
      {sections.map((section) => (
        <div key={section.id} className="qe-review-part">
          <h3 className="section-title">{section.title}</h3>
          <SectionPassage section={section} />
          {section.groups.map((group) => (
            <div key={group.id} className="qe-group-block">
              {group.instruction && <p className="qe-section-instruction">{group.instruction}</p>}
              {group.imageUrl && <GroupImage url={group.imageUrl} />}
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
                  if (payload.style === "form") return <FormCompletion title={payload.title} rows={payload.rows || []} {...commonProps} />;
                  if (payload.style === "flowchart") return <FlowchartCompletion title={payload.title} steps={payload.steps || []} {...commonProps} />;
                  if (payload.style === "wordbank") return <WordBankCompletion text={payload.text} options={payload.options || []} {...commonProps} />;
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
              ) : (() => {
                const groupNumbers = numberQuestions(group.questions, group.startNumber).numbers;
                return group.questions.map((q, i) => {
                  const num = groupNumbers[i];
                  const result = resultsByQ[q.id];
                  // Option-based types mark ✓/✗ directly in their own
                  // option list, so restating the answer below would be
                  // redundant. Only types without an option list still
                  // need the written-out answer.
                  const marksOptionsInline = ["true_false_not_given", "multiple_choice", "multiple_selection"].includes(q.type);
                  return (
                    <div key={q.id} id={`review-question-${num}`} className="qe-numbered-question qe-review-question">
                      {/* "choose TWO letters" holds two numbers: 21–22 */}
                      <span className="rf-answer-num qe-question-badge">{questionSlotCount(q) > 1 ? `${num}–${num + questionSlotCount(q) - 1}` : num}</span>
                      <div style={{ flex: 1 }}>
                        <QuestionRenderer question={q} value={answersByQ[q.id] ?? null} onChange={() => {}} disabled assignmentId={assignmentId} userId={viewerUserId} correctAnswer={rawMap[q.id]} />
                        {/* answerKeyMode: nobody has sat this paper — the
                            teacher is reading his own answer key. Marking
                            it "Correct" or "Not answered" would be
                            nonsense, so the line just says what it is.
                            Off by default: the two screens that show a
                            real copy are untouched. */}
                        {answerKeyMode ? (
                          <div className="qe-result-correct">
                            <Check size={13} /> Answer key{!marksOptionsInline && correctMap[q.id] ? `: ${correctMap[q.id]}` : ""}
                          </div>
                        ) : (
                          <>
                            <div className={result?.isCorrect ? "qe-result-correct" : "qe-result-incorrect"}>
                              {result ? (result.isCorrect ? <><Check size={13} /> Correct</> : <><XIcon size={13} /> Incorrect</>) : "Not answered"}
                            </div>
                            {!marksOptionsInline && result && !result.isCorrect && correctMap[q.id] && (
                              <div className="qe-review-correct-answer">Correct answer: {correctMap[q.id]}</div>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })
              })()}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
