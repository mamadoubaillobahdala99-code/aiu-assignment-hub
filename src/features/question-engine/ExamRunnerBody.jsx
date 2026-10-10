// =====================================================================
// The exam screen (student), during the exam: the questions of the part
// shown, and the page around them (panel, top bar, text, numbers, the
// « Submit exam » window).
// Livraison 99 — moved out of StudentExamRunner.jsx without any change.
// StudentExamRunner keeps every read, save, timer and hand-in; what is
// here only shows. The render functions are plain functions called while
// the page renders (not components), so React sees exactly the same page.
// =====================================================================
import React from "react";
import { AudioPlayer } from "./AudioPlayer";
import { ChevronLeft, ChevronRight, GripVertical, Headphones, Menu, X } from "lucide-react";
import { ExamExitButton, ExamFullscreenButton, ExamStripButtons } from "./ExamSidebarButtons";
import { ExamTimerDisplay } from "./ExamTimer";
import { FlowchartCompletion, FormCompletion, WordBankCompletion } from "./CompletionExtras";
import { GroupImage } from "./GroupImage";
import { HighlightableText } from "./HighlightableText";
import { InvigilationOverlay } from "./InvigilationOverlay";
import { ListeningAudioBar } from "./ListeningAudio";
import { MatchingGrid } from "./MatchingGrid";
import { NotesCompletion } from "./NotesCompletion";
import { QuestionRenderer } from "./QuestionRenderer";
import { SentenceCompletion } from "./SentenceCompletion";
import { SummaryCompletion } from "./SummaryCompletion";
import { TableCompletion } from "./TableCompletion";
import { parseCompletionPayload, questionSlotCount } from "./bulkParse";

