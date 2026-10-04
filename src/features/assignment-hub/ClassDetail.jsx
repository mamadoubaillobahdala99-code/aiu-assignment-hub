
import React, { useState, useEffect, useCallback } from "react";
import { BookOpen, Users, Plus, AlertTriangle, FileText, ChevronRight, Copy, CheckCircle2, Headphones, PenLine, Mic, ArrowLeft, Trash2, UserMinus, ChevronDown } from "lucide-react";
import { supabase } from "../../supabaseClient";
import { fmtDate } from "../../lib/utils";
import { EmptyState, CenterSpinner, Modal, StatusBadge } from "../../components/shared";
import { AssignmentsTab } from "./AssignmentsTab";
import { confirmDialog } from "../../lib/confirmDialog";
import { dueInfo } from "../../lib/due";
import { DropMenu, DropMenuItem, DropMenuSeparator, Breadcrumb } from "../../components/DropMenu";

export function ClassDetail({ classId, setScreen, showToast }) {
  const [cls, setCls] = useState(null);
  const [roster, setRoster] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [tab, setTab] = useState("assignments");
  const [copied, setCopied] = useState(false);
  const [activeStudent, setActiveStudent] = useState(null);
  const [deletingClass, setDeletingClass] = useState(false);
  // Two-step deletion. Deleting a class cascades through everything it
  // contains — assignments, answers, submissions, marks — with no way
  // back, so the dialog counts what would really be destroyed and, when
  // student work is involved, asks for the class name to be typed.
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteStats, setDeleteStats] = useState(null);
  const [confirmName, setConfirmName] = useState("");
  // Livraison 70: the class's figures (script 44). null = not available.
  const [overview, setOverview] = useState(null);

  // Livraison 82: the four reads are asked at the same time (before: one
  // after the other). Same reads, same rights; an exam's box still leads
  // to its exam, and nothing of it is shown.
  const load = useCallback(async () => {
    const [{ data: c }, { data: r }, { data: a }, { data: ov, error: ovErr }] = await Promise.all([
      supabase.from("classes").select("*").eq("id", classId).single(),
      supabase.from("roster").select("student_id, joined_at, profiles(name)").eq("class_id", classId),
      supabase.from("assignments").select("*").eq("class_id", classId).order("created_at", { ascending: false }),
      supabase.rpc("class_overview", { p_class_id: classId }),
    ]);
    // Livraison 69: an exam keeps its papers in a private box that is a
    // class underneath. It is never shown as a class: whoever lands here
    // (an old link, a refresh) is taken to the exam itself.
    if (c?.kind === "exam") {
      const { data: ses } = await supabase.from("exam_sessions").select("id").eq("container_class_id", classId).maybeSingle();
      setScreen(ses?.id ? { name: "exam-session", sessionId: ses.id } : { name: "exams" });
      return;
    }
    setCls(c || null);
    setRoster((r || []).map((x) => ({ studentId: x.student_id, name: x.profiles?.name || "Unknown", joined_at: x.joined_at })));
    setAssignments(a || []);
    setOverview(ovErr ? null : ov || null);
  }, [classId, setScreen]);

  useEffect(() => { load(); }, [load]);

  function copyCode() {
    if (!cls) return;
    navigator.clipboard?.writeText(cls.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  // Deleting a class is always allowed, even with students/assignments
  // inside — the teacher just gets told exactly what that will cost
  // first. Orphaned questions are cleaned up the same way as editing
  // or deleting a single assignment; everything else (roster,
  // assignments, exam_sections, student_answers...) is already wired
  // to cascade automatically at the database level.
  // Opens the dialog and counts, for real, what deleting would destroy.
  async function openDeleteDialog() {
    setConfirmName("");
    setDeleteStats(null);
    setDeleteOpen(true);
    const assignmentIds = assignments.map((a) => a.id);
    if (assignmentIds.length === 0) {
      setDeleteStats({ copies: 0, answers: 0, writings: 0 });
      return;
    }
    const [handed, answers, writings] = await Promise.all([
      supabase.from("exam_attempts").select("assignment_id", { count: "exact", head: true }).in("assignment_id", assignmentIds).not("submitted_at", "is", null),
      supabase.from("student_answers").select("id", { count: "exact", head: true }).in("assignment_id", assignmentIds),
      supabase.from("writing_responses").select("id", { count: "exact", head: true }).in("assignment_id", assignmentIds).not("submitted_at", "is", null),
    ]);
    setDeleteStats({ copies: handed.count || 0, answers: answers.count || 0, writings: writings.count || 0 });
  }

  async function handleDeleteClass() {
    setDeleteOpen(false);
    setDeletingClass(true);
    const assignmentIds = assignments.map((a) => a.id);
    if (assignmentIds.length > 0) {
      const { data: sections } = await supabase.from("exam_sections").select("id").in("assignment_id", assignmentIds);
      const sectionIds = (sections || []).map((s) => s.id);
      if (sectionIds.length > 0) {
        const { data: links } = await supabase.from("assignment_questions").select("question_id").in("section_id", sectionIds);
        const questionIds = [...new Set((links || []).map((l) => l.question_id))];
        if (questionIds.length > 0) {
          await supabase.from("questions").delete().in("id", questionIds);
        }
      }
    }

    const { error } = await supabase.from("classes").delete().eq("id", classId);
    setDeletingClass(false);
    if (error) {
      showToast?.("Could not delete class: " + error.message);
      return;
    }
    showToast?.("Class deleted");
    setScreen({ name: "home" });
  }

  if (!cls) return <CenterSpinner />;

  if (activeStudent) {
    return (
      <StudentInClassDetail
        student={activeStudent}
        classId={classId}
        assignments={assignments}
        onBack={() => { setActiveStudent(null); load(); }}
        setScreen={setScreen}
        showToast={showToast}
      />
    );
  }

  return (
    <div className="page page-wide">
      <Breadcrumb items={[{ label: "My classes", onClick: () => setScreen({ name: "home" }) }, { label: cls.name }]} />

      {deleteOpen && (() => {
        const work = deleteStats ? deleteStats.copies + deleteStats.answers + deleteStats.writings : 0;
        const hasWork = work > 0;
        const ready = deleteStats !== null && (!hasWork || confirmName.trim() === cls.name);
        return (
          <Modal title={`Delete "${cls.name}"`} onClose={() => setDeleteOpen(false)}>
            {deleteStats === null ? (
              <p className="muted-p">Checking what this class contains…</p>
            ) : (
              <>
                <p className="muted-p" style={{ marginTop: 0 }}>
                  This cannot be undone. There is no bin and no backup — deleting the class
                  deletes everything inside it, for every student.
                </p>
                <ul className="cd-del-list">
                  <li><strong>{assignments.length}</strong> assignment{assignments.length === 1 ? "" : "s"}</li>
                  <li><strong>{roster.length}</strong> student{roster.length === 1 ? "" : "s"} removed from the class</li>
                  {hasWork && <li><strong>{deleteStats.answers}</strong> answer{deleteStats.answers === 1 ? "" : "s"} given in Reading / Listening exams</li>}
                  {hasWork && <li><strong>{deleteStats.copies}</strong> exam{deleteStats.copies === 1 ? "" : "s"} handed in, with their marks and feedback</li>}
                  {hasWork && <li><strong>{deleteStats.writings}</strong> Writing text{deleteStats.writings === 1 ? "" : "s"} handed in</li>}
                </ul>

                {hasWork ? (
                  <>
                    <div className="cd-del-warning">
                      <AlertTriangle size={15} />
                      <span>This class holds work your students have handed in. Once deleted, it is gone for them too.</span>
                    </div>
                    <label className="field-label">Type <strong>{cls.name}</strong> to confirm</label>
                    <input
                      className="field-input"
                      value={confirmName}
                      onChange={(e) => setConfirmName(e.target.value)}
                      placeholder={cls.name}
                      autoFocus
                    />
                  </>
                ) : (
                  <p className="muted-p">No student has handed in anything in this class yet.</p>
                )}
              </>
            )}

            <div className="cd-del-actions">
              <button className="btn-ghost" onClick={() => setDeleteOpen(false)}>Keep this class</button>
              <button className="btn-primary cd-del-confirm" disabled={!ready || deletingClass} onClick={handleDeleteClass}>
                {deletingClass ? "Deleting…" : "Delete permanently"}
              </button>
            </div>
          </Modal>
        );
      })()}

      <div className="ph">
        <div className="ph-main">
          <div>
            <div className="eyebrow">Class</div>
            <h1 className="ph-title">{cls.name}</h1>
            <div className="ph-meta">
              <button className="pill pill-teal" onClick={copyCode} title="Copy the join code">
                {copied ? <CheckCircle2 size={14} /> : <Copy size={14} />} {copied ? "Copied" : `Code: ${cls.code || "—"}`}
              </button>
              <span className="pill">{roster.length} student{roster.length === 1 ? "" : "s"}</span>
              <span className="pill">{assignments.length} assignment{assignments.length === 1 ? "" : "s"}</span>
            </div>
          </div>
        </div>
        <div className="ph-actions">
          <DropMenu label="•••" className="btn-ghost btn-dots" title="More actions">
            <DropMenuItem icon={<Copy size={16} />} title="Copy the join code" onClick={copyCode} />
            <DropMenuSeparator />
            <DropMenuItem icon={<Trash2 size={16} />} title={deletingClass ? "Deleting…" : "Delete class…"} danger disabled={deletingClass} onClick={openDeleteDialog} />
          </DropMenu>
          <NewAssignmentMenu onPick={(screen) => setScreen({ ...screen, classId })} />
        </div>
      </div>

      {(() => {
        // Livraison 70: four figures at the top of the class.
        const counts = Object.fromEntries((overview?.assignments || []).map((x) => [x.id, x]));
        const toMark = (overview?.assignments || []).reduce((n, x) => n + (x.to_mark || 0), 0);
        const now = new Date();
        const dueWeek = assignments.filter((a) => { const d = dueInfo(a.due_date, a.due_time, now); return d.end && d.end >= now && d.days <= 7; }).length;
        const recent = assignments.filter((a) => counts[a.id]?.structured && a.type !== "Speaking").slice(0, 3);
        const handed = recent.reduce((n, a) => n + (counts[a.id]?.handed_in || 0), 0);
        const rate = recent.length && roster.length ? Math.round((handed / (recent.length * roster.length)) * 100) : null;
        const joinedWeek = roster.filter((r) => r.joined_at && now - new Date(r.joined_at) < 7 * 86400000).length;
        return (
          <div className="stat-grid">
            <div className="stat"><div className="stat-l">To mark</div><div className="stat-v">{overview ? toMark : "—"}</div><div className="stat-d">Writing copies waiting</div></div>
            <div className="stat"><div className="stat-l">Due this week</div><div className="stat-v">{dueWeek}</div><div className="stat-d">assignment{dueWeek === 1 ? "" : "s"}</div></div>
            <div className="stat"><div className="stat-l">Handed in</div><div className="stat-v">{rate === null ? "—" : `${rate}%`}</div><div className="stat-d">{recent.length ? `on the last ${recent.length === 1 ? "assignment" : `${recent.length} assignments`}` : "nothing to count yet"}</div></div>
            <div className="stat"><div className="stat-l">Students</div><div className="stat-v">{roster.length}</div><div className="stat-d">{joinedWeek ? `${joinedWeek} joined this week` : "in this class"}</div></div>
          </div>
        );
      })()}

      <div className="tabs">
        <button className={`tab ${tab === "assignments" ? "active" : ""}`} onClick={() => setTab("assignments")}>Assignments ({assignments.length})</button>
        <button className={`tab ${tab === "roster" ? "active" : ""}`} onClick={() => setTab("roster")}>Students ({roster.length})</button>
      </div>

      {tab === "assignments" && (
        <AssignmentsTab
          assignments={assignments}
          counts={Object.fromEntries((overview?.assignments || []).map((x) => [x.id, x]))}
          studentsCount={roster.length}
          onOpen={(a) => setScreen({ name: "assignment-teacher", classId, assignmentId: a.id })}
          onDuplicate={(a) => setScreen({ name: "assignment-teacher", classId, assignmentId: a.id, dup: "1" })}
        />
      )}

      {tab === "roster" && (
        roster.length === 0 ? (
          <EmptyState icon={<Users size={26} />} title="No students yet" body={`Share the join code "${cls.code}" with your students.`} />
        ) : (() => {
          // Livraison 70: a table — who, since when, how much handed in.
          const doneBy = Object.fromEntries((overview?.students_done || []).map((x) => [x.student_id, x.done]));
          const total = (overview?.assignments || []).filter((x) => x.structured).length;
          return (
            <div className="dt-wrap">
              <table className="dt">
                <thead><tr><th>Student</th><th className="hide-sm">Joined</th><th>Handed in</th><th aria-label="Open" /></tr></thead>
                <tbody>
                  {roster.map((st, i) => {
                    const done = doneBy[st.studentId];
                    const pct = total && done !== undefined ? Math.round((done / total) * 100) : 0;
                    return (
                      <tr key={i} className="dt-row" onClick={() => setActiveStudent(st)}>
                        <td>
                          <div className="dt-title">
                            <div className="avatar small">{st.name.slice(0, 1).toUpperCase()}</div>
                            <button type="button" className="dt-open" onClick={(e) => { e.stopPropagation(); setActiveStudent(st); }}>{st.name}</button>
                          </div>
                        </td>
                        <td className="hide-sm dt-muted">{fmtDate(st.joined_at)}</td>
                        <td>
                          {done === undefined ? <span className="dt-muted">—</span> : (
                            <span className="dt-progress"><span className="dt-bar"><i style={{ width: `${pct}%` }} /></span>{done}/{total}</span>
                          )}
                        </td>
                        <td className="dt-actions"><ChevronRight size={16} className="chev" /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        })()
      )}
    </div>
  );
}

// ---------- Teacher's view of one student within a class ----------
// Deliberately simple, per the brief: name + "X / Y completed", then
// the class's assignments with this student's status on each —
// nothing more (no percentages/charts beyond the one completed count).
function StudentInClassDetail({ student, classId, assignments, onBack, setScreen, showToast }) {
  const [statuses, setStatuses] = useState(null); // assignmentId -> status string
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const assignmentIds = assignments.map((a) => a.id);
      if (assignmentIds.length === 0) {
        if (!cancelled) setStatuses({});
        return;
      }

      // Livraison 82: the six reads are asked at the same time (before:
      // one after the other). Same reads, same rights, same statuses.
      const writingAll = assignments.filter((x) => x.type === "Writing").map((x) => x.id);
      const speakingAll = assignments.filter((x) => x.type === "Speaking").map((x) => x.id);
      const [{ data: qeSections }, { data: answers }, { data: attempts }, { data: wr }, { data: sv }, { data: fb }] = await Promise.all([
        supabase.from("exam_sections").select("assignment_id").in("assignment_id", assignmentIds),
        supabase.from("student_answers").select("assignment_id").eq("student_id", student.studentId).in("assignment_id", assignmentIds),
        supabase.from("exam_attempts").select("assignment_id").eq("student_id", student.studentId).in("assignment_id", assignmentIds),
        writingAll.length ? supabase.from("writing_responses").select("assignment_id, submitted_at").eq("student_id", student.studentId).in("assignment_id", writingAll) : { data: [] },
        speakingAll.length ? supabase.from("speaking_views").select("assignment_id").eq("student_id", student.studentId).in("assignment_id", speakingAll) : { data: [] },
        supabase.from("assignment_feedback").select("assignment_id, released_at").eq("student_id", student.studentId).in("assignment_id", assignmentIds),
      ]);
      const qeIds = new Set((qeSections || []).map((s) => s.assignment_id));

      let submittedQe = new Set();
      let attemptedQe = new Set();
      let releasedQe = new Set();
      let viewedQe = new Set();
      if (qeIds.size > 0) {
        submittedQe = new Set((answers || []).filter((a) => qeIds.has(a.assignment_id)).map((a) => a.assignment_id));
        attemptedQe = new Set((attempts || []).filter((a) => qeIds.has(a.assignment_id)).map((a) => a.assignment_id));
        // Structured Writing answers live in writing_responses.
        for (const w of wr || []) {
          if (!qeIds.has(w.assignment_id)) continue;
          if (w.submitted_at) submittedQe.add(w.assignment_id);
          else attemptedQe.add(w.assignment_id);
        }
        // Structured Speaking is consult-only: "viewed" instead of "submitted".
        viewedQe = new Set((sv || []).filter((r) => qeIds.has(r.assignment_id)).map((r) => r.assignment_id));
        releasedQe = new Set((fb || []).filter((r) => r.released_at && qeIds.has(r.assignment_id)).map((r) => r.assignment_id));
      }

      const map = {};
      for (const a of assignments) {
        if (qeIds.has(a.id) && a.type === "Speaking") {
          map[a.id] = viewedQe.has(a.id) ? "viewed" : "to-view";
        } else if (qeIds.has(a.id)) {
          if (submittedQe.has(a.id)) {
            const isReleased = a.auto_release_score || releasedQe.has(a.id);
            map[a.id] = isReleased ? "graded" : "submitted";
          } else if (attemptedQe.has(a.id)) map[a.id] = "in-progress";
          else map[a.id] = "pending";
        } else {
          // No Part yet (a builder interrupted before writing its
          // content): nothing can have been handed in.
          map[a.id] = "pending";
        }
      }
      if (!cancelled) setStatuses(map);
    })();
    return () => { cancelled = true; };
  }, [student.studentId, assignments]);

  async function removeStudent() {
    if (!(await confirmDialog({ title: "Remove this student?", message: `Remove ${student.name} from this class? They'll need the class code to rejoin.`, confirmLabel: "Remove", danger: true }))) return;
    setRemoving(true);
    const { error } = await supabase.from("roster").delete().eq("class_id", classId).eq("student_id", student.studentId);
    setRemoving(false);
    if (error) {
      showToast?.("Could not remove student: " + error.message);
      return;
    }
    showToast?.(`${student.name} removed from class`);
    onBack();
  }

  if (statuses === null) return <CenterSpinner />;

  const completedCount = assignments.filter((a) => statuses[a.id] === "submitted" || statuses[a.id] === "graded").length;

  return (
    <div className="page page-wide">
      <button className="back-link" onClick={onBack}><ArrowLeft size={14} /> Back to students</button>

      <div className="row-right" style={{ justifyContent: "space-between", marginTop: 14 }}>
        <div className="asg-header" style={{ marginTop: 0 }}>
          <div className="avatar" style={{ width: 44, height: 44, fontSize: 17 }}>{student.name.slice(0, 1).toUpperCase()}</div>
          <div>
            <div className="asg-type">Student</div>
            <h1 className="asg-title">{student.name}</h1>
            <p className="field-hint" style={{ margin: 0 }}>{completedCount} / {assignments.length} assignments completed</p>
          </div>
        </div>
        <button className="btn-ghost delete-assignment-btn" disabled={removing} onClick={removeStudent}>
          <UserMinus size={13} /> {removing ? "Removing…" : "Remove from class"}
        </button>
      </div>

      <h3 className="section-title">Assignments</h3>
      {assignments.length === 0 ? (
        <EmptyState icon={<FileText size={24} />} title="No assignments in this class yet" />
      ) : (
        <div className="sub-list">
          {assignments.map((a) => (
            <div key={a.id} className="sub-row" onClick={() => setScreen({ name: "assignment-teacher", classId, assignmentId: a.id })}>
              <div className="sub-name">{a.title}</div>
              <StatusBadge status={statuses[a.id]} />
              <ChevronRight size={15} className="chev" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


// ---------- "New assignment ▾" (livraison 69) ----------
// One button instead of five: first the quickest way (import a Word or
// PDF test), then the four builders. Each choice opens exactly the
// screen the old buttons opened.
export function NewAssignmentMenu({ onPick, label = "New assignment" }) {
  return (
    <DropMenu wide className="btn-teal" title={label} label={<><Plus size={16} /> {label} <ChevronDown size={15} /></>}>
      <DropMenuItem icon={<span className="type-ic ic-dark"><FileText size={17} /></span>} title="Import a test"
                    hint="A Word or PDF file — the whole paper at once. Reading and Listening."
                    onClick={() => onPick({ name: "test-importer", skill: "reading" })} />
      <DropMenuSeparator label="Or build it question by question" />
      <DropMenuItem icon={<span className="type-ic ic-reading"><BookOpen size={17} /></span>} title="Reading" hint="Passages and questions."
                    onClick={() => onPick({ name: "reading-builder" })} />
      <DropMenuItem icon={<span className="type-ic ic-listening"><Headphones size={17} /></span>} title="Listening" hint="With its recording."
                    onClick={() => onPick({ name: "listening-builder" })} />
      <DropMenuItem icon={<span className="type-ic ic-writing"><PenLine size={17} /></span>} title="Writing" hint="Task 1 and Task 2."
                    onClick={() => onPick({ name: "writing-builder" })} />
      <DropMenuItem icon={<span className="type-ic ic-speaking"><Mic size={17} /></span>} title="Speaking" hint="Topics and cue cards to consult."
                    onClick={() => onPick({ name: "speaking-builder" })} />
    </DropMenu>
  );
}
