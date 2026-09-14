
import React, { useState, useEffect, useCallback } from "react";
import { BookOpen, Users, Plus, Check, Clock, AlertTriangle, LogOut, GraduationCap, FileText, ChevronRight, X, Copy, CheckCircle2, Headphones, PenLine, Mic, ListChecks, ArrowLeft, Loader2, Timer, Highlighter } from "lucide-react";
import { supabase } from "../../supabaseClient";
import { uid, makeCode, TYPES, fmtDate, daysUntil, wordCount, isPdfUrl } from "../../lib/utils";
import { AttachmentPreview, PageHeader, EmptyState, CenterSpinner, Modal, StatusBadge } from "../../components/shared";
import { AssignmentsTab } from "./AssignmentsTab";

export function ClassDetail({ classId, setScreen, showToast }) {
  const [cls, setCls] = useState(null);
  const [roster, setRoster] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [tab, setTab] = useState("assignments");
  const [copied, setCopied] = useState(false);
  const [activeStudent, setActiveStudent] = useState(null);

  const load = useCallback(async () => {
    const { data: c } = await supabase.from("classes").select("*").eq("id", classId).single();
    setCls(c || null);
    const { data: r } = await supabase.from("roster").select("student_id, joined_at, profiles(name)").eq("class_id", classId);
    setRoster((r || []).map((x) => ({ studentId: x.student_id, name: x.profiles?.name || "Unknown", joined_at: x.joined_at })));
    const { data: a } = await supabase.from("assignments").select("*").eq("class_id", classId).order("created_at", { ascending: false });
    setAssignments(a || []);
  }, [classId]);

  useEffect(() => { load(); }, [load]);

  function copyCode() {
    if (!cls) return;
    navigator.clipboard?.writeText(cls.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (!cls) return <CenterSpinner />;

  if (activeStudent) {
    return (
      <StudentInClassDetail
        student={activeStudent}
        classId={classId}
        assignments={assignments}
        onBack={() => setActiveStudent(null)}
        setScreen={setScreen}
      />
    );
  }

  return (
    <div className="page page-wide">
      <button className="back-link" onClick={() => setScreen({ name: "home" })}><ArrowLeft size={14} /> All classes</button>

      <PageHeader eyebrow="Class" title={cls.name} action={
        <button className="btn-ghost" onClick={copyCode}>
          {copied ? <CheckCircle2 size={15} /> : <Copy size={15} />} Code: {cls.code}
        </button>
      } />

      <div className="tabs">
        <button className={`tab ${tab === "assignments" ? "active" : ""}`} onClick={() => setTab("assignments")}>Assignments ({assignments.length})</button>
        <button className={`tab ${tab === "roster" ? "active" : ""}`} onClick={() => setTab("roster")}>Students ({roster.length})</button>
      </div>

      {tab === "assignments" && (
        <>
          <div className="row-right">
            <button className="btn-ghost" onClick={() => setScreen({ name: "reading-builder", classId })}>
              <Plus size={13} /> Structured Reading
            </button>
            <button className="btn-ghost" onClick={() => setScreen({ name: "listening-builder", classId })}>
              <Plus size={13} /> Structured Listening
            </button>
          </div>
          <AssignmentsTab classId={classId} assignments={assignments} onCreated={load} onOpen={(a) => setScreen({ name: "assignment-teacher", classId, assignmentId: a.id })} />
        </>
      )}

      {tab === "roster" && (
        roster.length === 0 ? (
          <EmptyState icon={<Users size={26} />} title="No students yet" body={`Share the join code "${cls.code}" with your students.`} />
        ) : (
          <div className="roster-list">
            {roster.map((s, i) => (
              <div key={i} className="roster-row" style={{ cursor: "pointer" }} onClick={() => setActiveStudent(s)}>
                <div className="avatar small">{s.name.slice(0, 1).toUpperCase()}</div>
                <div className="roster-name">{s.name}</div>
                <div className="roster-date">Joined {fmtDate(s.joined_at)}</div>
                <ChevronRight size={15} className="chev" />
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}

// ---------- Teacher's view of one student within a class ----------
// Deliberately simple, per the brief: name + "X / Y completed", then
// the class's assignments with this student's status on each —
// nothing more (no percentages/charts beyond the one completed count).
function StudentInClassDetail({ student, classId, assignments, onBack, setScreen }) {
  const [statuses, setStatuses] = useState(null); // assignmentId -> status string

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const assignmentIds = assignments.map((a) => a.id);
      if (assignmentIds.length === 0) {
        if (!cancelled) setStatuses({});
        return;
      }

      const { data: qeSections } = await supabase.from("exam_sections").select("assignment_id").in("assignment_id", assignmentIds);
      const qeIds = new Set((qeSections || []).map((s) => s.assignment_id));

      const { data: subs } = await supabase.from("submissions").select("*").eq("student_id", student.studentId).in("assignment_id", assignmentIds);

      let submittedQe = new Set();
      let attemptedQe = new Set();
      let releasedQe = new Set();
      if (qeIds.size > 0) {
        const qeIdList = [...qeIds];
        const { data: answers } = await supabase.from("student_answers").select("assignment_id").eq("student_id", student.studentId).in("assignment_id", qeIdList);
        submittedQe = new Set((answers || []).map((a) => a.assignment_id));
        const { data: attempts } = await supabase.from("exam_attempts").select("assignment_id").eq("student_id", student.studentId).in("assignment_id", qeIdList);
        attemptedQe = new Set((attempts || []).map((a) => a.assignment_id));
        const { data: fb } = await supabase.from("assignment_feedback").select("assignment_id, released_at").eq("student_id", student.studentId).in("assignment_id", qeIdList);
        releasedQe = new Set((fb || []).filter((r) => r.released_at).map((r) => r.assignment_id));
      }

      const map = {};
      for (const a of assignments) {
        if (qeIds.has(a.id)) {
          if (submittedQe.has(a.id)) {
            const isReleased = a.auto_release_score || releasedQe.has(a.id);
            map[a.id] = isReleased ? "graded" : "submitted";
          } else if (attemptedQe.has(a.id)) map[a.id] = "in-progress";
          else map[a.id] = "pending";
        } else {
          const sub = (subs || []).find((s) => s.assignment_id === a.id);
          if (sub?.grade) map[a.id] = "graded";
          else if (sub?.submitted_at) map[a.id] = "submitted";
          else if (sub?.started_at) map[a.id] = "in-progress";
          else map[a.id] = "pending";
        }
      }
      if (!cancelled) setStatuses(map);
    })();
    return () => { cancelled = true; };
  }, [student.studentId, assignments]);

  if (statuses === null) return <CenterSpinner />;

  const completedCount = assignments.filter((a) => statuses[a.id] === "submitted" || statuses[a.id] === "graded").length;

  return (
    <div className="page page-wide">
      <button className="back-link" onClick={onBack}><ArrowLeft size={14} /> Back to students</button>

      <div className="asg-header">
        <div className="avatar" style={{ width: 44, height: 44, fontSize: 17 }}>{student.name.slice(0, 1).toUpperCase()}</div>
        <div>
          <div className="asg-type">Student</div>
          <h1 className="asg-title">{student.name}</h1>
          <p className="field-hint" style={{ margin: 0 }}>{completedCount} / {assignments.length} assignments completed</p>
        </div>
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
