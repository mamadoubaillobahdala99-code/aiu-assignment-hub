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
import { DropMenu, DropMenuItem, DropMenuSeparator, Breadcrumb } from "../../components/DropMenu";
import { loadAssignmentWork, assignmentStats } from "./assignmentWork";
import { AssignmentStats, StudentsTable, QuestionsTable } from "./AssignmentStudents";

const CRITERIA = [
  { key: "score_task_achievement", label: "Task Achievement" },
  { key: "score_coherence_cohesion", label: "Coherence & Cohesion" },
  { key: "score_lexical_resource", label: "Lexical Resource" },
  { key: "score_grammar_accuracy", label: "Grammatical Range & Accuracy" },
];


// Livraison 69: whether this paper belongs to an exam, and whether that
// exam is running, is read from the DATABASE — not from the address,
// which a refresh or the browser's Back/Forward could have emptied. So
// "Back" and the breadcrumb always lead to the exam for an exam paper,
// and to the class for a class paper, whatever the way in.
//
// returnTo / examLocked: this screen is now also reached from an exam.
//   returnTo  — where "Back" goes. Without it, Back would open the exam's
//               private container as if it were a class.
//   examLocked — the exam is running. Editing a paper deletes its
//               questions to rewrite them, which would wipe the whole
//               room's work, so Edit and Delete disappear. Preview and
//               Duplicate stay. The database refuses it too (a trigger),
//               this only spares the teacher the error.
export function AssignmentTeacher({ classId, assignmentId, teacherId, setScreen, showToast, returnTo, examLocked, openDuplicate }) {
  const [assignment, setAssignment] = useState(null);
  const [roster, setRoster] = useState([]);
  const [isStructured, setIsStructured] = useState(false);
  const [structuredStudentIds, setStructuredStudentIds] = useState(new Set());
  // Livraison 73: every student's status, time and result, and (Reading /
  // Listening) how each question went — see assignmentWork.js.
  const [work, setWork] = useState(null);
  const [tab, setTab] = useState("students");
  const [activeStructuredStudent, setActiveStructuredStudent] = useState(null);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [myClasses, setMyClasses] = useState([]);
  const [showDuplicate, setShowDuplicate] = useState(false);
  const [duplicateTargetClass, setDuplicateTargetClass] = useState("");
  const [duplicating, setDuplicating] = useState(false);
  // Reading the paper itself, with its answer key — no student needed.
  const [previewing, setPreviewing] = useState(false);
  // Livraison 69: where this paper lives. undefined = not read yet;
  // null = a class paper; otherwise its exam and that exam's state.
  const [exam, setExam] = useState(undefined);
  const [homeName, setHomeName] = useState("");
  // After "Duplicate": we stay here, with a link to the copy.
  const [lastCopy, setLastCopy] = useState(null);
  // Livraison 70: "Duplicate…" chosen from the class's table opens this
  // page with the Duplicate panel ready. The request is used once: it is
  // taken out of the address, so a refresh does not open it again.
  useEffect(() => {
    if (!openDuplicate) return;
    setShowDuplicate(true);
    const cleaned = window.location.hash.replace(/([?&])dup=1(&|$)/, (m, a, b) => (b ? a : "")).replace(/[?&]$/, "");
    if (cleaned !== window.location.hash) window.history.replaceState(null, "", cleaned);
  }, [openDuplicate, assignmentId]);

  const load = useCallback(async () => {
    const { data: a } = await supabase.from("assignments").select("*").eq("id", assignmentId).single();
    setAssignment(a || null);
    // Livraison 69: its exam, if any, and the names for the breadcrumb.
    const { data: item } = await supabase
      .from("exam_session_items")
      .select("session_id, exam_sessions(name, opened_at, closed_at, opens_at, closes_at, results_released_at)")
      .eq("assignment_id", assignmentId)
      .maybeSingle();
    if (item?.session_id) {
      const e = item.exam_sessions || {};
      const now = Date.now();
      const opensMs = e.opens_at ? new Date(e.opens_at).getTime() : null;
      const closesMs = e.closes_at ? new Date(e.closes_at).getTime() : null;
      // The same rules as the database (exam_not_started / exam_running).
      const started = Boolean(e.opened_at || e.closed_at || e.results_released_at || (opensMs !== null && now >= opensMs));
      const running = started && !e.closed_at && !e.results_released_at && (closesMs === null || now < closesMs);
      setExam({ sessionId: item.session_id, name: e.name || "Exam", started, running });
      setHomeName(e.name || "Exam");
    } else {
      setExam(null);
      if (a?.class_id) {
        const { data: c } = await supabase.from("classes").select("name").eq("id", a.class_id).maybeSingle();
        setHomeName(c?.name || "Class");
      }
    }
    const { data: r } = await supabase.from("roster").select("student_id, profiles(name)").eq("class_id", classId);
    const people = (r || []).map((x) => ({ id: x.student_id, name: x.profiles?.name || "Unknown" }));
    setRoster(people);

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

    // Livraison 73: one reader for the statuses, times and results (same
    // "handed in" rules as before and as the class page).
    if (a) {
      const w = await loadAssignmentWork({ assignment: a, roster: people, structured });
      setWork(w);
      setStructuredStudentIds(new Set(w.rows.filter((x) => x.open).map((x) => x.id)));
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
    setScreen(exam ? { name: "exam-session", sessionId: exam.sessionId } : (returnTo || { name: "class", classId: assignment?.class_id || classId }));
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
    // Livraison 69: we stay on this paper; a link opens the copy. Before,
    // the screen jumped to the copy, and "Back" then led to the copy's
    // class or exam instead of where the teacher came from.
    setLastCopy({
      name: target?.name || "",
      toExam: Boolean(data.session_id),
      screen: data.session_id
        ? { name: "assignment-teacher", classId: data.class_id, assignmentId: data.assignment_id, returnTo: { name: "exam-session", sessionId: data.session_id } }
        : { name: "assignment-teacher", classId: data.class_id, assignmentId: data.assignment_id },
    });
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
        onBack={() => { setActiveStructuredStudent(null); load(); }}
        showToast={showToast}
      />
    );
  }

  if (previewing) {
    return <TeacherPaperPreview assignmentId={assignmentId} onBack={() => setPreviewing(false)} />;
  }

  const meta = TYPES[assignment.type] || TYPES.Other;
  const Icon = meta.icon;

  // Livraison 69: read from the database once known (see above).
  const examHome = exam ? { name: "exam-session", sessionId: exam.sessionId } : null;
  const backScreen = examHome || returnTo || { name: "class", classId: assignment.class_id || classId };
  const locked = exam === undefined ? examLocked === true : Boolean(exam?.running);
  const examStarted = Boolean(exam?.started);
  const typeKey = String(assignment.type || "").toLowerCase().startsWith("listening") ? "listening"
    : String(assignment.type || "").toLowerCase().startsWith("writing") ? "writing"
    : String(assignment.type || "").toLowerCase().startsWith("speaking") ? "speaking" : "reading";
  function openEdit() {
    setScreen(
      // Reading and Listening open the paper itself, in place
      // (PaperEditor): nothing is rebuilt, the answers stay.
      assignment.type === "Reading" || assignment.type === "Listening"
        ? { name: "paper-editor", classId, assignmentId, returnTo: examHome || returnTo }
        : {
            name: assignment.type === "Writing" ? "writing-builder" : assignment.type === "Speaking" ? "speaking-builder" : "reading-builder",
            classId,
            editAssignmentId: assignmentId,
            returnTo: examHome || returnTo,
          }
    );
  }

  const stats = work && isStructured ? assignmentStats(assignment.type, work) : null;
  const isPaper = isStructured && (assignment.type === "Reading" || assignment.type === "Listening");
  function openStudent(student) {
    if (isStructured && structuredStudentIds.has(student.id)) setActiveStructuredStudent(student);
  }

  return (
    <div className="page page-wide">
      <Breadcrumb items={exam
        ? [{ label: "Exams", onClick: () => setScreen({ name: "exams" }) }, { label: homeName || "Exam", onClick: () => setScreen(backScreen) }, { label: assignment.title }]
        : [{ label: "My classes", onClick: () => setScreen({ name: "home" }) }, { label: homeName || "Class", onClick: () => setScreen(backScreen) }, { label: assignment.title }]} />

      <div className="ph">
        <div className="ph-main">
          <span className={`ph-icon type-ic ic-${typeKey}`}><Icon size={21} /></span>
          <div>
            <div className="eyebrow">
              {assignment.type}
              {assignment.time_limit_minutes ? ` · ${assignment.time_limit_minutes} min` : ""}
              {assignment.due_date ? ` · due ${fmtDueDateTime(assignment.due_date, assignment.due_time)}` : ""}
            </div>
            <h1 className="ph-title">{assignment.title}</h1>
            {exam && (
              <div className="ph-meta">
                <span className={`pill ${exam.running ? "pill-teal" : ""}`}>
                  {exam.running ? "Exam running — the paper is locked" : exam.started ? "Paper of an exam that has started" : "Paper of an exam"}
                </span>
              </div>
            )}
          </div>
        </div>
        <div className="ph-actions">
          {isStructured && (
            <button className="btn-ghost" onClick={() => setPreviewing(true)}>
              <Eye size={15} /> Preview
            </button>
          )}
          {isStructured && !locked && (
            <button className="btn-ghost" onClick={openEdit}>
              <Pencil size={15} /> Edit
            </button>
          )}
          {(isStructured || !(locked || examStarted)) && (
            <DropMenu label="•••" className="btn-ghost btn-dots" title="More actions">
              {isStructured && (
                <DropMenuItem icon={<Copy size={16} />} title="Duplicate to a class or an exam…" onClick={() => setShowDuplicate(true)} />
              )}
              {!(locked || examStarted) && (
                <>
                  {isStructured && <DropMenuSeparator />}
                  <DropMenuItem icon={<Trash2 size={16} />} title={deleting ? "Checking…" : "Delete assignment…"} danger disabled={deleting} onClick={handleDelete} />
                </>
              )}
            </DropMenu>
          )}
        </div>
      </div>

      {lastCopy && (
        <div className="copy-done" role="status">
          <CheckCircle2 size={17} color="var(--teal)" />
          <span>Copied {lastCopy.toExam ? "into the exam" : "to"} “{lastCopy.name}”.{lastCopy.toExam ? "" : " Set a due date there when you're ready."}</span>
          <button className="btn-link" onClick={() => setScreen(lastCopy.screen)}>Open the copy →</button>
          <button className="copy-x" aria-label="Dismiss" onClick={() => setLastCopy(null)}>×</button>
        </div>
      )}

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
          <button className="btn-ghost" disabled={duplicating} onClick={() => { setShowDuplicate(false); setDuplicateTargetClass(""); }}>
            Cancel
          </button>
          <span className="field-hint" style={{ margin: 0, flexBasis: "100%" }}>
            Creates a completely independent copy — editing or deleting one afterwards never affects the other.
            Students' answers and marks are never copied. Only exams that have not started are listed;
            copied into an exam, a Listening is set to one listening only.
          </span>
        </div>
      )}

      {work !== null && !isStructured && (
        <div className="feedback-panel">This assignment has no content yet{locked ? "" : " — use Edit to build it"}. Students cannot hand anything in until it has at least one Part.</div>
      )}

      {work === null ? <CenterSpinner /> : roster.length === 0 ? (
        <EmptyState icon={<Users size={24} />} title={exam ? "No candidate has joined this exam yet" : "No students in this class yet"} />
      ) : (
        <>
          <AssignmentStats stats={stats} />
          {isPaper && (
            <div className="tabs">
              <button className={`tab ${tab === "students" ? "active" : ""}`} onClick={() => setTab("students")}>Students ({roster.length})</button>
              <button className={`tab ${tab === "questions" ? "active" : ""}`} onClick={() => setTab("questions")}>Questions ({work.questions.length})</button>
            </div>
          )}
          {isPaper && tab === "questions"
            ? <QuestionsTable questions={work.questions} handed={stats?.handed || 0} />
            : <StudentsTable rows={work.rows} type={isStructured ? assignment.type : "none"} onOpen={openStudent} />}
        </>
      )}

    </div>
  );
}
