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

  const load = useCallback(async () => {
    const { data: c } = await supabase.from("classes").select("*").eq("id", classId).single();
    setCls(c || null);
    const { data: r } = await supabase.from("roster").select("id, joined_at, profiles(name)").eq("class_id", classId);
    setRoster((r || []).map((x) => ({ name: x.profiles?.name || "Unknown", joined_at: x.joined_at })));
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

  return (
    <div className="page">
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
        <AssignmentsTab classId={classId} assignments={assignments} onCreated={load} onOpen={(a) => setScreen({ name: "assignment-teacher", classId, assignmentId: a.id })} />
      )}

      {tab === "roster" && (
        roster.length === 0 ? (
          <EmptyState icon={<Users size={26} />} title="No students yet" body={`Share the join code "${cls.code}" with your students.`} />
        ) : (
          <div className="roster-list">
            {roster.map((s, i) => (
              <div key={i} className="roster-row">
                <div className="avatar small">{s.name.slice(0, 1).toUpperCase()}</div>
                <div className="roster-name">{s.name}</div>
                <div className="roster-date">Joined {fmtDate(s.joined_at)}</div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}
