import React, { useState, useMemo, useEffect, useRef } from "react";
import { Plus, X, Check } from "lucide-react";
import { supabase } from "../../supabaseClient";
import { TeacherQuestionForm } from "./TeacherQuestionForm";
import { defaultInstructionFor, numberQuestions, FORM_INSTRUCTION, FLOWCHART_INSTRUCTION, WORDBANK_INSTRUCTION, SHORT_ANSWER_INSTRUCTION } from "./bulkParse";
import { AudioFilePicker } from "./AudioFilePicker";
import { SummaryCompletionBuilder, NotesCompletionBuilder, TableCompletionBuilder, SentenceCompletionBuilder } from "./TeacherReadingBuilder";
import { MatchingBuilder } from "./MatchingBuilder";
import { LabellingBuilder } from "./LabellingBuilder";
import { GroupImagePicker } from "./GroupImage";
import { useIsExamContainer, countStoredQuestions } from "./useExamContainer";
import { FormCompletionBuilder, FlowchartCompletionBuilder, WordBankCompletionBuilder, ShortAnswerBuilder } from "./CompletionExtraBuilders";

const MAX_LISTENING_PARTS = 4;

function newGroup() {
  return { localId: crypto.randomUUID(), instruction: "", mode: "questions", completionStyle: "paragraph", matchingType: "matching_features", labellingKind: "map", imageUrl: "", questions: [], summaryText: "" };
}
// Inside an exam a part is heard once by default (maxPlays "1").
function newPart(maxPlays = "") {
  return { localId: crypto.randomUUID(), audioUrl: "", audioFilename: "", maxPlays, groups: [newGroup()] };
}

