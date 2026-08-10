import React, { useState, useEffect, useCallback } from "react";
import { BookOpen, Users, Plus, Check, Clock, AlertTriangle, LogOut, GraduationCap, FileText, ChevronRight, X, Copy, CheckCircle2, Headphones, PenLine, Mic, ListChecks, ArrowLeft, Loader2, Timer, Highlighter } from "lucide-react";
import { supabase } from "../../supabaseClient";
import { uid, makeCode, TYPES, fmtDate, daysUntil, wordCount, isPdfUrl } from "../../lib/utils";
import { AttachmentPreview, PageHeader, EmptyState, CenterSpinner, Modal, StatusBadge } from "../../components/shared";

export function AssignmentTeacher({ classId, assignmentId, setScreen, showToast }) {
  const [assignment, setAssignment] = useState(null);
  const [roster, setRoster] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [active, setActive] = useState(null);
  const [gradeDraft, setGradeDraft] = useState("");
  const [feedbackDraft, setFeedbackDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data: a } = await supabase.from("assignments").select("*").eq("id", assignmentId).single();
    setAssignment(a || null);
    const { data: r } = await supabase.from("roster").select("student_id, profiles(name)").eq("class_id", classId);
    setRoster((r || []).map((x) => ({ id: x.student_id, name: x.profiles?.name || "Unknown" })));
    const { data: s } = await supabase.from("submissions").select("*").eq("assignment_id", assignmentId);
    setSubmissions(s || []);
  }, [classId, assignmentId]);

  useEffect(() => { load(); }, [load]);

  function openGrade(student) {
    const sub = submissions.find((s) => s.student_id === student.id);
    setActive(student);
    setGradeDraft(sub?.grade || "");
    setFeedbackDraft(sub?.feedback || "");
  }

  async function saveGrade() {
    setBusy(true);
    const sub = submissions.find((s) => s.student_id === active.id);
    if (sub) {
      await supabase.from("submissions").update({
        grade: gradeDraft.trim(), feedback: feedbackDraft.trim(), graded_at: new Date().toISOString(),
      }).eq("id", sub.id);
    }
    setBusy(false);
    setActive(null);
    showToast("Feedback saved");
    load();
  }

  if (!assignment) return <CenterSpinner />;
  const meta = TYPES[assignment.type] || TYPES.Other;
  const Icon = meta.icon;

  return (
    <div className="page">
      <button className="back-link" onClick={() => setScreen({ name: "class", classId })}><ArrowLeft size={14} /> Back to class</button>

      <div className="asg-header">
        <div className="asg-icon" style={{ color: meta.color }}><Icon size={22} /></div>
        <div>
          <div className="asg-type">{assignment.type}</div>
          <h1 className="asg-title">{assignment.title}</h1>
          <div className="asg-due"><Clock size={13} /> Due {fmtDate(assignment.due_date)}</div>
        </div>
      </div>
      <AttachmentPreview url={assignment.image_url} />
      {assignment.description && <p className="asg-desc">{assignment.description}</p>}

      <h3 className="section-title">Submissions</h3>
      {roster.length === 0 ? (
        <EmptyState icon={<Users size={24} />} title="No students in this class yet" />
      ) : (
        <div className="sub-list">
          {roster.map((s) => {
            const sub = submissions.find((x) => x.student_id === s.id);
            let status = "pending";
            if (sub?.grade) status = "graded";
            else if (sub?.submitted_at) status = "submitted";
            else if (sub?.started_at) status = "in-progress";
            return (
              <div key={s.id} className="sub-row" onClick={() => openGrade(s)}>
                <div className="avatar small">{s.name.slice(0, 1).toUpperCase()}</div>
                <div className="sub-name">{s.name}</div>
                <StatusBadge status={status} />
                <ChevronRight size={15} className="chev" />
              </div>
            );
          })}
        </div>
      )}

      {active && (
        <Modal onClose={() => setActive(null)} title={active.name} wide>
          {(() => {
            const sub = submissions.find((s) => s.student_id === active.id);
            if (sub?.submitted_at) {
              return (
                <>
                  <div className="field-label">Submitted answer</div>
                  <div className="spellcheck-hint"><Highlighter size={12} /> Misspelled words appear underlined in red.</div>
                  <textarea readOnly className="submission-box" value={sub.content} lang="en" spellCheck="true" />
                  <div className="sub-meta">
                    Submitted {new Date(sub.submitted_at).toLocaleString()}
                    {assignment.target_word_count ? ` · ${wordCount(sub.content)} / ${assignment.target_word_count} words` : ` · ${wordCount(sub.content)} words`}
                  </div>
                </>
              );
            }
            if (sub?.started_at) {
              return <div className="empty-inline">This student has opened the timed task but hasn't submitted yet — check back once the clock runs out.</div>;
            }
            return <div className="empty-inline">No submission yet from this student.</div>;
          })()}

          <label className="field-label" style={{ marginTop: 16 }}>Band / grade</label>
          <input className="field-input" placeholder="e.g. 6.5" value={gradeDraft} onChange={(e) => setGradeDraft(e.target.value)} />

          <label className="field-label" style={{ marginTop: 14 }}>Feedback</label>
          <textarea className="field-input textarea" placeholder="Comments for the student…" value={feedbackDraft} onChange={(e) => setFeedbackDraft(e.target.value)} />

          <button className="btn-primary" style={{ marginTop: 16 }} disabled={busy || !submissions.find((s) => s.student_id === active.id && s.submitted_at)} onClick={saveGrade}>
            {busy ? "Saving…" : "Save feedback"}
          </button>
        </Modal>
      )}
    </div>
  );
}
