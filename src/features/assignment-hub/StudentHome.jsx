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
    const { data: mySubs } = await supabase.from("submissions").select("*").eq("student_id", userId);

    const combined = (assignments || []).map((a) => {
      const cls = rosterRows.find((r) => r.class_id === a.class_id)?.classes;
      const mine = (mySubs || []).find((s) => s.assignment_id === a.id);
      let status = "pending";
      if (mine?.grade) status = "graded";
      else if (mine?.submitted_at) status = "submitted";
      else if (mine?.started_at) status = "in-progress";
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
    <div className="page">
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
