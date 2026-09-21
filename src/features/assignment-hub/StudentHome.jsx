import React, { useState, useEffect, useCallback } from "react";
import { BookOpen, Users, Plus, Check, Clock, AlertTriangle, LogOut, GraduationCap, FileText, ChevronRight, X, Copy, CheckCircle2, Headphones, PenLine, Mic, ListChecks, ArrowLeft, Loader2, Timer, Highlighter } from "lucide-react";
import { supabase } from "../../supabaseClient";
import { uid, makeCode, TYPES, fmtDate, daysUntil, wordCount, isPdfUrl } from "../../lib/utils";
import { AttachmentPreview, PageHeader, EmptyState, CenterSpinner, Modal, StatusBadge } from "../../components/shared";
import { TicketCard } from "./TicketCard";

export function StudentHome({ userId, setScreen, showToast }) {
  const [items, setItems] = useState(null);
  const [classCount, setClassCount] = useState(0);

  const load = useCallback(async () => {
    const { data: rosterRows } = await supabase.from("roster").select("class_id, classes(id, name)").eq("student_id", userId);
    const classIds = (rosterRows || []).map((r) => r.class_id);
    setClassCount(classIds.length);
    if (classIds.length === 0) { setItems([]); return; }

    const { data: assignments } = await supabase.from("assignments").select("*").in("class_id", classIds);

    // Question Engine assignments (Reading/Listening built with the new
    // structured builder) never write to `submissions` — they use
    // exam_sections + exam_attempts + student_answers instead. Figure
    // out which assignments are which so each gets the right status.
    const assignmentIds = (assignments || []).map((a) => a.id);
    const { data: qeSections } =
      assignmentIds.length > 0
        ? await supabase.from("exam_sections").select("assignment_id").in("assignment_id", assignmentIds)
        : { data: [] };
    const qeAssignmentIds = new Set((qeSections || []).map((s) => s.assignment_id));

    // "Started" and "submitted" both come from the attempt row, which is
    // the authoritative record (submit_student_answers stamps
    // submitted_at). We no longer ask student_answers: a student can only
    // read those once the teacher has published the results, so using
    // them here would show a submitted exam as still to be done. It is
    // also one network call less.
    const { data: myAttempts } =
      qeAssignmentIds.size > 0
        ? await supabase.from("exam_attempts").select("assignment_id, submitted_at").eq("student_id", userId).in("assignment_id", [...qeAssignmentIds])
        : { data: [] };
    const attemptedIds = new Set((myAttempts || []).map((r) => r.assignment_id));
    const submittedIds = new Set((myAttempts || []).filter((r) => r.submitted_at).map((r) => r.assignment_id));

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
      const cls = rosterRows.find((r) => r.class_id === a.class_id)?.classes;
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
        // An assignment with no Part yet — a builder that was interrupted
        // before it could write its content. Nothing has been handed in,
        // so it is simply "to do"; the student sees an explanatory screen
        // if they open it.
        status = "pending";
      }
      return { ...a, dueDate: a.due_date, className: cls?.name || "Class", status };
    });
    combined.sort((a, b) => {
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return new Date(a.dueDate) - new Date(b.dueDate);
    });
    setItems(combined);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  if (items === null) return <CenterSpinner />;

  return (
    <div className="page page-wide">
      <PageHeader eyebrow="Student" title="My assignments" />
      {classCount === 0 ? (
        <EmptyState icon={<Users size={26} />} title="You haven't joined a class yet" body="Get a join code from your teacher, then join from the sidebar." />
      ) : items.length === 0 ? (
        <EmptyState icon={<FileText size={26} />} title="Nothing posted yet" body="Your teacher hasn't added any assignments to your class(es) yet." />
      ) : (
        <div className="ticket-list">
          {items.map((a) => (
            <TicketCard key={a.id} assignment={a} onClick={() => setScreen({ name: "assignment-student", classId: a.class_id, assignmentId: a.id })} statusBadge={<StatusBadge status={a.status} />} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- Student: assignment detail (submit) ----------
// ---------- Reading passage with click-to-highlight ----------
