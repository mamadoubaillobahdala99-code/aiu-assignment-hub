import React, { useState, useEffect, useCallback } from "react";
import { BookOpen, Users, Plus, Check, Clock, AlertTriangle, LogOut, GraduationCap, FileText, ChevronRight, X, Copy, CheckCircle2, Headphones, PenLine, Mic, ListChecks, ArrowLeft, Loader2, Timer, Highlighter, Trash2, Pencil , Eye } from "lucide-react";
import { supabase } from "../../supabaseClient";
import { uid, makeCode, TYPES, fmtDate, fmtDueDateTime, daysUntil, wordCount, isPdfUrl } from "../../lib/utils";
import { PageHeader, EmptyState, CenterSpinner, StatusBadge } from "../../components/shared";
import { TeacherQuestionEngineReview } from "../question-engine/TeacherQuestionEngineReview";
import { TeacherWritingReview } from "../question-engine/TeacherWritingReview";
import { TeacherPaperPreview } from "../question-engine/TeacherPaperPreview";
import { deleteUnusedSpeakingFiles } from "../question-engine/speaking";
import { confirmDialog } from "../../lib/confirmDialog";

const CRITERIA = [
  { key: "score_task_achievement", label: "Task Achievement" },
  { key: "score_coherence_cohesion", label: "Coherence & Cohesion" },
  { key: "score_lexical_resource", label: "Lexical Resource" },
  { key: "score_grammar_accuracy", label: "Grammatical Range & Accuracy" },
];


