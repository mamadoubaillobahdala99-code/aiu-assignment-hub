import React, { useState, useEffect, useCallback } from "react";
import { BookOpen, Users, Plus, Check, Clock, AlertTriangle, LogOut, GraduationCap, FileText, ChevronRight, X, Copy, CheckCircle2, Headphones, PenLine, Mic, ListChecks, ArrowLeft, Loader2, Timer, Highlighter, Trash2, Pencil } from "lucide-react";
import { supabase } from "../../supabaseClient";
import { uid, makeCode, TYPES, fmtDate, fmtDueDateTime, daysUntil, wordCount, isPdfUrl } from "../../lib/utils";
import { AttachmentPreview, PageHeader, EmptyState, CenterSpinner, StatusBadge } from "../../components/shared";
import { TeacherQuestionEngineReview } from "../question-engine/TeacherQuestionEngineReview";
import { TeacherWritingReview } from "../question-engine/TeacherWritingReview";
import { deleteUnusedSpeakingFiles } from "../question-engine/speaking";

const CRITERIA = [
  { key: "score_task_achievement", label: "Task Achievement" },
  { key: "score_coherence_cohesion", label: "Coherence & Cohesion" },
  { key: "score_lexical_resource", label: "Lexical Resource" },
  { key: "score_grammar_accuracy", label: "Grammatical Range & Accuracy" },
];

function averageScore(vals) {
  const nums = vals.filter((v) => v !== "" && v !== null && !isNaN(v)).map(Number);
  if (nums.length !== 4) return null;
  const avg = nums.reduce((a, b) => a + b, 0) / 4;
  return Math.round(avg * 2) / 2; // rounded to nearest 0.5, IELTS-style
}