export function TeacherListeningBuilder({ classId, teacherId, setScreen, showToast, editAssignmentId, returnTo}) {
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("");
  // A time limit is now required: an exam paper without one would run
  // forever. New assignments start at the usual IELTS duration; the
  // teacher can change it, but not leave it empty.
  const [timeLimit, setTimeLimit] = useState(editAssignmentId ? "" : "40");
  const [autoReleaseScore, setAutoReleaseScore] = useState(true);
  const [showAnswerReview, setShowAnswerReview] = useState(true);
  const [parts, setParts] = useState([newPart()]);
  const [addingQuestionFor, setAddingQuestionFor] = useState(null);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState("");
  const [loadingExisting, setLoadingExisting] = useState(Boolean(editAssignmentId));
  const [existingAnswerCount, setExistingAnswerCount] = useState(0);
  // "single" = one audio for the whole test (like the real IELTS),
  // "parts" = one audio per part (useful for practice).
  const [audioMode, setAudioMode] = useState("single");
  const [singleAudio, setSingleAudio] = useState(null); // { url, filename }
  const [examMode, setExamMode] = useState(false);
  const [checkMinutes, setCheckMinutes] = useState("2");
  // Editing: how many questions the paper holds right now. They are not
  // shown below yet, so "Save changes" would replace them all.
  const [storedQuestionCount, setStoredQuestionCount] = useState(0);
  const [savingSettings, setSavingSettings] = useState(false);

  // A new Listening built inside an exam starts as a real exam: one
  // listening only (and one play per part). The teacher can still untick
  // it; an ordinary class is unchanged.
  const inExam = useIsExamContainer(classId);
  const examDefaultsApplied = useRef(false);
  useEffect(() => {
    if (editAssignmentId || inExam !== true || examDefaultsApplied.current) return;
    examDefaultsApplied.current = true;
    setExamMode(true);
    setParts((prev) => prev.map((p) => (p.maxPlays === "" ? { ...p, maxPlays: "1" } : p)));
  }, [inExam, editAssignmentId]);

  // Same approach as the Reading builder: only the assignment's own
  // metadata is prefilled — Parts/questions always start fresh and
  // replace the old structure entirely on save.
  useEffect(() => {
    if (!editAssignmentId) return;
    (async () => {
      const { data: a } = await supabase.from("assignments").select("title, due_date, due_time, time_limit_minutes, auto_release_score, show_answer_review, listening_audio_url, listening_exam_mode, listening_check_minutes").eq("id", editAssignmentId).single();
      if (a) {
        setTitle(a.title || "");
        setDueDate(a.due_date || "");
        setDueTime(a.due_time || "");
        setTimeLimit(a.time_limit_minutes ? String(a.time_limit_minutes) : "");
        setAutoReleaseScore(a.auto_release_score ?? true);
        setShowAnswerReview(a.show_answer_review ?? true);
        setAudioMode(a.listening_audio_url ? "single" : "parts");
        setSingleAudio(a.listening_audio_url ? { url: a.listening_audio_url, filename: "Listening recording" } : null);
        setExamMode(Boolean(a.listening_exam_mode));
        setCheckMinutes(String(a.listening_check_minutes ?? 2));
      }
      const { count } = await supabase.from("student_answers").select("id", { count: "exact", head: true }).eq("assignment_id", editAssignmentId);
      setExistingAnswerCount(count || 0);
      setStoredQuestionCount(await countStoredQuestions(editAssignmentId));
      setLoadingExisting(false);
    })();
  }, [editAssignmentId]);

  function handleAudioChange(partLocalId, f) {
    setParts((prev) => prev.map((p) => (p.localId === partLocalId ? { ...p, audioUrl: f?.url || "", audioFilename: f?.filename || "" } : p)));
  }
  function handleMaxPlaysChange(partLocalId, value) {
    setParts((prev) => prev.map((p) => (p.localId === partLocalId ? { ...p, maxPlays: value } : p)));
  }

  function addPart() {
    if (parts.length >= MAX_LISTENING_PARTS) return;
    setParts((prev) => [...prev, newPart(inExam && !editAssignmentId ? "1" : "")]);
  }
  function removePart(partLocalId) {
    setParts((prev) => (prev.length > 1 ? prev.filter((p) => p.localId !== partLocalId) : prev));
  }

  function addGroup(partLocalId) {
    setParts((prev) => prev.map((p) => (p.localId === partLocalId ? { ...p, groups: [...p.groups, newGroup()] } : p)));
  }
  function removeGroup(partLocalId, groupLocalId) {
    setParts((prev) => prev.map((p) => (p.localId === partLocalId ? { ...p, groups: p.groups.filter((g) => g.localId !== groupLocalId) } : p)));
  }
  function updateInstruction(partLocalId, groupLocalId, text) {
    setParts((prev) =>
      prev.map((p) =>
        p.localId !== partLocalId ? p : { ...p, groups: p.groups.map((g) => (g.localId === groupLocalId ? { ...g, instruction: text } : g)) }
      )
    );
  }
  function setGroupMode(partLocalId, groupLocalId, mode) {
    setParts((prev) =>
      prev.map((p) =>
        p.localId !== partLocalId ? p : { ...p, groups: p.groups.map((g) => (g.localId === groupLocalId ? { ...g, mode, questions: [], summaryText: "" } : g)) }
      )
    );
  }
  function setCompletionStyle(partLocalId, groupLocalId, completionStyle) {
    setParts((prev) =>
      prev.map((p) =>
        p.localId !== partLocalId
          ? p
          : { ...p, groups: p.groups.map((g) => (g.localId === groupLocalId ? { ...g, completionStyle, questions: [], summaryText: "" } : g)) }
      )
    );
  }
  function patchGroup(partLocalId, groupLocalId, patch) {
    setParts((prev) =>
      prev.map((p) =>
        p.localId !== partLocalId ? p : { ...p, groups: p.groups.map((g) => (g.localId === groupLocalId ? { ...g, ...patch } : g)) }
      )
    );
  }
  function onLabellingCreated(partLocalId, groupLocalId, questions, defaultInstruction) {
    setParts((prev) =>
      prev.map((p) =>
        p.localId !== partLocalId
          ? p
          : { ...p, groups: p.groups.map((g) => (g.localId === groupLocalId ? { ...g, questions, instruction: g.instruction || defaultInstruction } : g)) }
      )
    );
  }
  function updateSummaryText(partLocalId, groupLocalId, text) {
    setParts((prev) =>
      prev.map((p) =>
        p.localId !== partLocalId ? p : { ...p, groups: p.groups.map((g) => (g.localId === groupLocalId ? { ...g, summaryText: text } : g)) }
      )
    );
  }
  function onQuestionCreated(partLocalId, groupLocalId, question) {
    setParts((prev) =>
      prev.map((p) =>
        p.localId !== partLocalId
          ? p
          : {
              ...p,
              groups: p.groups.map((g) => {
                if (g.localId !== groupLocalId) return g;
                const instruction = g.questions.length === 0 && !g.instruction ? defaultInstructionFor(question.type, question.options) : g.instruction;
                return { ...g, instruction, questions: [...g.questions, question] };
              }),
            }
      )
    );
    setAddingQuestionFor(null);
  }
  function onBlanksCreated(partLocalId, groupLocalId, questions) {
    setParts((prev) =>
      prev.map((p) =>
        p.localId !== partLocalId ? p : { ...p, groups: p.groups.map((g) => (g.localId === groupLocalId ? { ...g, questions } : g)) }
      )
    );
  }

  // Continuous numbering across every part, in order — never resets.
  const numbering = useMemo(() => {
    let counter = 0;
    const perPart = [];
    for (const part of parts) {
      const perGroup = [];
      for (const group of part.groups) {
        const { start, end, numbers, nextStart } = numberQuestions(group.questions, counter + 1);
        counter = nextStart - 1;
        perGroup.push({ start, end, numbers });
      }
      perPart.push(perGroup);
    }
    return perPart;
  }, [parts]);

  const canPublish =
    (audioMode === "single" ? Boolean(singleAudio?.url) : true) &&
    parts.every(
      (p) =>
        (audioMode === "single" || p.audioUrl) &&
        p.groups.length > 0 &&
        p.groups.every((g) =>
          g.mode === "completion"
            ? g.summaryText.trim() && g.questions.length > 0
            : g.mode === "labelling"
            ? g.imageUrl && g.questions.length > 0
            : g.questions.length > 0
        )
    );

  // The three assignment columns that describe the single audio.
  function listeningAudioFields() {
    return audioMode === "single"
      ? {
          listening_audio_url: singleAudio?.url || null,
          listening_exam_mode: examMode,
          listening_check_minutes: checkMinutes === "" ? 0 : Math.min(30, Math.max(0, parseInt(checkMinutes, 10) || 0)),
        }
      : { listening_audio_url: null, listening_exam_mode: false, listening_check_minutes: 2 };
  }

  async function publish() {
    setError("");
    if (!canPublish) return;

    // A paper with no time limit would never end — and inside an exam
    // the next paper would never unlock. Required, for every skill that
    // is actually sat under a clock.
    const minutes = parseInt(timeLimit, 10);
    if (!minutes || minutes < 1) {
      setError("Set a time limit, in minutes. Students need a clock, and an exam paper without one never ends.");
      return;
    }

    // No passage to guess a title from for Listening — fall back to a
    // dated default if the teacher didn't type one, same non-blocking
    // spirit as Reading.
    const finalTitle = title.trim() || `Listening Practice — ${new Date().toLocaleDateString()}`;

    if (editAssignmentId && existingAnswerCount > 0) {
      const ok = window.confirm(
        `${existingAnswerCount} answer${existingAnswerCount > 1 ? "s have" : " has"} already been submitted for this assignment. Saving your changes will delete all of that and reset the assignment for every student — they'll need to redo it. Continue?`
      );
      if (!ok) return;
    } else if (editAssignmentId && storedQuestionCount > 0) {
      const ok = window.confirm(
        `This paper has ${storedQuestionCount} question${storedQuestionCount > 1 ? "s" : ""}. "Save changes" deletes ${storedQuestionCount > 1 ? "them all" : "it"} and keeps only the Parts built on this screen. To change only the title or the settings, cancel and use "Save title and settings only". Replace the questions?`
      );
      if (!ok) return;
    }

    setPublishing(true);

    let assignment;
    if (editAssignmentId) {
      const { data: oldSections, error: oldSError } = await supabase.from("exam_sections").select("id").eq("assignment_id", editAssignmentId);
      if (oldSError) {
        setPublishing(false);
        setError("Could not read the existing parts: " + oldSError.message);
        return;
      }
      const sectionIds = (oldSections || []).map((s) => s.id);
      if (sectionIds.length > 0) {
        const { data: oldLinks, error: oldLError } = await supabase.from("assignment_questions").select("question_id").in("section_id", sectionIds);
        if (oldLError) {
          setPublishing(false);
          setError("Could not read the existing questions: " + oldLError.message);
          return;
        }
        const questionIds = [...new Set((oldLinks || []).map((l) => l.question_id))];
        if (questionIds.length > 0) {
          const { error: delQError } = await supabase.from("questions").delete().in("id", questionIds);
          if (delQError) {
            setPublishing(false);
            setError("Could not clear the old questions: " + delQError.message);
            return;
          }
        }
        const { error: delSError } = await supabase.from("exam_sections").delete().eq("assignment_id", editAssignmentId);
        if (delSError) {
          setPublishing(false);
          setError("Could not clear the old parts: " + delSError.message);
          return;
        }
      }

      const { data: updated, error: uError } = await supabase
        .from("assignments")
        .update({
          title: finalTitle,
          due_date: dueDate || null,
          due_time: dueTime || null,
          time_limit_minutes: timeLimit ? parseInt(timeLimit, 10) : null,
          auto_release_score: autoReleaseScore,
          show_answer_review: showAnswerReview,
          ...listeningAudioFields(),
        })
        .eq("id", editAssignmentId)
        .select()
        .single();

      if (uError || !updated) {
        setPublishing(false);
        setError("Could not update the assignment: " + (uError?.message || "unknown error"));
        return;
      }
      assignment = updated;
    } else {
      const { data: created, error: aError } = await supabase
        .from("assignments")
        .insert({
          class_id: classId,
          title: finalTitle,
          type: "Listening",
          description: null,
          due_date: dueDate || null,
          time_limit_minutes: timeLimit ? parseInt(timeLimit, 10) : null,
          auto_release_score: autoReleaseScore,
          show_answer_review: showAnswerReview,
          ...listeningAudioFields(),
        })
        .select()
        .single();

      if (aError || !created) {
        setPublishing(false);
        setError("Could not create the assignment: " + (aError?.message || "unknown error"));
        return;
      }
      assignment = created;
    }

    for (let pi = 0; pi < parts.length; pi++) {
      const part = parts[pi];
      const { data: sectionRow, error: sError } = await supabase
        .from("exam_sections")
        .insert({
          assignment_id: assignment.id,
          title: `Part ${pi + 1}`,
          audio_url: audioMode === "single" ? null : part.audioUrl,
          max_plays: audioMode === "single" ? null : part.maxPlays ? parseInt(part.maxPlays, 10) : null,
          order_index: pi,
        })
        .select()
        .single();

      if (sError || !sectionRow) {
        setPublishing(false);
        setError(`Assignment saved, but Part ${pi + 1} failed to save: ` + sError?.message);
        return;
      }

      for (let gi = 0; gi < part.groups.length; gi++) {
        const group = part.groups[gi];
        const { data: groupRow, error: gError } = await supabase
          .from("question_groups")
          .insert({
            section_id: sectionRow.id,
            instruction: group.instruction || null,
            passage_text: group.mode === "completion" ? group.summaryText.trim() : null,
            image_url: group.imageUrl || null,
            order_index: gi,
          })
          .select()
          .single();

        if (gError || !groupRow) {
          setPublishing(false);
          setError(`Assignment saved, but a question group in Part ${pi + 1} failed to save: ` + gError?.message);
          return;
        }

        const links = group.questions.map((q, qi) => ({
          section_id: sectionRow.id,
          group_id: groupRow.id,
          question_id: q.id,
          order_index: qi,
        }));
        const { error: linkError } = await supabase.from("assignment_questions").insert(links);
        if (linkError) {
          setPublishing(false);
          setError("Assignment saved, but linking questions failed: " + linkError.message);
          return;
        }
      }
    }

    setPublishing(false);
    showToast?.(editAssignmentId ? "Listening assignment updated" : "Listening assignment published");
    setScreen(returnTo || { name: "class", classId });
  }

  // Title, dates, time limit, results options and the audio settings —
  // nothing else. Parts, questions and students' answers are not touched.
  async function saveSettingsOnly() {
    setError("");
    const minutes = parseInt(timeLimit, 10);
    if (!minutes || minutes < 1) {
      setError("Set a time limit, in minutes. Students need a clock, and an exam paper without one never ends.");
      return;
    }
    if (audioMode === "single" && !singleAudio?.url) {
      setError("Choose the recording for the whole test, or switch to one audio per part.");
      return;
    }
    setSavingSettings(true);
    const { error: uError } = await supabase
      .from("assignments")
      .update({
        title: title.trim() || `Listening Practice — ${new Date().toLocaleDateString()}`,
        due_date: dueDate || null,
        due_time: dueTime || null,
        time_limit_minutes: minutes,
        auto_release_score: autoReleaseScore,
        show_answer_review: showAnswerReview,
        ...listeningAudioFields(),
      })
      .eq("id", editAssignmentId);
    setSavingSettings(false);
    if (uError) {
      setError("Could not save: " + uError.message);
      return;
    }
    showToast?.("Title and settings saved — the questions are unchanged");
    setScreen(returnTo || { name: "class", classId });
  }

  if (loadingExisting) {
    return (
      <div className="page page-wide">
        <p className="empty-inline">Loading assignment…</p>
      </div>
    );
  }

  return (
    <div className="page page-wide">
      <div className="eyebrow">Structured Listening</div>
      <h1 className="page-title">{editAssignmentId ? "Edit Listening assignment" : "New Listening assignment"}</h1>
      {editAssignmentId && (
        <div className="qe-edit-notice">
          <strong>The {storedQuestionCount > 0 ? `${storedQuestionCount} questions` : "questions"} already in this paper are not shown below.</strong>{" "}
          To change only the title, dates, time or audio settings, use <em>Save title and settings only</em> at the bottom: the questions and the students' answers stay exactly as they are.
          {" "}<em>Save changes</em> replaces all the questions with the Parts you build on this screen.
          {existingAnswerCount > 0 && ` ${existingAnswerCount} answer${existingAnswerCount > 1 ? "s have" : " has"} already been submitted and would be reset.`}
        </div>
      )}

      <label className="field-label" style={{ marginTop: 16 }}>Title (optional — auto-generated if left blank)</label>
      <input className="field-input" placeholder="e.g. IELTS Listening Practice Test 1" value={title} onChange={(e) => setTitle(e.target.value)} />

      <div style={{ display: "flex", gap: 16, marginTop: 14 }}>
        <div style={{ flex: 1 }}>
          <label className="field-label">Due date (optional)</label>
          <input type="date" className="field-input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
        <div style={{ flex: 1 }}>
          <label className="field-label">Due time (optional)</label>
          <input type="time" className="field-input" value={dueTime} onChange={(e) => setDueTime(e.target.value)} />
        </div>
        <div style={{ flex: 1 }}>
          <label className="field-label">Time limit, minutes</label>
          <input type="number" min="1" className="field-input" placeholder="e.g. 40" value={timeLimit} onChange={(e) => setTimeLimit(e.target.value)} />
        </div>
      </div>

      <label className="checkbox-row" style={{ marginTop: 16 }}>
        <input type="checkbox" checked={autoReleaseScore} onChange={(e) => setAutoReleaseScore(e.target.checked)} />
        Show score to students automatically once they submit
      </label>
      <p className="field-hint" style={{ marginTop: 2 }}>
        {autoReleaseScore ? "Students see their score right after submitting." : "Students see \"Submitted\" only — you release the score from the review screen when ready."}
      </p>

      <label className="checkbox-row" style={{ marginTop: 10 }}>
        <input type="checkbox" checked={showAnswerReview} onChange={(e) => setShowAnswerReview(e.target.checked)} />
        Let students see which answers were correct/incorrect, with the correct answer
      </label>
      <p className="field-hint" style={{ marginTop: 2 }}>
        {showAnswerReview ? "Students can review each question after their score is visible." : "Students only see their overall score, never the answer key — useful if you plan to reuse this test."}
      </p>

      <label className="field-label" style={{ marginTop: 20 }}>Audio</label>
      <div className="type-row">
        <button type="button" className={`type-chip ${audioMode === "single" ? "active" : ""}`} onClick={() => setAudioMode("single")}>One audio for the whole test</button>
        <button type="button" className={`type-chip ${audioMode === "parts" ? "active" : ""}`} onClick={() => setAudioMode("parts")}>One audio per part</button>
      </div>
      <p className="field-hint" style={{ marginTop: 2 }}>
        {audioMode === "single"
          ? "Like the real test: the recording plays through all the parts. Students switch part without stopping it."
          : "Each part has its own file, with its own number of plays — handy for practice section by section."}
      </p>

      {audioMode === "single" && (
        <div className="feedback-panel" style={{ marginTop: 10 }}>
          <label className="field-label" style={{ marginTop: 0 }}>Recording for the whole test</label>
          <AudioFilePicker teacherId={teacherId} value={singleAudio} onChange={(f) => setSingleAudio(f || null)} />

          <label className="checkbox-row" style={{ marginTop: 14 }}>
            <input type="checkbox" checked={examMode} onChange={(e) => setExamMode(e.target.checked)} />
            Exam mode: one listening only, no pause and no rewind
          </label>
          {inExam && !examMode && (
            <p className="qe-exam-warn">This paper is part of an exam, but candidates will be able to pause and replay the recording.</p>
          )}
          <p className="field-hint" style={{ marginTop: 2 }}>
            {examMode
              ? "The recording starts when the student presses \"I'm ready\" and plays straight through. Refreshing the page carries on where the server says it is — never back at the beginning."
              : "Practice: students can pause and replay the recording as they like."}
          </p>

          <label className="field-label" style={{ marginTop: 14 }}>Checking time after the recording (minutes)</label>
          <input
            type="number"
            min="0"
            max="30"
            className="field-input"
            style={{ maxWidth: 160 }}
            value={checkMinutes}
            onChange={(e) => setCheckMinutes(e.target.value)}
          />
          <p className="field-hint" style={{ marginTop: 2 }}>
            {checkMinutes === "0" || checkMinutes === ""
              ? "No automatic sending: students submit when they want."
              : `When the recording ends, students get ${checkMinutes} minute${checkMinutes === "1" ? "" : "s"} to check their answers, then everything is sent automatically.`}
          </p>
        </div>
      )}

      {parts.map((part, pi) => (
        <div key={part.localId} className="qe-part-block">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 28 }}>
            <h3 className="section-title" style={{ margin: 0 }}>Part {pi + 1}</h3>
            {parts.length > 1 && (
              <button className="btn-ghost" onClick={() => removePart(part.localId)}><X size={13} /> Remove this part</button>
            )}
          </div>

          {audioMode === "parts" && (
          <>
          <label className="field-label" style={{ marginTop: 14 }}>Audio file</label>
          <AudioFilePicker
            teacherId={teacherId}
            value={part.audioUrl ? { url: part.audioUrl, filename: part.audioFilename } : null}
            onChange={(f) => handleAudioChange(part.localId, f)}
          />

          <label className="field-label" style={{ marginTop: 14 }}>Plays allowed (leave blank for unlimited)</label>
          <input
            type="number"
            min="1"
            className="field-input"
            style={{ maxWidth: 160 }}
            placeholder="Unlimited"
            value={part.maxPlays}
            onChange={(e) => handleMaxPlaysChange(part.localId, e.target.value)}
          />
          {inExam && !part.maxPlays && (
            <p className="qe-exam-warn">This paper is part of an exam, but candidates will be able to replay this part as often as they like.</p>
          )}
          </>
          )}

          <h4 className="section-title" style={{ marginTop: 20, fontSize: 14 }}>Question groups</h4>

          {part.groups.map((group, gi) => (
            <div key={group.localId} className="feedback-panel" style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <span className="qe-group-heading-preview">
                  {group.questions.length > 0
                    ? numbering[pi][gi].start === numbering[pi][gi].end
                      ? `Question ${numbering[pi][gi].start}`
                      : `Questions ${numbering[pi][gi].start}-${numbering[pi][gi].end}`
                    : "New group"}
                </span>
                <button className="btn-ghost" onClick={() => removeGroup(part.localId, group.localId)}><X size={13} /> Remove group</button>
              </div>

              <label className="field-label">Instructions shown to students</label>
              <textarea
                className="field-input textarea"
                style={{ minHeight: 90 }}
                placeholder="Appears automatically once you add the first question below"
                value={group.instruction}
                onChange={(e) => updateInstruction(part.localId, group.localId, e.target.value)}
              />

              {group.questions.length === 0 && (
                <>
                  <label className="field-label" style={{ marginTop: 14 }}>Group type</label>
                  <div className="type-row">
                    <button type="button" className={`type-chip ${group.mode === "questions" ? "active" : ""}`} onClick={() => setGroupMode(part.localId, group.localId, "questions")}>Question list</button>
                    <button type="button" className={`type-chip ${group.mode === "completion" ? "active" : ""}`} onClick={() => setGroupMode(part.localId, group.localId, "completion")}>Summary Completion</button>
                    <button type="button" className={`type-chip ${group.mode === "matching" ? "active" : ""}`} onClick={() => setGroupMode(part.localId, group.localId, "matching")}>Matching</button>
                    <button type="button" className={`type-chip ${group.mode === "labelling" ? "active" : ""}`} onClick={() => setGroupMode(part.localId, group.localId, "labelling")}>Labelling (map / plan / diagram)</button>
                    <button type="button" className={`type-chip ${group.mode === "shortanswer" ? "active" : ""}`} onClick={() => setGroupMode(part.localId, group.localId, "shortanswer")}>Short answer</button>
                  </div>

                  {group.mode === "matching" && (
                    <>
                      <label className="field-label" style={{ marginTop: 14 }}>Matching type</label>
                      <div className="type-row">
                        <button type="button" className={`type-chip ${group.matchingType === "matching_features" ? "active" : ""}`} onClick={() => patchGroup(part.localId, group.localId, { matchingType: "matching_features" })}>Choose from a box / list</button>
                        <button type="button" className={`type-chip ${group.matchingType === "matching_sentence_endings" ? "active" : ""}`} onClick={() => patchGroup(part.localId, group.localId, { matchingType: "matching_sentence_endings" })}>Sentence Endings</button>
                      </div>
                    </>
                  )}

                  {group.mode === "labelling" && (
                    <>
                      <label className="field-label" style={{ marginTop: 14 }}>Labelling type</label>
                      <div className="type-row">
                        <button type="button" className={`type-chip ${group.labellingKind === "map" ? "active" : ""}`} onClick={() => patchGroup(part.localId, group.localId, { labellingKind: "map" })}>Map / plan — letters on the image</button>
                        <button type="button" className={`type-chip ${group.labellingKind === "diagram" ? "active" : ""}`} onClick={() => patchGroup(part.localId, group.localId, { labellingKind: "diagram" })}>Diagram — words to write</button>
                      </div>
                    </>
                  )}

                  {group.mode === "completion" && (
                    <>
                      <label className="field-label" style={{ marginTop: 14 }}>Completion style</label>
                      <div className="type-row">
                        <button type="button" className={`type-chip ${group.completionStyle === "paragraph" ? "active" : ""}`} onClick={() => setCompletionStyle(part.localId, group.localId, "paragraph")}>Plain text</button>
                        <button type="button" className={`type-chip ${group.completionStyle === "notes" ? "active" : ""}`} onClick={() => setCompletionStyle(part.localId, group.localId, "notes")}>Notes</button>
                        <button type="button" className={`type-chip ${group.completionStyle === "table" ? "active" : ""}`} onClick={() => setCompletionStyle(part.localId, group.localId, "table")}>Table</button>
                        <button type="button" className={`type-chip ${group.completionStyle === "sentences" ? "active" : ""}`} onClick={() => setCompletionStyle(part.localId, group.localId, "sentences")}>Sentences</button>
                        <button type="button" className={`type-chip ${group.completionStyle === "form" ? "active" : ""}`} onClick={() => setCompletionStyle(part.localId, group.localId, "form")}>Form</button>
                        <button type="button" className={`type-chip ${group.completionStyle === "flowchart" ? "active" : ""}`} onClick={() => setCompletionStyle(part.localId, group.localId, "flowchart")}>Flow-chart</button>
                        <button type="button" className={`type-chip ${group.completionStyle === "wordbank" ? "active" : ""}`} onClick={() => setCompletionStyle(part.localId, group.localId, "wordbank")}>Summary + word list</button>
                      </div>
                    </>
                  )}
                </>
              )}

              <GroupImagePicker
                teacherId={teacherId}
                value={group.imageUrl}
                onChange={(url) => patchGroup(part.localId, group.localId, { imageUrl: url })}
                label={group.mode === "labelling" ? "Map / plan / diagram image" : "Image for this group (optional)"}
                required={group.mode === "labelling"}
                hint={
                  group.mode === "labelling"
                    ? group.labellingKind === "map"
                      ? "Use an image that already shows the letters (A, B, C…). Students see it above the questions and can zoom in."
                      : "Use an image that already shows the numbered labels. Students see it above the answer boxes and can zoom in."
                    : "Shown to students above this group's questions (e.g. a flow-chart or table figure)."
                }
              />

              {group.mode === "labelling" ? (
                <LabellingBuilder
                  group={group}
                  teacherId={teacherId}
                  skill="listening"
                  kind={group.labellingKind}
                  onQuestionsCreated={(questions, instr) => onLabellingCreated(part.localId, group.localId, questions, instr)}
                />
              ) : group.mode === "shortanswer" ? (
                <ShortAnswerBuilder
                  group={group}
                  teacherId={teacherId}
                  skill="listening"
                  onQuestionsCreated={(questions) => onLabellingCreated(part.localId, group.localId, questions, SHORT_ANSWER_INSTRUCTION)}
                />
              ) : group.mode === "matching" ? (
                <MatchingBuilder
                  group={group}
                  teacherId={teacherId}
                  skill="listening"
                  matchingType={group.matchingType}
                  onQuestionsCreated={(questions) => onBlanksCreated(part.localId, group.localId, questions)}
                />
              ) : group.mode === "completion" ? (
                group.completionStyle === "notes" ? (
                  <NotesCompletionBuilder
                    group={group}
                    teacherId={teacherId}
                    skill="listening"
                    onSummaryTextChange={(text) => updateSummaryText(part.localId, group.localId, text)}
                    onBlanksCreated={(questions) => onBlanksCreated(part.localId, group.localId, questions)}
                  />
                ) : group.completionStyle === "table" ? (
                  <TableCompletionBuilder
                    group={group}
                    teacherId={teacherId}
                    skill="listening"
                    onSummaryTextChange={(text) => updateSummaryText(part.localId, group.localId, text)}
                    onBlanksCreated={(questions) => onBlanksCreated(part.localId, group.localId, questions)}
                  />
                ) : group.completionStyle === "form" ? (
                  <FormCompletionBuilder
                    group={group}
                    teacherId={teacherId}
                    skill="listening"
                    onSummaryTextChange={(text) => updateSummaryText(part.localId, group.localId, text)}
                    onBlanksCreated={(questions) => onLabellingCreated(part.localId, group.localId, questions, FORM_INSTRUCTION)}
                  />
                ) : group.completionStyle === "flowchart" ? (
                  <FlowchartCompletionBuilder
                    group={group}
                    teacherId={teacherId}
                    skill="listening"
                    onSummaryTextChange={(text) => updateSummaryText(part.localId, group.localId, text)}
                    onBlanksCreated={(questions) => onLabellingCreated(part.localId, group.localId, questions, FLOWCHART_INSTRUCTION)}
                  />
                ) : group.completionStyle === "wordbank" ? (
                  <WordBankCompletionBuilder
                    group={group}
                    teacherId={teacherId}
                    skill="listening"
                    onSummaryTextChange={(text) => updateSummaryText(part.localId, group.localId, text)}
                    onBlanksCreated={(questions) => onLabellingCreated(part.localId, group.localId, questions, WORDBANK_INSTRUCTION)}
                  />
                ) : group.completionStyle === "sentences" ? (
                  <SentenceCompletionBuilder
                    group={group}
                    teacherId={teacherId}
                    skill="listening"
                    onSummaryTextChange={(text) => updateSummaryText(part.localId, group.localId, text)}
                    onBlanksCreated={(questions) => onBlanksCreated(part.localId, group.localId, questions)}
                  />
                ) : (
                  <SummaryCompletionBuilder
                    group={group}
                    teacherId={teacherId}
                    skill="listening"
                    onSummaryTextChange={(text) => updateSummaryText(part.localId, group.localId, text)}
                    onBlanksCreated={(questions) => onBlanksCreated(part.localId, group.localId, questions)}
                  />
                )
              ) : (
                <>
                  <div style={{ marginTop: 14 }}>
                    {group.questions.length === 0 ? (
                      <p className="empty-inline">No questions yet in this group.</p>
                    ) : (
                      <div className="qe-question-list">
                        {group.questions.map((q, i) => (
                          <div key={q.id} className="qe-question-row"><Check size={14} className="qe-question-check" /><span>{numbering[pi][gi].numbers[i]}. {q.prompt}</span></div>
                        ))}
                      </div>
                    )}
                  </div>

                  {addingQuestionFor === group.localId ? (
                    <div style={{ marginTop: 12 }}>
                      <TeacherQuestionForm teacherId={teacherId} skill="listening" onCreated={(q) => onQuestionCreated(part.localId, group.localId, q)} />
                      <button className="btn-ghost" style={{ marginTop: 8 }} onClick={() => setAddingQuestionFor(null)}>Cancel</button>
                    </div>
                  ) : (
                    <button className="btn-ghost" style={{ marginTop: 10 }} onClick={() => setAddingQuestionFor(group.localId)}><Plus size={13} /> Add question</button>
                  )}
                </>
              )}
            </div>
          ))}

          <button className="btn-ghost" onClick={() => addGroup(part.localId)}><Plus size={14} /> Add question group</button>
        </div>
      ))}

      {parts.length < MAX_LISTENING_PARTS && (
        <button className="btn-ghost" style={{ marginTop: 20 }} onClick={addPart}><Plus size={14} /> Add another part (Part {parts.length + 1})</button>
      )}

      {error && <div className="field-error" style={{ marginTop: 16 }}>{error}</div>}

      <div className="qe-builder-actions">
        {editAssignmentId && (
          <button className="btn-primary" disabled={savingSettings || publishing} onClick={saveSettingsOnly}>
            {savingSettings ? "Saving…" : "Save title and settings only"}
          </button>
        )}
        <button className={editAssignmentId ? "btn-ghost" : "btn-primary"} disabled={!canPublish || publishing || savingSettings} onClick={publish}>
          {publishing ? "Saving…" : editAssignmentId ? "Save changes (replace the questions)" : "Publish assignment"}
        </button>
      </div>
    </div>
  );
}