// returnTo / examLocked: this screen is now also reached from an exam.
//   returnTo  — where "Back" goes. Without it, Back would open the exam's
//               private container as if it were a class.
//   examLocked — the exam is running. Editing a paper deletes its
//               questions to rewrite them, which would wipe the whole
//               room's work, so Edit and Delete disappear. Preview and
//               Duplicate stay. The database refuses it too (a trigger),
//               this only spares the teacher the error.
export function AssignmentTeacher({ classId, assignmentId, teacherId, setScreen, showToast, returnTo, examLocked }) {
  const [assignment, setAssignment] = useState(null);
  const [roster, setRoster] = useState([]);
  const [isStructured, setIsStructured] = useState(false);
  const [structuredStudentIds, setStructuredStudentIds] = useState(new Set());
  // Structured Writing only: who has started (draft saved) and whose
  // correction is published — for the In progress / Graded badges.
  const [writingStartedIds, setWritingStartedIds] = useState(new Set());
  const [writingReleasedIds, setWritingReleasedIds] = useState(new Set());
  // Structured Speaking only (consult, nothing submitted): who opened it.
  const [speakingViewedIds, setSpeakingViewedIds] = useState(new Set());
  const [activeStructuredStudent, setActiveStructuredStudent] = useState(null);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [myClasses, setMyClasses] = useState([]);
  const [showDuplicate, setShowDuplicate] = useState(false);
  const [duplicateTargetClass, setDuplicateTargetClass] = useState("");
  const [duplicating, setDuplicating] = useState(false);
  // Reading the paper itself, with its answer key — no student needed.
  const [previewing, setPreviewing] = useState(false);

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
    } else if (structured && a?.type === "Writing") {
      // Structured Writing: answers live in writing_responses, not student_answers.
      const { data: wr } = await supabase.from("writing_responses").select("student_id, submitted_at").eq("assignment_id", assignmentId);
      setStructuredStudentIds(new Set((wr || []).filter((row) => row.submitted_at).map((row) => row.student_id)));
      setWritingStartedIds(new Set((wr || []).map((row) => row.student_id)));
      const { data: fb } = await supabase.from("assignment_feedback").select("student_id, released_at").eq("assignment_id", assignmentId);
      setWritingReleasedIds(new Set((fb || []).filter((row) => row.released_at).map((row) => row.student_id)));
    } else if (structured) {
      // Handed in = has answers, OR is marked handed in in exam_attempts.
      // Looking at the answers alone showed a copy handed in empty as
      // "Not submitted", and the teacher could not open it — while the
      // student's own screen, the class page and the exam screen all
      // (rightly) counted it as handed in. An empty copy that was handed
      // in is not a copy that was never handed in: it opens, and scores 0.
      const [{ data: sa }, { data: att }] = await Promise.all([
        supabase.from("student_answers").select("student_id").eq("assignment_id", assignmentId),
        supabase.from("exam_attempts").select("student_id").eq("assignment_id", assignmentId).not("submitted_at", "is", null),
      ]);
      setStructuredStudentIds(new Set([...(sa || []), ...(att || [])].map((row) => row.student_id)));
    }

    // Where this paper can be copied: my classes, and the exams I am on
    // the team of that have not started yet (the database decides).
    if (teacherId) {
      const { data: targets } = await supabase.rpc("duplicate_targets");
      setMyClasses(Array.isArray(targets) ? targets : []);
    }
  }, [classId, assignmentId, teacherId]);

  useEffect(() => { load(); }, [load]);

  const isWritingType = assignment?.type === "Writing Task 1" || assignment?.type === "Writing Task 2";


  async function handleDelete() {
    const warningCount = structuredStudentIds.size;

    const msg =
      warningCount > 0
        ? `${warningCount} student${warningCount === 1 ? " has" : "s have"} already submitted this assignment. Deleting it will permanently remove their work too. Delete anyway?`
        : "Delete this assignment? This cannot be undone.";
    if (!(await confirmDialog({ title: "Delete this assignment?", message: msg, confirmLabel: "Delete", danger: true }))) return;

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
    setScreen(returnTo || { name: "class", classId });
  }

  // The whole copy is made by the database in ONE step
  // (duplicate_assignment): the paper, its Parts, groups, questions and
  // answer keys — or nothing at all if anything fails. Never the
  // students' answers. Into an exam, a Listening becomes "one listening
  // only" and the paper is added at the end of the exam's list.
  async function duplicateToClass() {
    if (!duplicateTargetClass) return;
    const target = myClasses.find((t) => t.class_id === duplicateTargetClass);
    setDuplicating(true);
    const { data, error } = await supabase.rpc("duplicate_assignment", {
      p_assignment_id: assignmentId,
      p_target_class_id: duplicateTargetClass,
    });
    setDuplicating(false);
    if (error || !data?.assignment_id) {
      showToast("Could not duplicate: " + (error?.message || "unknown error") + " — nothing was copied.");
      return;
    }
    setShowDuplicate(false);
    setDuplicateTargetClass("");
    if (data.session_id) {
      showToast(`Copied into the exam "${target?.name || ""}"`);
      setScreen({
        name: "assignment-teacher",
        classId: data.class_id,
        assignmentId: data.assignment_id,
        returnTo: { name: "exam-session", sessionId: data.session_id },
      });
    } else {
      showToast("Duplicated — set a due date in the new class when you're ready");
      setScreen({ name: "assignment-teacher", classId: data.class_id, assignmentId: data.assignment_id });
    }
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

  if (previewing) {
    return <TeacherPaperPreview assignmentId={assignmentId} onBack={() => setPreviewing(false)} />;
  }

  const meta = TYPES[assignment.type] || TYPES.Other;
  const Icon = meta.icon;

  // Two groups, per Phase 25 — submitted students first, not-submitted
  // after, instead of one flat list.
  const isSpeakingStructured = isStructured && assignment.type === "Speaking";
  const submittedRoster = roster.filter((s) =>
    isSpeakingStructured ? speakingViewedIds.has(s.id) : structuredStudentIds.has(s.id)
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
    return structuredStudentIds.has(student.id) ? "submitted" : "pending";
  }

  function handleRowClick(student) {
    if (isStructured) {
      if (structuredStudentIds.has(student.id)) setActiveStructuredStudent(student);
      return;
    }
  }

  function renderRow(s) {
    const clickable = structuredStudentIds.has(s.id);
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
        <button className="back-link" onClick={() => setScreen(returnTo || { name: "class", classId })}>
          <ArrowLeft size={14} /> {returnTo ? "Back to the exam" : "Back to class"}
        </button>
        <div style={{ display: "flex", gap: 8 }}>
          {isStructured && (
            <button className="btn-ghost" onClick={() => setPreviewing(true)}>
              <Eye size={13} /> Preview
            </button>
          )}
          {isStructured && !examLocked && (
            <button
              className="btn-ghost"
              onClick={() =>
                setScreen(
                  // Reading and Listening open the paper itself, in place
                  // (PaperEditor): nothing is rebuilt, the answers stay.
                  assignment.type === "Reading" || assignment.type === "Listening"
                    ? { name: "paper-editor", classId, assignmentId, returnTo }
                    : {
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
                  returnTo,
                })
              }
            >
              <Pencil size={13} /> Edit assignment
            </button>
          )}
          {isStructured && (
            <button className="btn-ghost" onClick={() => setShowDuplicate((v) => !v)}>
              <Copy size={13} /> Duplicate
            </button>
          )}
          {!examLocked && (
            <button className="btn-ghost delete-assignment-btn" disabled={deleting} onClick={handleDelete}>
              <Trash2 size={13} /> {deleting ? "Checking…" : "Delete assignment"}
            </button>
          )}
        </div>
      </div>

      {showDuplicate && (
        <div className="feedback-panel" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span className="field-label" style={{ margin: 0 }}>Duplicate this paper to:</span>
          <select className="field-input" style={{ maxWidth: 280 }} value={duplicateTargetClass} onChange={(e) => setDuplicateTargetClass(e.target.value)}>
            <option value="">Choose a class or an exam…</option>
            {myClasses.some((t) => t.kind === "class") && (
              <optgroup label="My classes">
                {myClasses.filter((t) => t.kind === "class").map((t) => (
                  <option key={t.class_id} value={t.class_id}>{t.name}</option>
                ))}
              </optgroup>
            )}
            {myClasses.some((t) => t.kind === "exam") && (
              <optgroup label="My exams (not started yet)">
                {myClasses.filter((t) => t.kind === "exam").map((t) => (
                  <option key={t.class_id} value={t.class_id}>{t.name}</option>
                ))}
              </optgroup>
            )}
          </select>
          <button className="btn-primary" disabled={!duplicateTargetClass || duplicating} onClick={duplicateToClass}>
            {duplicating ? "Duplicating…" : "Duplicate"}
          </button>
          <span className="field-hint" style={{ margin: 0, flexBasis: "100%" }}>
            Creates a completely independent copy — editing or deleting one afterwards never affects the other.
            Students' answers and marks are never copied. Only exams that have not started are listed;
            copied into an exam, a Listening is set to one listening only.
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

    </div>
  );
}
