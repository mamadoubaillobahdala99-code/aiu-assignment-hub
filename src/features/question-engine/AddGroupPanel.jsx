import React, { useState, useEffect } from "react";
import { Plus, X, Check } from "lucide-react";
import { TeacherQuestionForm } from "./TeacherQuestionForm";
import { defaultInstructionFor, numberQuestions, FORM_INSTRUCTION, FLOWCHART_INSTRUCTION, WORDBANK_INSTRUCTION, SHORT_ANSWER_INSTRUCTION } from "./bulkParse";
import { SummaryCompletionBuilder, NotesCompletionBuilder, TableCompletionBuilder, SentenceCompletionBuilder } from "./TeacherReadingBuilder";
import { MatchingBuilder } from "./MatchingBuilder";
import { LabellingBuilder } from "./LabellingBuilder";
import { GroupImagePicker } from "./GroupImage";
import { FormCompletionBuilder, FlowchartCompletionBuilder, WordBankCompletionBuilder, ShortAnswerBuilder } from "./CompletionExtraBuilders";

// ONE new question group, added to an existing paper from the paper
// editor. It uses exactly the same tools as the Reading / Listening
// creation screens (the same sub-builders, the same choices), so a teacher
// finds what she already knows. The questions are created by those tools
// as usual; the group is attached to the paper only when the editor saves
// (save_paper_edits, "add_groups").
//
// isReady(group) tells the editor whether the group is complete.

export function newAddedGroup(skill) {
  return {
    localId: crypto.randomUUID(),
    instruction: "",
    mode: "questions",
    completionStyle: "paragraph",
    matchingType: skill === "reading" ? "matching_information" : "matching_features",
    labellingKind: "map",
    imageUrl: "",
    questions: [],
    summaryText: "",
  };
}

export function isAddedGroupReady(g) {
  if (g.questions.length === 0) return false;
  if (g.mode === "completion") return Boolean(g.summaryText.trim());
  if (g.mode === "labelling") return Boolean(g.imageUrl);
  return true;
}