export function AssignmentTeacher({ classId, assignmentId, teacherId, setScreen, showToast }) {
  const [assignment, setAssignment] = useState(null);
  const [roster, setRoster] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [isStructured, setIsStructured] = useState(false);
  const [structuredStudentIds, setStructuredStudentIds] = useState(new Set());
  // Structured Writing only: who has started (draft saved) and whose
  // correction is published — for the In progress / Graded badges.
  const [writingStartedIds, setWritingStartedIds] = useState(new Set());
  const [writingReleasedIds, setWritingReleasedIds] = useState(new Set());
  // Structured Speaking only (consult, nothing submitted): who opened it.
  const [speakingViewedIds, setSpeakingViewedIds] = useState(new Set());
  const [active, setActive] = useState(null);
  const [activeStructuredStudent, setActiveStructuredStudent] = useState(null);
  const [gradeDraft, setGradeDraft] = useState("");
  const [criteriaDraft, setCriteriaDraft] = useState({});
  const [feedbackDraft, setFeedbackDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [myClasses, setMyClasses] = useState([]);
  const [showDuplicate, setShowDuplicate] = useState(false);
  const [duplicateTargetClass, setDuplicateTargetClass] = useState("");
  const [duplicating, setDuplicating] = useState(false);

  const load = useCallback(async () => {
    const { data: a } = await supabase.from("assignments").select("*").eq("id", assignmentId).single();
    setAssignment(a || null);
    const { data: r } = await supabase.from("roster").select("student_id, profiles(name)").eq("class_id", classId);
    setRoster((r || []).map((x) => ({ id: x.student_id, name: x.profiles?.name || "Unknown" })));

    // Reliable check: assignment.type alone can't tell a Question Engine
    // assignment apart from an old-style one — "Reading"/"Listening" are
    // valid types in both systems. Presence of exam_sections is what
    // actually distinguishes them (same check AssignmentOpenBridge uses).
    const { count: sectionCount } = await supabase
      .from("exam_sections")
      .select("id", { count: "exact", head: true })
      .eq("assignment_id", assignmentId);
    const structured = (sectionCount || 0) > 0;
    setIsStructured(structured);

    if (structured && a?.type === "Speaking") {
      const { data: sv } = await supabase.from("speaking_views").select("student_id").eq("assignment_id", assignmentId);
      setSpeakingViewedIds(new Set((sv || []).map((row) => row.student_id)));
      setStructuredStudentIds(new Set());
      setSubmissions([]);
    } else if (structured && a?.type === "Writing") {
      // Structured Writing: answers live in writing_responses, not student_answers.
      const { data: wr } = await supabase.from("writing_responses").select("student_id, submitted_at").eq("assignment_id", assignmentId);
      setStructuredStudentIds(new Set((wr || []).filter((row) => row.submitted_at).map((row) => row.student_id)));
      setWritingStartedIds(new Set((wr || []).map((row) => row.student_id)));
      const { data: fb } = await supabase.from("assignment_feedback").select("student_id, released_at").eq("assignment_id", assignmentId);
      setWritingReleasedIds(new Set((fb || []).filter((row) => row.released_at).map((row) => row.student_id)));
      setSubmissions([]);
    } else if (structured) {
      const { data: sa } = await supabase.from("student_answers").select("student_id").eq("assignment_id", assignmentId);
      setStructuredStudentIds(new Set((sa || []).map((row) => row.student_id)));
      setSubmissions([]);
    } else {
      const { data: s } = await supabase.from("submissions").select("*").eq("assignment_id", assignmentId);
      setSubmissions(s || []);
    }

    if (teacherId) {
      const { data: classes } = await supabase.from("classes").select("id, name").eq("teacher_id", teacherId).order("name");
      setMyClasses(classes || []);
    }
  }, [classId, assignmentId, teacherId]);

  useEffect(() => { load(); }, [load]);

  const isWritingType = assignment?.type === "Writing Task 1" || assignment?.type === "Writing Task 2";

  function openGrade(student) {
    const sub = submissions.find((s) => s.student_id === student.id);
    setActive(student);
    setGradeDraft(sub?.grade || "");
    setFeedbackDraft(sub?.feedback || "");
    setCriteriaDraft({
      score_task_achievement: sub?.score_task_achievement ?? "",
      score_coherence_cohesion: sub?.score_coherence_cohesion ?? "",
      score_lexical_resource: sub?.score_lexical_resource ?? "",
      score_grammar_accuracy: sub?.score_grammar_accuracy ?? "",
    });
  }

  async function handleDelete() {
    let warningCount = 0;
    if (isStructured) {
      warningCount = structuredStudentIds.size;
    } else {
      warningCount = submissions.filter((s) => s.submitted_at).length;
    }

    const msg =
      warningCount > 0
        ? `${warningCount} student${warningCount === 1 ? " has" : "s have"} already submitted this assignment. Deleting it will permanently remove their work too. Delete anyway?`
        : "Delete this assignment? This cannot be undone.";
    if (!window.confirm(msg)) return;

    setDeleting(true);

    // Clean up orphaned questions first, same pattern as editing a
    // published assignment — deleting exam_sections alone would leave
    // their questions behind with nothing pointing at them.
    if (isStructured) {
      const { data: sections } = await supabase.from("exam_sections").select("id").eq("assignment_id", assignmentId);
      const sectionIds = (sections || []).map((s) => s.id);
      if (sectionIds.length > 0) {
        const { data: links } = await supabase.from("assignment_questions").select("question_id").in("section_id", sectionIds);
        const questionIds = [...new Set((links || []).map((l) => l.question_id))];
        if (questionIds.length > 0) {
          await supabase.from("questions").delete().in("id", questionIds);
        }
      }
    }

    // Structured Speaking: remember its documents, to remove the files
    // from storage once the assignment itself is gone.
    let speakingDocs = [];
    if (isStructured && assignment?.type === "Speaking") {
      const { data: sp } = await supabase.from("exam_sections").select("documents").eq("assignment_id", assignmentId);
      speakingDocs = (sp || []).flatMap((row) => (Array.isArray(row.documents) ? row.documents : []));
    }

    const { error } = await supabase.from("assignments").delete().eq("id", assignmentId);
    if (!error && speakingDocs.length > 0) await deleteUnusedSpeakingFiles(supabase, speakingDocs, teacherId);
    setDeleting(false);
    if (error) {
      showToast("Could not delete assignment: " + error.message);
      return;
    }
    showToast("Assignment deleted");
    setScreen({ name: "class", classId });
  }

  // Deep-copies the whole assignment — Parts, groups, questions, answer
  // keys — into a brand new assignment under the chosen class. Every
  // copied question is a fresh row, never shared with the original, so
  // editing or deleting either assignment later can never affect the
  // other (see the "one question belongs to exactly one assignment"
  // rule the rest of the app already depends on).
  async function duplicateToClass() {
    if (!duplicateTargetClass) return;
    setDuplicating(true);

    const { data: newAssignment, error: aError } = await supabase
      .from("assignments")
      .insert({
        class_id: duplicateTargetClass,
        title: assignment.title,
        type: assignment.type,
        description: assignment.description,
        time_limit_minutes: assignment.time_limit_minutes,
        auto_release_score: assignment.auto_release_score,
        show_answer_review: assignment.show_answer_review,
        reading_test_type: assignment.reading_test_type,
        due_date: null,
      })
      .select()
      .single();

    if (aError || !newAssignment) {
      setDuplicating(false);
      showToast("Could not duplicate: " + (aError?.message || "unknown error"));
      return;
    }

    const { data: sourceSections } = await supabase.from("exam_sections").select("*").eq("assignment_id", assignmentId).order("order_index");

    for (const section of sourceSections || []) {
      const { data: newSection, error: sError } = await supabase
        .from("exam_sections")
        .insert({
          assignment_id: newAssignment.id,
          title: section.title,
          passage_title: section.passage_title,
          passage_text: section.passage_text,
          audio_url: section.audio_url,
          max_plays: section.max_plays,
          image_url: section.image_url,
          task_number: section.task_number,
          speaking_part: section.speaking_part,
          documents: section.documents || [],
          order_index: section.order_index,
        })
        .select()
        .single();
      if (sError || !newSection) continue;

      const { data: sourceGroups } = await supabase.from("question_groups").select("*").eq("section_id", section.id).order("order_index");
      for (const group of sourceGroups || []) {
        const { data: newGroup, error: gError } = await supabase
          .from("question_groups")
          .insert({ section_id: newSection.id, instruction: group.instruction, passage_text: group.passage_text, order_index: group.order_index })
          .select()
          .single();
        if (gError || !newGroup) continue;

        const { data: links } = await supabase.from("assignment_questions").select("order_index, questions(*)").eq("group_id", group.id).order("order_index");
        for (const link of links || []) {
          const q = link.questions;
          if (!q) continue;
          const { data: newQuestion, error: qError } = await supabase
            .from("questions")
            .insert({ teacher_id: teacherId, type: q.type, skill: q.skill, prompt: q.prompt, options: q.options, points: q.points })
            .select()
            .single();
          if (qError || !newQuestion) continue;

          const { data: key } = await supabase.from("question_answer_key").select("correct_answer").eq("question_id", q.id).single();
          if (key) {
            await supabase.from("question_answer_key").insert({ question_id: newQuestion.id, correct_answer: key.correct_answer });
          }

          await supabase.from("assignment_questions").insert({
            section_id: newSection.id,
            group_id: newGroup.id,
            question_id: newQuestion.id,
            order_index: link.order_index,
          });
        }
      }
    }

    setDuplicating(false);
    setShowDuplicate(false);
    showToast("Duplicated — set a due date in the new class when you're ready");
    setScreen({ name: "assignment-teacher", classId: duplicateTargetClass, assignmentId: newAssignment.id });
  }

  async function saveGrade() {
    setBusy(true);
    const sub = submissions.find((s) => s.student_id === active.id);
    if (sub) {
      const payload = { feedback: feedbackDraft.trim(), graded_at: new Date().toISOString() };
      if (isWritingType) {
        const avg = averageScore(Object.values(criteriaDraft));
        payload.score_task_achievement = criteriaDraft.score_task_achievement === "" ? null : Number(criteriaDraft.score_task_achievement);
        payload.score_coherence_cohesion = criteriaDraft.score_coherence_cohesion === "" ? null : Number(criteriaDraft.score_coherence_cohesion);
        payload.score_lexical_resource = criteriaDraft.score_lexical_resource === "" ? null : Number(criteriaDraft.score_lexical_resource);
        payload.score_grammar_accuracy = criteriaDraft.score_grammar_accuracy === "" ? null : Number(criteriaDraft.score_grammar_accuracy);
        payload.grade = avg !== null ? String(avg) : gradeDraft.trim();
      } else {
        payload.grade = gradeDraft.trim();
      }
      await supabase.from("submissions").update(payload).eq("id", sub.id);
    }
    setBusy(false);
    setActive(null);
    showToast("Feedback saved");
    load();
  }

  if (!assignment) return <CenterSpinner />;

  if (activeStructuredStudent && assignment.type === "Writing") {
    return (
      <TeacherWritingReview
        assignmentId={assignmentId}
        studentId={activeStructuredStudent.id}
        studentName={activeStructuredStudent.name}
        onBack={() => { setActiveStructuredStudent(null); load(); }}
        showToast={showToast}
      />
    );
  }

  if (activeStructuredStudent) {
    return (
      <TeacherQuestionEngineReview
        assignmentId={assignmentId}
        studentId={activeStructuredStudent.id}
        studentName={activeStructuredStudent.name}
        onBack={() => setActiveStructuredStudent(null)}
        showToast={showToast}
      />
    );
  }

  const meta = TYPES[assignment.type] || TYPES.Other;
  const Icon = meta.icon;

  // Two groups, per Phase 25 — submitted students first, not-submitted
  // after, instead of one flat list.
  const isSpeakingStructured = isStructured && assignment.type === "Speaking";
  const submittedRoster = roster.filter((s) =>
    isSpeakingStructured
      ? speakingViewedIds.has(s.id)
      : isStructured
      ? structuredStudentIds.has(s.id)
      : Boolean(submissions.find((x) => x.student_id === s.id)?.submitted_at)
  );
  const notSubmittedRoster = roster.filter((s) => !submittedRoster.includes(s));

  function statusFor(student) {
    if (isSpeakingStructured) return speakingViewedIds.has(student.id) ? "viewed" : "to-view";
    if (isStructured && assignment.type === "Writing") {
      if (writingReleasedIds.has(student.id) && structuredStudentIds.has(student.id)) return "graded";
      if (structuredStudentIds.has(student.id)) return "submitted";
      if (writingStartedIds.has(student.id)) return "in-progress";
      return "pending";
    }
    if (isStructured) return structuredStudentIds.has(student.id) ? "submitted" : "pending";
    const sub = submissions.find((x) => x.student_id === student.id);
    if (sub?.grade) return "graded";
    if (sub?.submitted_at) return "submitted";
    if (sub?.started_at) return "in-progress";
    return "pending";
  }

  function handleRowClick(student) {
    if (isStructured) {
      if (structuredStudentIds.has(student.id)) setActiveStructuredStudent(student);
      return;
    }
    openGrade(student);
  }

  function renderRow(s) {
    const clickable = isStructured ? structuredStudentIds.has(s.id) : true;
    return (
      <div key={s.id} className={`sub-row ${clickable ? "" : "sub-row-disabled"}`} onClick={clickable ? () => handleRowClick(s) : undefined}>
        <div className="avatar small">{s.name.slice(0, 1).toUpperCase()}</div>
        <div className="sub-name">{s.name}</div>
        <StatusBadge status={statusFor(s)} />
        {clickable && <ChevronRight size={15} className="chev" />}
      </div>
    );
  }

  return (
    <div className="page page-wide">
      <div className="row-right" style={{ justifyContent: "space-between", marginBottom: 4 }}>
        <button className="back-link" onClick={() => setScreen({ name: "class", classId })}><ArrowLeft size={14} /> Back to class</button>
        <div style={{ display: "flex", gap: 8 }}>
          {isStructured && (
            <button
              className="btn-ghost"
              onClick={() =>
                setScreen({
                  name:
                    assignment.type === "Listening"
                      ? "listening-builder"
                      : assignment.type === "Writing"
                      ? "writing-builder"
                      : assignment.type === "Speaking"
                      ? "speaking-builder"
                      : "reading-builder",
                  classId,
                  editAssignmentId: assignmentId,
                })
              }
            >
              <Pencil size={13} /> Edit assignment
            </button>
          )}
          {isStructured && (
            <button className="btn-ghost" onClick={() => setShowDuplicate((v) => !v)}>
              <Copy size={13} /> Duplicate to another class
            </button>
          )}
          <button className="btn-ghost delete-assignment-btn" disabled={deleting} onClick={handleDelete}>
            <Trash2 size={13} /> {deleting ? "Checking…" : "Delete assignment"}
          </button>
        </div>
      </div>

      {showDuplicate && (
        <div className="feedback-panel" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span className="field-label" style={{ margin: 0 }}>Duplicate this assignment to:</span>
          <select className="field-input" style={{ maxWidth: 220 }} value={duplicateTargetClass} onChange={(e) => setDuplicateTargetClass(e.target.value)}>
            <option value="">Choose a class…</option>
            {myClasses.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <button className="btn-primary" disabled={!duplicateTargetClass || duplicating} onClick={duplicateToClass}>
            {duplicating ? "Duplicating…" : "Duplicate"}
          </button>
          <span className="field-hint" style={{ margin: 0, flexBasis: "100%" }}>
            Creates a completely independent copy — editing or deleting one afterwards never affects the other.
          </span>
        </div>
      )}

      <div className="asg-header">
        <div className="asg-icon" style={{ color: meta.color }}><Icon size={22} /></div>
        <div>
          <div className="asg-type">{assignment.type}</div>
          <h1 className="asg-title">{assignment.title}</h1>
          <div className="asg-due"><Clock size={13} /> Due {fmtDueDateTime(assignment.due_date, assignment.due_time)}</div>
        </div>
      </div>
      <AttachmentPreview url={assignment.image_url} />
      {assignment.description && !isStructured && <p className="asg-desc">{assignment.description}</p>}

      {roster.length === 0 ? (
        <EmptyState icon={<Users size={24} />} title="No students in this class yet" />
      ) : (
        <>
          <h3 className="section-title">{isSpeakingStructured ? "Viewed" : "Submitted"} ({submittedRoster.length})</h3>
          {submittedRoster.length === 0 ? (
            <p className="empty-inline">{isSpeakingStructured ? "No student has opened it yet." : "No submissions yet."}</p>
          ) : (
            <div className="sub-list">{submittedRoster.map(renderRow)}</div>
          )}

          <h3 className="section-title" style={{ marginTop: 22 }}>{isSpeakingStructured ? "Not viewed yet" : "Not submitted"} ({notSubmittedRoster.length})</h3>
          {notSubmittedRoster.length === 0 ? (
            <p className="empty-inline">{isSpeakingStructured ? "Everyone has opened it." : "Everyone has submitted."}</p>
          ) : (
            <div className="sub-list">{notSubmittedRoster.map(renderRow)}</div>
          )}
        </>
      )}

      {active && (() => {
        const sub = submissions.find((s) => s.student_id === active.id);
        const canSave = !!(sub && sub.submitted_at);
        return (
          <div className="grade-overlay">
            <div className="grade-topbar">
              <button className="back-link" onClick={() => setActive(null)}><ArrowLeft size={14} /> Back to submissions</button>
              <div className="grade-title">{active.name}</div>
              <div />
            </div>

            <div className="grade-body">
              <div className="grade-panel grade-panel-submission">
                <div className="field-label">Submitted answer</div>
                {sub?.submitted_at ? (
                  <>
                    <div className="spellcheck-hint"><Highlighter size={12} /> Misspelled words appear underlined in red.</div>
                    <textarea readOnly className="submission-box" value={sub.content} lang="en" spellCheck="true" />
                    <div className="sub-meta">
                      Submitted {new Date(sub.submitted_at).toLocaleString()}
                      {assignment.target_word_count ? ` · ${wordCount(sub.content)} / ${assignment.target_word_count} words` : ` · ${wordCount(sub.content)} words`}
                    </div>
                  </>
                ) : sub?.started_at ? (
                  <div className="empty-inline">This student has opened the timed task but hasn't submitted yet — check back once the clock runs out.</div>
                ) : (
                  <div className="empty-inline">No submission yet from this student.</div>
                )}
              </div>

              <div className="grade-panel grade-panel-form">
                {isWritingType ? (
                  <>
                    <div className="field-label">IELTS Writing criteria</div>
                    {CRITERIA.map((c) => (
                      <div key={c.key} className="criteria-row">
                        <span className="criteria-label">{c.label}</span>
                        <input
                          type="number" min="0" max="9" step="0.5"
                          className="field-input criteria-input"
                          placeholder="—"
                          value={criteriaDraft[c.key] ?? ""}
                          onChange={(e) => setCriteriaDraft((d) => ({ ...d, [c.key]: e.target.value }))}
                        />
                      </div>
                    ))}
                    {averageScore(Object.values(criteriaDraft)) !== null && (
                      <div className="criteria-avg">Overall band (auto): <strong>{averageScore(Object.values(criteriaDraft))}</strong></div>
                    )}
                  </>
                ) : (
                  <>
                    <label className="field-label">Band / grade</label>
                    <input className="field-input" placeholder="e.g. 6.5" value={gradeDraft} onChange={(e) => setGradeDraft(e.target.value)} />
                  </>
                )}

                <label className="field-label" style={{ marginTop: 14 }}>Feedback</label>
                <textarea className="field-input textarea" style={{ minHeight: 260 }} placeholder="Comments for the student…" value={feedbackDraft} onChange={(e) => setFeedbackDraft(e.target.value)} />

                <button className="btn-primary" style={{ marginTop: 16 }} disabled={busy || !canSave} onClick={saveGrade}>
                  {busy ? "Saving…" : "Save feedback"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
