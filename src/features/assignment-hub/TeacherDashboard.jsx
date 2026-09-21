import React, { useState, useEffect, useCallback } from "react";
import {
  BookOpen, Users, Check, Clock, AlertTriangle, FileText, Timer, ChevronRight,
} from "lucide-react";
import { supabase } from "../../supabaseClient";
import { fmtDate, fmtDueDateTime } from "../../lib/utils";
import { PageHeader, EmptyState, CenterSpinner } from "../../components/shared";

function StatCard({ icon, label, value, tone }) {
  return (
    <div className={`stat-card ${tone || ""}`}>
      <div className="stat-icon">{icon}</div>
      <div>
        <div className="stat-value">{value}</div>
        <div className="stat-label">{label}</div>
      </div>
    </div>
  );
}

export function TeacherDashboard({ userId, setScreen }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);

    const { data: classes } = await supabase.from("classes").select("id, name").eq("teacher_id", userId);
    const classIds = (classes || []).map((c) => c.id);

    if (classIds.length === 0) {
      setData({ classes: [], assignments: [], submissions: [], roster: [] });
      setLoading(false);
      return;
    }

    const { data: assignments } = await supabase
      .from("assignments")
      .select("*, classes(name)")
      .in("class_id", classIds);
    const assignmentIds = (assignments || []).map((a) => a.id);

    const { data: roster } = await supabase
      .from("roster")
      .select("class_id, student_id, profiles(name)")
      .in("class_id", classIds);

    // Every assignment is a structured one. Their work is spread over
    // student_answers / exam_attempts / writing_responses /
    // assignment_feedback, so we build one row per student and
    // assignment from those, in the shape the stats and lists below
    // already expect. The name "submission" here is just that shape —
    // nothing is read from the old `submissions` table any more.
    const { data: qeSections } = assignmentIds.length
      ? await supabase.from("exam_sections").select("assignment_id").in("assignment_id", assignmentIds)
      : { data: [] };
    const qeAssignmentIds = new Set((qeSections || []).map((s) => s.assignment_id));

    let qeSubmissions = [];
    if (qeAssignmentIds.size > 0) {
      const qeIds = [...qeAssignmentIds];
      const nameByStudent = new Map((roster || []).map((r) => [r.student_id, r.profiles?.name || "Unknown"]));
      const autoReleaseByAssignment = new Map((assignments || []).map((a) => [a.id, a.auto_release_score]));

      const { data: answers } = await supabase.from("student_answers").select("assignment_id, student_id, answered_at").in("assignment_id", qeIds);
      const { data: attempts } = await supabase.from("exam_attempts").select("assignment_id, student_id, started_at").in("assignment_id", qeIds);
      const { data: feedbackRows } = await supabase.from("assignment_feedback").select("assignment_id, student_id, released_at").in("assignment_id", qeIds);

      const submittedAtByPair = new Map(); // `${assignmentId}:${studentId}` -> latest answered_at
      for (const row of answers || []) {
        const key = `${row.assignment_id}:${row.student_id}`;
        const existing = submittedAtByPair.get(key);
        if (!existing || new Date(row.answered_at) > new Date(existing)) submittedAtByPair.set(key, row.answered_at);
      }
      const startedAtByPair = new Map((attempts || []).map((row) => [`${row.assignment_id}:${row.student_id}`, row.started_at]));

      // Structured Writing answers live in writing_responses: submitted
      // texts count as submissions, saved drafts as "started".
      const writingIds = (assignments || []).filter((x) => x.type === "Writing" && qeAssignmentIds.has(x.id)).map((x) => x.id);
      if (writingIds.length > 0) {
        const { data: wr } = await supabase.from("writing_responses").select("assignment_id, student_id, created_at, submitted_at").in("assignment_id", writingIds);
        for (const row of wr || []) {
          const key = `${row.assignment_id}:${row.student_id}`;
          if (row.submitted_at) {
            const existing = submittedAtByPair.get(key);
            if (!existing || new Date(row.submitted_at) > new Date(existing)) submittedAtByPair.set(key, row.submitted_at);
          }
          if (!startedAtByPair.has(key)) startedAtByPair.set(key, row.created_at);
        }
      }
      const releasedByPair = new Set((feedbackRows || []).filter((row) => row.released_at).map((row) => `${row.assignment_id}:${row.student_id}`));

      const pairKeys = new Set([...submittedAtByPair.keys(), ...startedAtByPair.keys()]);
      qeSubmissions = [...pairKeys].map((key) => {
        const [assignmentId, studentId] = key.split(":");
        const submittedAt = submittedAtByPair.get(key) || null;
        const isReleased = autoReleaseByAssignment.get(assignmentId) || releasedByPair.has(key);
        return {
          id: `qe-${key}`,
          assignment_id: assignmentId,
          student_id: studentId,
          started_at: startedAtByPair.get(key) || null,
          submitted_at: submittedAt,
          grade: submittedAt && isReleased ? "auto" : null,
          profiles: { name: nameByStudent.get(studentId) || "Unknown" },
        };
      });
    }

    setData({ classes: classes || [], assignments: assignments || [], submissions: qeSubmissions, roster: roster || [], qeAssignmentIds: [...qeAssignmentIds] });
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  if (loading || !data) return <CenterSpinner />;

  const { classes, assignments, submissions, roster } = data;
  const qeAssignmentIdSet = new Set(data.qeAssignmentIds || []);

  const totalAssignments = assignments.length;
  const activeClasses = classes.length;
  const studentSubmissions = submissions.filter((s) => s.submitted_at).length;
  const inProgress = submissions.filter((s) => s.started_at && !s.submitted_at).length;

  const today = new Date();
  const upcoming = assignments
    .filter((a) => a.due_date && new Date(a.due_date) >= today)
    .sort((a, b) => new Date(a.due_date) - new Date(b.due_date))
    .slice(0, 5);

  const recent = submissions
    .filter((s) => s.submitted_at)
    .sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at))
    .slice(0, 6)
    .map((s) => ({ ...s, assignment: assignments.find((a) => a.id === s.assignment_id) }));

  // Needs attention: overdue + no submission, or submitted but not graded
  const needsFeedback = submissions
    .filter((s) => s.submitted_at && !s.grade)
    .map((s) => ({
      type: "feedback",
      studentName: s.profiles?.name || "Unknown",
      assignmentTitle: assignments.find((a) => a.id === s.assignment_id)?.title || "Assignment",
    }));

  const missingWork = [];
  // Structured Speaking is consult-only (nothing to submit), so it never counts as missing work.
  const overdueAssignments = assignments.filter((a) => a.due_date && new Date(a.due_date) < today && !(a.type === "Speaking" && qeAssignmentIdSet.has(a.id)));
  for (const a of overdueAssignments) {
    const classRoster = roster.filter((r) => r.class_id === a.class_id);
    for (const r of classRoster) {
      const hasSubmission = submissions.some((s) => s.assignment_id === a.id && s.student_id === r.student_id && s.submitted_at);
      if (!hasSubmission) {
        missingWork.push({ type: "missing", studentName: r.profiles?.name || "Unknown", assignmentTitle: a.title });
      }
    }
  }
  const needsAttention = [...missingWork, ...needsFeedback].slice(0, 10);

  return (
    <div className="page page-wide">
      <PageHeader eyebrow="Teacher" title="Dashboard" />

      <div className="stat-grid">
        <StatCard icon={<FileText size={18} />} label="Total Assignments" value={totalAssignments} />
        <StatCard icon={<BookOpen size={18} />} label="Active Classes" value={activeClasses} />
        <StatCard icon={<Check size={18} />} label="Student Submissions" value={studentSubmissions} />
        <StatCard icon={<Timer size={18} />} label="Assignments In Progress" value={inProgress} />
      </div>

      <div className="dash-columns">
        <div className="dash-col">
          <h3 className="section-title">Upcoming Deadlines</h3>
          {upcoming.length === 0 ? (
            <EmptyState icon={<Clock size={22} />} title="No upcoming deadlines" />
          ) : (
            <div className="dash-list">
              {upcoming.map((a) => (
                <div key={a.id} className="dash-row" onClick={() => setScreen({ name: "class", classId: a.class_id })}>
                  <div>
                    <div className="dash-row-title">{a.title}</div>
                    <div className="dash-row-sub">{a.classes?.name || "Class"}</div>
                  </div>
                  <div className="dash-row-meta"><Clock size={12} /> {fmtDueDateTime(a.due_date, a.due_time)}</div>
                </div>
              ))}
            </div>
          )}

          <h3 className="section-title">Recent Submissions</h3>
          {recent.length === 0 ? (
            <EmptyState icon={<Check size={22} />} title="No submissions yet" />
          ) : (
            <div className="dash-list">
              {recent.map((s) => (
                <div key={s.id} className="dash-row" onClick={() => s.assignment && setScreen({ name: "assignment-teacher", classId: s.assignment.class_id, assignmentId: s.assignment.id })}>
                  <div>
                    <div className="dash-row-title">{s.profiles?.name || "Student"}</div>
                    <div className="dash-row-sub">{s.assignment?.title || "Assignment"}</div>
                  </div>
                  <div className="dash-row-meta">{new Date(s.submitted_at).toLocaleDateString()}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="dash-col">
          <h3 className="section-title">Needs Attention</h3>
          {needsAttention.length === 0 ? (
            <EmptyState icon={<Check size={22} />} title="All caught up" body="No missing work or pending feedback right now." />
          ) : (
            <div className="dash-list">
              {needsAttention.map((item, i) => (
                <div key={i} className="dash-row attention">
                  <AlertTriangle size={15} className={item.type === "missing" ? "attn-missing" : "attn-feedback"} />
                  <div>
                    <div className="dash-row-title">{item.studentName}</div>
                    <div className="dash-row-sub">
                      {item.type === "missing" ? "Missing: " : "Needs feedback: "}{item.assignmentTitle}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