// onUpdate(fn): fn receives the group as it is NOW and returns the new
// one. The sub-builders can report two things in a row (text, then
// blanks); a plain "new object" would lose the first one.
export function AddGroupPanel({ group, onUpdate, onCancel, teacherId, skill, startNumber }) {
  const [addingQuestion, setAddingQuestion] = useState(false);
  const patch = (p) => onUpdate((g) => ({ ...g, ...p }));
  const numbering = numberQuestions(group.questions, startNumber);

  // A new mode / style / matching type starts the group again.
  const restart = (p) => onUpdate((g) => ({ ...g, ...p, questions: [], summaryText: "" }));

  useEffect(() => {
    if (group.mode !== "questions") setAddingQuestion(false);
  }, [group.mode]);

  function onQuestionCreated(question) {
    onUpdate((g) => ({
      ...g,
      instruction: g.questions.length === 0 && !g.instruction ? defaultInstructionFor(question.type, question.options) : g.instruction,
      questions: [...g.questions, question],
    }));
    setAddingQuestion(false);
  }
  const onBlanks = (questions) => patch({ questions });
  const onBlanksWith = (instr) => (questions) => onUpdate((g) => ({ ...g, questions, instruction: g.instruction || instr }));
  const onSummary = (text) => patch({ summaryText: text });

  const matchingChoices =
    skill === "reading"
      ? [
          ["matching_headings", "Headings"],
          ["matching_information", "Information"],
          ["matching_features", "Features"],
          ["matching_sentence_endings", "Sentence Endings"],
        ]
      : [
          ["matching_features", "Choose from a box / list"],
          ["matching_sentence_endings", "Sentence Endings"],
        ];

  return (
    <div className="qe-pe-group qe-pe-new">
      <div className="qe-pe-group-head">
        <span>
          New group —{" "}
          {group.questions.length > 0
            ? numbering.start === numbering.end
              ? `Question ${numbering.start}`
              : `Questions ${numbering.start}–${numbering.end}`
            : "no question yet"}
        </span>
        <button type="button" className="btn-ghost qe-pe-remove" onClick={onCancel}>
          <X size={13} /> Cancel this new group
        </button>
      </div>

      <label className="field-label">Instructions shown to students</label>
      <textarea
        className="field-input textarea qe-pe-short"
        placeholder="Appears automatically once you add the first question below"
        value={group.instruction}
        onChange={(e) => patch({ instruction: e.target.value })}
      />

      {group.questions.length === 0 && (
        <>
          <label className="field-label" style={{ marginTop: 14 }}>Group type</label>
          <div className="type-row">
            {[
              ["questions", "Question list"],
              ["completion", "Summary Completion"],
              ["matching", "Matching"],
              ["labelling", "Labelling (map / plan / diagram)"],
              ["shortanswer", "Short answer"],
            ].map(([m, label]) => (
              <button key={m} type="button" className={`type-chip ${group.mode === m ? "active" : ""}`} onClick={() => restart({ mode: m })}>
                {label}
              </button>
            ))}
          </div>

          {group.mode === "matching" && (
            <>
              <label className="field-label" style={{ marginTop: 14 }}>Matching type</label>
              <div className="type-row">
                {matchingChoices.map(([t, label]) => (
                  <button key={t} type="button" className={`type-chip ${group.matchingType === t ? "active" : ""}`} onClick={() => restart({ matchingType: t })}>
                    {label}
                  </button>
                ))}
              </div>
            </>
          )}

          {group.mode === "labelling" && (
            <>
              <label className="field-label" style={{ marginTop: 14 }}>Labelling type</label>
              <div className="type-row">
                <button type="button" className={`type-chip ${group.labellingKind === "map" ? "active" : ""}`} onClick={() => patch({ labellingKind: "map" })}>Map / plan — letters on the image</button>
                <button type="button" className={`type-chip ${group.labellingKind === "diagram" ? "active" : ""}`} onClick={() => patch({ labellingKind: "diagram" })}>Diagram — words to write</button>
              </div>
            </>
          )}

          {group.mode === "completion" && (
            <>
              <label className="field-label" style={{ marginTop: 14 }}>Completion style</label>
              <div className="type-row">
                {[
                  ["paragraph", "Plain text"],
                  ["notes", "Notes"],
                  ["table", "Table"],
                  ["sentences", "Sentences"],
                  ["form", "Form"],
                  ["flowchart", "Flow-chart"],
                  ["wordbank", "Summary + word list"],
                ].map(([st, label]) => (
                  <button key={st} type="button" className={`type-chip ${group.completionStyle === st ? "active" : ""}`} onClick={() => restart({ completionStyle: st })}>
                    {label}
                  </button>
                ))}
              </div>
            </>
          )}
        </>
      )}

      <GroupImagePicker
        teacherId={teacherId}
        value={group.imageUrl}
        onChange={(url) => patch({ imageUrl: url })}
        label={group.mode === "labelling" ? "Map / plan / diagram image" : "Image for this group (optional)"}
        required={group.mode === "labelling"}
      />

      {group.mode === "labelling" ? (
        <LabellingBuilder
          group={group}
          teacherId={teacherId}
          skill={skill}
          kind={group.labellingKind}
          onQuestionsCreated={(questions, instr) => onUpdate((g) => ({ ...g, questions, instruction: g.instruction || instr }))}
        />
      ) : group.mode === "shortanswer" ? (
        <ShortAnswerBuilder group={group} teacherId={teacherId} skill={skill} onQuestionsCreated={onBlanksWith(SHORT_ANSWER_INSTRUCTION)} />
      ) : group.mode === "matching" ? (
        <MatchingBuilder group={group} teacherId={teacherId} skill={skill} matchingType={group.matchingType} onQuestionsCreated={onBlanks} />
      ) : group.mode === "completion" ? (
        group.completionStyle === "notes" ? (
          <NotesCompletionBuilder group={group} teacherId={teacherId} skill={skill} onSummaryTextChange={onSummary} onBlanksCreated={onBlanks} />
        ) : group.completionStyle === "table" ? (
          <TableCompletionBuilder group={group} teacherId={teacherId} skill={skill} onSummaryTextChange={onSummary} onBlanksCreated={onBlanks} />
        ) : group.completionStyle === "form" ? (
          <FormCompletionBuilder group={group} teacherId={teacherId} skill={skill} onSummaryTextChange={onSummary} onBlanksCreated={onBlanksWith(FORM_INSTRUCTION)} />
        ) : group.completionStyle === "flowchart" ? (
          <FlowchartCompletionBuilder group={group} teacherId={teacherId} skill={skill} onSummaryTextChange={onSummary} onBlanksCreated={onBlanksWith(FLOWCHART_INSTRUCTION)} />
        ) : group.completionStyle === "wordbank" ? (
          <WordBankCompletionBuilder group={group} teacherId={teacherId} skill={skill} onSummaryTextChange={onSummary} onBlanksCreated={onBlanksWith(WORDBANK_INSTRUCTION)} />
        ) : group.completionStyle === "sentences" ? (
          <SentenceCompletionBuilder group={group} teacherId={teacherId} skill={skill} onSummaryTextChange={onSummary} onBlanksCreated={onBlanks} />
        ) : (
          <SummaryCompletionBuilder group={group} teacherId={teacherId} skill={skill} onSummaryTextChange={onSummary} onBlanksCreated={onBlanks} />
        )
      ) : (
        <>
          <div style={{ marginTop: 14 }}>
            {group.questions.length === 0 ? (
              <p className="empty-inline">No questions yet in this group.</p>
            ) : (
              <div className="qe-question-list">
                {group.questions.map((q, i) => (
                  <div key={q.id} className="qe-question-row">
                    <Check size={14} className="qe-question-check" />
                    <span>{numbering.numbers[i]}. {q.prompt}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          {addingQuestion ? (
            <div style={{ marginTop: 12 }}>
              <TeacherQuestionForm teacherId={teacherId} skill={skill} onCreated={onQuestionCreated} />
              <button className="btn-ghost" style={{ marginTop: 8 }} onClick={() => setAddingQuestion(false)}>Cancel</button>
            </div>
          ) : (
            <button className="btn-ghost" style={{ marginTop: 10 }} onClick={() => setAddingQuestion(true)}>
              <Plus size={13} /> Add question
            </button>
          )}
        </>
      )}

      {!isAddedGroupReady(group) && (
        <p className="field-hint" style={{ marginTop: 10 }}>
          {group.questions.length === 0
            ? "Create the questions of this group with the tool above."
            : group.mode === "labelling"
            ? "Add the map / plan image."
            : "Finish the text of this group."}
        </p>
      )}
    </div>
  );
}
