import React, { useState, useEffect, useCallback } from "react";
import { ArrowLeft, GraduationCap, FileText, Users, LogOut } from "lucide-react";
import { supabase } from "../../supabaseClient";
import { PageHeader, EmptyState, CenterSpinner } from "../../components/shared";
import { TicketCard } from "./TicketCard";
import { StatusBadge } from "../../components/shared";

export function StudentClassDetail({ classId, userId, setScreen, showToast }) {
  const [cls, setCls] = useState(null);
  const [items, setItems] = useState(null);
  const [leaving, setLeaving] = useState(false);

  const load = useCallback(async () => {
    const { data: c } = await supabase.from("classes").select("name, profiles(name)").eq("id", classId).single();
    setCls(c || null);

    const { data: assignments } = await supabase.from("assignments").select("*").eq("class_id", classId);
    const { data: mySubs } = await supabase.from("submissions").select("*").eq("student_id", userId);

    const assignmentIds = (assignments || []).map((a) => a.id);
    const { data: qeSections } =
      assignmentIds.length > 0
        ? await supabase.from("exam_sections").select("assignment_id").in("assignment_id", assignmentIds)
        : { data: [] };
    const qeAssignmentIds = new Set((qeSections || []).map((s) => s.assignment_id));

    const { data: myAttempts } =
      qeAssignmentIds.size > 0
        ? await supabase.from("exam_attempts").select("assignment_id").eq("student_id", userId).in("assignment_id", [...qeAssignmentIds])
        : { data: [] };
    const attemptedIds = new Set((myAttempts || []).map((r) => r.assignment_id));

    const { data: myAnswers } =
      qeAssignmentIds.size > 0
        ? await supabase.from("student_answers").select("assignment_id").eq("student_id", userId).in("assignment_id", [...qeAssignmentIds])
        : { data: [] };
    const submittedIds = new Set((myAnswers || []).map((r) => r.assignment_id));

    // Structured Writing keeps its answers in writing_responses: a saved
    // draft means "in progress", a submitted text means "submitted".
    const writingIds = (assignments || []).filter((a) => a.type === "Writing" && qeAssignmentIds.has(a.id)).map((a) => a.id);
    const { data: myWriting } =
      writingIds.length > 0
        ? await supabase.from("writing_responses").select("assignment_id, submitted_at").eq("student_id", userId).in("assignment_id", writingIds)
        : { data: [] };
    for (const w of myWriting || []) {
      if (w.submitted_at) submittedIds.add(w.assignment_id);
      else attemptedIds.add(w.assignment_id);
    }

    // Structured Speaking is consult-only: "Viewed" once opened.
    const speakingIds = (assignments || []).filter((a) => a.type === "Speaking" && qeAssignmentIds.has(a.id)).map((a) => a.id);
    const { data: myViews } =
      speakingIds.length > 0
        ? await supabase.from("speaking_views").select("assignment_id").eq("student_id", userId).in("assignment_id", speakingIds)
        : { data: [] };
    const viewedIds = new Set((myViews || []).map((r) => r.assignment_id));

    const { data: myFeedback } =
      qeAssignmentIds.size > 0
        ? await supabase.from("assignment_feedback").select("assignment_id, released_at").eq("student_id", userId).in("assignment_id", [...qeAssignmentIds])
        : { data: [] };
    const releasedIds = new Set((myFeedback || []).filter((f) => f.released_at).map((f) => f.assignment_id));

    const combined = (assignments || []).map((a) => {
      let status;
      if (qeAssignmentIds.has(a.id) && a.type === "Speaking") {
        status = viewedIds.has(a.id) ? "viewed" : "to-view";
      } else if (qeAssignmentIds.has(a.id)) {
        if (submittedIds.has(a.id)) {
          const released = a.auto_release_score || releasedIds.has(a.id);
          status = released ? "graded" : "submitted";
        } else if (attemptedIds.has(a.id)) status = "in-progress";
        else status = "pending";
      } else {
        const mine = (mySubs || []).find((s) => s.assignment_id === a.id);
        status = "pending";
        if (mine?.grade) status = "graded";
        else if (mine?.submitted_at) status = "submitted";
        else if (mine?.started_at) status = "in-progress";
      }
      return { ...a, dueDate: a.due_date, status };
    });
    combined.sort((a, b) => {
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return new Date(a.dueDate) - new Date(b.dueDate);
    });
    setItems(combined);
  }, [classId, userId]);

  useEffect(() => { load(); }, [load]);

  async function leaveClass() {
    if (!window.confirm(`Leave "${cls.name}"? You'll lose access to its assignments, and you'll need the class code to rejoin.`)) return;
    setLeaving(true);
    const { error } = await supabase.from("roster").delete().eq("class_id", classId).eq("student_id", userId);
    setLeaving(false);
    if (error) {
      showToast?.("Could not leave the class");
      return;
    }
    showToast?.("You left the class");
    setScreen({ name: "student-classes" });
  }

  if (!cls || items === null) return <CenterSpinner />;

  return (
    <div className="page page-wide">
      <button className="back-link" onClick={() => setScreen({ name: "student-classes" })}><ArrowLeft size={14} /> My Classes</button>

      <PageHeader
        eyebrow="Class"
        title={cls.name}
        action={
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div className="class-card-teacher" style={{ marginTop: 0 }}>
              <GraduationCap size={14} /> {cls.profiles?.name || "Unknown teacher"}
            </div>
            <button className="btn-ghost" disabled={leaving} onClick={leaveClass}>
              <LogOut size={13} /> {leaving ? "Leaving…" : "Leave class"}
            </button>
          </div>
        }
      />

      {items.length === 0 ? (
        <EmptyState icon={<FileText size={26} />} title="Nothing posted yet" body="Your teacher hasn't added any assignments to this class yet." />
      ) : (
        <div className="ticket-list">
          {items.map((a) => (
            <TicketCard
              key={a.id}
              assignment={a}
              onClick={() => setScreen({ name: "assignment-student", classId, assignmentId: a.id })}
              statusBadge={<StatusBadge status={a.status} />}
            />
          ))}
        </div>
      )}
    </div>
  );
}