// The questions of the part shown (and the score once handed in).
export function renderQuestions(v) {
  const { activeSection, answers, assignmentId, questionLabel, results, setAnswers, totalPointsEarned, totalPointsPossible, userId } = v;
  return (
    <>
      {results && (
        <div className="feedback-panel" style={{ marginBottom: 16 }}>
          <div className="feedback-band">{totalPointsEarned} / {totalPointsPossible} points</div>
        </div>
      )}

      {activeSection.groups.map((group) => (
        <div key={group.id} className="qe-group-block">
          <div className="qe-group-heading">
            {group.startNumber === group.endNumber ? `Question ${group.startNumber}` : `Questions ${group.startNumber}-${group.endNumber}`}
          </div>
          {group.instruction && <p className="qe-section-instruction">{group.instruction}</p>}
          {group.imageUrl && <GroupImage url={group.imageUrl} />}

          {group.passageText ? (
            (() => {
              const payload = parseCompletionPayload(group.passageText);
              const commonProps = {
                questions: group.questions,
                answers,
                onChange: (qid, val) => setAnswers((prev) => ({ ...prev, [qid]: val })),
                results,
                disabled: results !== null,
                startNumber: group.startNumber,
                assignmentId,
                userId,
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
              answers={answers}
              onChange={(qid, val) => setAnswers((prev) => ({ ...prev, [qid]: val }))}
              results={results}
              disabled={results !== null}
              startNumber={group.startNumber}
              assignmentId={assignmentId}
              userId={userId}
            />
          ) : (
            group.questions.map((q, i) => (
              <div key={q.id} id={`question-${group.questionNumbers[i]}`} className="qe-numbered-question">
                <span className="rf-answer-num qe-question-badge">{questionLabel(group.questionNumbers[i], q)}</span>
                <div style={{ flex: 1 }}>
                  <QuestionRenderer
                    question={q}
                    value={answers[q.id] ?? null}
                    onChange={(val) => setAnswers((prev) => ({ ...prev, [q.id]: val }))}
                    disabled={results !== null}
                    assignmentId={assignmentId}
                    userId={userId}
                  />
                  {results && (
                    <div className={results[q.id]?.isCorrect ? "qe-result-correct" : "qe-result-incorrect"}>
                      {q.points > 1
                        ? `${results[q.id]?.earned ?? 0} / ${q.points} points`
                        : results[q.id]?.isCorrect ? "Correct" : "Incorrect"}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      ))}
    </>
  );
}

// The whole exam page.
export function renderExamPage(v) {
  const { activeIndex, activePassageText, activeSection, activeTitle, assignment, assignmentId, audioOpen, bodyRef, className, compact, confirmOpen, goToNumber, holdRef, inExam, invig, isListening, jumpToQuestion, leftWidthPct, listeningAudio, mobileTab, navBarRef, onAudioTimeUp, partRangeEnd, partRangeStart, perPartMinutes, questionsContent, questionsPanelRef, results, sections, setActiveIndex, setAudioOpen, setConfirmOpen, setMobileTab, setScreen, setSidebarOpen, sidebarOpen, singleAudioUrl, slotOwner, slotsOf, started, startResize, submitAll, submitting, teacherName, timeOver, timer, unansweredSlots, userId, visibleNum } = v;
  return (
    <div className={`wf-overlay qe-exam-shell ${compact ? "qe-compact" : ""}`}>
      <InvigilationOverlay invig={invig} />
      <div className="qe-exam-layout">
        {/* On a small screen the panel slides over the page instead of
            taking a fixed column; tapping the dark backdrop closes it. */}
        {compact && sidebarOpen && <div className="qe-exam-drawer-backdrop" onClick={() => setSidebarOpen(false)} />}
        <aside className={`qe-exam-sidebar ${sidebarOpen ? "" : "collapsed"} ${compact ? "qe-exam-drawer" : ""}`}>
          {!compact && (
            <button
              className="qe-exam-sidebar-toggle"
              onClick={() => setSidebarOpen((v) => !v)}
              title={sidebarOpen ? "Hide panel" : "Show panel"}
            >
              {sidebarOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
            </button>
          )}

          {!compact && !sidebarOpen && (
            <ExamStripButtons
              showExit={!invig.watched}
              showSubmit={results === null}
              submitting={submitting}
              onSubmit={() => setConfirmOpen(true)}
              onExit={() => { invig.stopWatching(); setScreen({ name: "home" }); }}
            />
          )}

          {sidebarOpen && (
            <div className="qe-exam-sidebar-inner">
              {teacherName && <div className="qe-exam-teacher-band">{teacherName}</div>}
              {compact && (
                <button className="qe-exam-drawer-close" onClick={() => setSidebarOpen(false)} title="Close">
                  <X size={16} /> Close
                </button>
              )}
              <div className="qe-exam-sidebar-title">Assignment</div>

              {isListening && !singleAudioUrl && activeSection.audioUrl && (
                <button
                  className={`qe-exam-sidebar-item ${audioOpen ? "active" : ""}`}
                  onClick={() => setAudioOpen((v) => !v)}
                >
                  <Headphones size={15} /> Audio file
                </button>
              )}

              {className && (
                <div className="qe-exam-sidebar-section">
                  <div className="qe-exam-sidebar-label">Class</div>
                  <div className="qe-exam-sidebar-value">{className}</div>
                </div>
              )}

              <ExamFullscreenButton invig={invig} />

              {results === null && (
                <button className="btn-primary qe-exam-sidebar-submit" disabled={submitting} onClick={() => setConfirmOpen(true)}>
                  {submitting ? "Submitting…" : "Submit exam"}
                </button>
              )}

              <ExamExitButton invig={invig} onExit={() => { invig.stopWatching(); setScreen({ name: "home" }); }} />
            </div>
          )}
        </aside>

        <div className="qe-exam-main">
          <div className="app-topbar qe-exam-topbar">
            {compact && (
              <button className="qe-exam-menu-btn" onClick={() => setSidebarOpen(true)} title="Menu" aria-label="Open the menu">
                <Menu size={18} />
              </button>
            )}
            Assignment
            {timer.status === "running" && results === null && <ExamTimerDisplay remainingSec={timer.remainingSec} />}
          </div>

          {/* Reading on a small screen: the text and the questions take
              turns instead of sharing a 390px-wide row. */}
          {compact && !isListening && (
            <div className="qe-tabbar" role="tablist">
              <button
                role="tab"
                aria-selected={mobileTab === "text"}
                className={`qe-tab ${mobileTab === "text" ? "active" : ""}`}
                onClick={() => setMobileTab("text")}
              >
                Text
              </button>
              <button
                role="tab"
                aria-selected={mobileTab === "questions"}
                className={`qe-tab ${mobileTab === "questions" ? "active" : ""}`}
                onClick={() => setMobileTab("questions")}
              >
                Questions{partRangeStart !== null ? ` ${partRangeStart}-${partRangeEnd}` : ""}
              </button>
            </div>
          )}
          {isListening ? (
        <div className="qe-exam-body qe-listening-body" ref={bodyRef}>
          <div className="qe-listening-panel" ref={questionsPanelRef}>
            <p className="qe-part-tag">{activeSection.title}</p>
            {partRangeStart !== null && (
              <p className="qe-part-quicksummary">Listen and answer questions {partRangeStart}-{partRangeEnd}</p>
            )}
            {singleAudioUrl && (
              <div className="qe-lsa-wrap">
                <ListeningAudioBar
                  url={singleAudioUrl}
                  filename={assignment.title}
                  audio={listeningAudio}
                  onTimeUp={onAudioTimeUp}
                  disabled={results !== null || timeOver}
                  autoStart={inExam && started}
                />
              </div>
            )}
            {!singleAudioUrl && activeSection.audioUrl && audioOpen && (
              <AudioPlayer
                key={activeSection.id}
                url={activeSection.audioUrl}
                maxPlays={activeSection.maxPlays}
                assignmentId={assignmentId}
                userId={userId}
                sectionId={activeSection.id}
                onClose={() => setAudioOpen(false)}
              />
            )}
            {questionsContent}
          </div>
        </div>
      ) : (
        <div className="qe-exam-body" ref={bodyRef}>
          <div
            className={`qe-passage-panel ${compact && mobileTab !== "text" ? "qe-tab-hidden" : ""}`}
            style={compact ? undefined : { flexBasis: `${leftWidthPct}%` }}
          >
            <div className="qe-passage-panel-inner">
              <p className="qe-part-tag">{activeSection.title}</p>
              {partRangeStart !== null && (
                <p className="qe-part-quicksummary">Read the text and answer questions {partRangeStart}-{partRangeEnd}</p>
              )}
              {perPartMinutes !== null && partRangeStart !== null && (
                <p className="qe-passage-meta">
                  You should spend about {perPartMinutes} minutes on Questions {partRangeStart}-{partRangeEnd}, which are based on Reading Passage {activeIndex + 1} below.
                </p>
              )}
              {activeTitle && <h2 className="qe-passage-title">{activeTitle}</h2>}
              <HighlightableText assignmentId={assignmentId} userId={userId} scopeType="passage" scopeId={activeSection.id} text={activePassageText} images />
            </div>
          </div>

          {!compact && (
            <div className="qe-resizer" onPointerDown={startResize}>
              <GripVertical size={14} />
            </div>
          )}

          <div
            className={`qe-questions-panel ${compact && mobileTab !== "questions" ? "qe-tab-hidden" : ""}`}
            ref={questionsPanelRef}
            style={compact ? undefined : { flexBasis: `${100 - leftWidthPct}%` }}
          >
            {questionsContent}
          </div>
        </div>
      )}

      <div className="qe-nav-bar" ref={navBarRef}>
        {sections.map((s, i) => {
          // Counted in answer-sheet numbers: a "choose TWO" question is two.
          const total = s.groups.reduce((sum, g) => sum + g.questions.reduce((n, q) => n + questionSlotCount(q), 0), 0);
          if (i !== activeIndex) {
            return (
              <div key={s.id} className="qe-nav-part-segment inactive-part" onClick={() => { holdRef.current = false; setActiveIndex(i); if (compact) setMobileTab("text"); }}>
                <button className="qe-nav-part-pill">{s.title}: {total} question{total !== 1 ? "s" : ""}</button>
              </div>
            );
          }
          return (
            <div key={s.id} className="qe-nav-part-segment qe-nav-seg-numbers">
              <div className="qe-nav-active-part">
                <span className="qe-nav-part-label">{s.title}</span>
                <div className="qe-nav-numbers">
                  {s.groups.flatMap((group) => group.questions.flatMap((q, qi) => slotsOf(group, q, qi))).map((num) => (
                    <button
                      key={num}
                      className={`qe-question-nav-item ${slotOwner[num] === visibleNum ? "qe-nav-item-visible" : ""}`}
                      onClick={() => goToNumber(num)}
                    >
                      {num}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
          </div>
        </div>
      </div>

      {confirmOpen && (
        <div className="qe-confirm-backdrop" onClick={() => setConfirmOpen(false)}>
          <div className="qe-confirm-card" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h2 className="qe-confirm-title">Submit exam</h2>
            <p className="qe-confirm-text">Are you sure you want to finish and submit? You can't change your answers afterwards.</p>

            {unansweredSlots.length > 0 ? (
              <>
                <p className="qe-confirm-text" style={{ fontWeight: 600 }}>
                  {unansweredSlots.length} question{unansweredSlots.length > 1 ? "s have" : " has"} no answer yet:
                </p>
                <div className="qe-confirm-unanswered">
                  {unansweredSlots.map((u) => (
                    <button key={u.num} className="qe-confirm-chip" onClick={() => jumpToQuestion(u.num, u.partIndex)} title="Go to this question">
                      {u.num}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <p className="qe-confirm-text qe-confirm-allset">All questions have an answer.</p>
            )}

            <div className="qe-confirm-actions">
              <button className="btn-ghost" onClick={() => setConfirmOpen(false)}>Keep working</button>
              <button className="btn-primary" disabled={submitting} onClick={() => submitAll(false)}>
                {submitting ? "Submitting…" : "Submit exam"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
