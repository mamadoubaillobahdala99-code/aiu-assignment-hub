import React, { useState, useEffect, useCallback } from "react";
import { BookOpen, Users, Plus, Check, Clock, AlertTriangle, LogOut, GraduationCap, FileText, ChevronRight, X, Copy, CheckCircle2, Headphones, PenLine, Mic, ListChecks, ArrowLeft, Loader2, Timer, Highlighter, Trash2 } from "lucide-react";
import { supabase } from "../../supabaseClient";
import { uid, makeCode, TYPES, fmtDate, fmtDueDateTime, daysUntil, wordCount, isPdfUrl } from "../../lib/utils";
import { AttachmentPreview, PageHeader, EmptyState, CenterSpinner, StatusBadge } from "../../components/shared";

const CRITERIA = [
  { key: "score_task_achievement", label: "Task Achievement" },
  { key: "score_coherence_cohesion", label: "Coherence & Cohesion" },
  { key: "score_lexical_resource", label: "Lexical Resource" },
  { key: "score_grammar_accuracy", label: "Grammatical Range & Accuracy" },
];

function averageScore(vals) {
  const nums = vals.filter((v) => v !== "" && v !== null && !isNaN(v)).map(Number);
  if (nums.length !== 4) return null;
  const avg = nums.reduce((a, b) => a + b, 0) / 4;
  return Math.round(avg * 2) / 2; // rounded to nearest 0.5, IELTS-style
}

export function AssignmentTeacher({ classId, assignmentId, setScreen, showToast }) {
  const [assignment, setAssignment] = useState(null);
  const [roster, setRoster] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [active, setActive] = useState(null);
  const [gradeDraft, setGradeDraft] = useState("");
  const [criteriaDraft, setCriteriaDraft] = useState({});
  const [feedbackDraft, setFeedbackDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    const { data: a } = await supabase.from("assignments").select("*").eq("id", assignmentId).single();
    setAssignment(a || null);
    const { data: r } = await supabase.from("roster").select("student_id, profiles(name)").eq("class_id", classId);
    setRoster((r || []).map((x) => ({ id: x.student_id, name: x.profiles?.name || "Unknown" })));
    const { data: s } = await supabase.from("submissions").select("*").eq("assignment_id", assignmentId);
    setSubmissions(s || []);
  }, [classId, assignmentId]);

  useEffect(() => { load(); }, [load]);

  const isWritingType = assignment?.type === "Writing Task 1" || assignment?.type === "Writing Task 2";

  function openGrade(student) {
    const sub = submissions.find((s) => s.student_id === student.id);
    setActive(student);
    setGradeDraft(sub?.grade || "");
    setFeedbackDraft(sub?.feedback || "");
    setCriteriaDraft({
      score_task_achievement: sub?.score_task_achievement ?? "",
      score_coherence_cohesion: sub?.score_coherence_cohesion ?? "",
      score_lexical_resource: sub?.score_lexical_resource ?? "",
      score_grammar_accuracy: sub?.score_grammar_accuracy ?? "",
    });
  }

  async function handleDelete() {
    setDeleting(true);
    const { count } = await supabase
      .from("submissions")
      .select("id", { count: "exact", head: true })
      .eq("assignment_id", assignmentId)
      .not("submitted_at", "is", null);

    if (count && count > 0) {
      setDeleting(false);
      showToast(`Cannot delete: ${count} student${count > 1 ? "s have" : " has"} already submitted.`);
      return;
    }

    if (!window.confirm("Delete this assignment? This cannot be undone.")) {
      setDeleting(false);
      return;
    }

    const { error } = await supabase.from("assignments").delete().eq("id", assignmentId);
    setDeleting(false);
    if (error) {
      showToast("Could not delete assignment");
      return;
    }
    showToast("Assignment deleted");
    setScreen({ name: "class", classId });
  }

  async function saveGrade() {
    setBusy(true);
    const sub = submissions.find((s) => s.student_id === active.id);
    if (sub) {
      const payload = { feedback: feedbackDraft.trim(), graded_at: new Date().toISOString() };
      if (isWritingType) {
        const avg = averageScore(Object.values(criteriaDraft));
        payload.score_task_achievement = criteriaDraft.score_task_achievement === "" ? null : Number(criteriaDraft.score_task_achievement);
        payload.score_coherence_cohesion = criteriaDraft.score_coherence_cohesion === "" ? null : Number(criteriaDraft.score_coherence_cohesion);
        payload.score_lexical_resource = criteriaDraft.score_lexical_resource === "" ? null : Number(criteriaDraft.score_lexical_resource);
        payload.score_grammar_accuracy = criteriaDraft.score_grammar_accuracy === "" ? null : Number(criteriaDraft.score_grammar_accuracy);
        payload.grade = avg !== null ? String(avg) : gradeDraft.trim();
      } else {
        payload.grade = gradeDraft.trim();
      }
      await supabase.from("submissions").update(payload).eq("id", sub.id);
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
      <div className="row-right" style={{ justifyContent: "space-between", marginBottom: 4 }}>
        <button className="back-link" onClick={() => setScreen({ name: "class", classId })}><ArrowLeft size={14} /> Back to class</button>
        <button className="btn-ghost delete-assignment-btn" disabled={deleting} onClick={handleDelete}>
          <Trash2 size={13} /> {deleting ? "Checking…" : "Delete assignment"}
        </button>
      </div>

      <div className="asg-header">
        <div className="asg-icon" style={{ color: meta.color }}><Icon size={22} /></div>
        <div>
          <div className="asg-type">{assignment.type}</div>
          <h1 className="asg-title">{assignment.title}</h1>
          <div className="asg-due"><Clock size={13} /> Due {fmtDueDateTime(assignment.due_date, assignment.due_time)}</div>
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

      {active && (() => {
        const sub = submissions.find((s) => s.student_id === active.id);
        const canSave = !!(sub && sub.submitted_at);
        return (
          <div className="grade-overlay">
            <div className="grade-topbar">
              <button className="back-link" onClick={() => setActive(null)}><ArrowLeft size={14} /> Back to submissions</button>
              <div className="grade-title">{active.name}</div>
              <div />
            </div>

            <div className="grade-body">
              <div className="grade-panel grade-panel-submission">
                <div className="field-label">Submitted answer</div>
                {sub?.submitted_at ? (
                  <>
                    <div className="spellcheck-hint"><Highlighter size={12} /> Misspelled words appear underlined in red.</div>
                    <textarea readOnly className="submission-box" value={sub.content} lang="en" spellCheck="true" />
                    <div className="sub-meta">
                      Submitted {new Date(sub.submitted_at).toLocaleString()}
                      {assignment.target_word_count ? ` · ${wordCount(sub.content)} / ${assignment.target_word_count} words` : ` · ${wordCount(sub.content)} words`}
                    </div>
                  </>
                ) : sub?.started_at ? (
                  <div className="empty-inline">This student has opened the timed task but hasn't submitted yet — check back once the clock runs out.</div>
                ) : (
                  <div className="empty-inline">No submission yet from this student.</div>
                )}
              </div>

              <div className="grade-panel grade-panel-form">
                {isWritingType ? (
                  <>
                    <div className="field-label">IELTS Writing criteria</div>
                    {CRITERIA.map((c) => (
                      <div key={c.key} className="criteria-row">
                        <span className="criteria-label">{c.label}</span>
                        <input
                          type="number" min="0" max="9" step="0.5"
                          className="field-input criteria-input"
                          placeholder="—"
                          value={criteriaDraft[c.key] ?? ""}
                          onChange={(e) => setCriteriaDraft((d) => ({ ...d, [c.key]: e.target.value }))}
                        />
                      </div>
                    ))}
                    {averageScore(Object.values(criteriaDraft)) !== null && (
                      <div className="criteria-avg">Overall band (auto): <strong>{averageScore(Object.values(criteriaDraft))}</strong></div>
                    )}
                  </>
                ) : (
                  <>
                    <label className="field-label">Band / grade</label>
                    <input className="field-input" placeholder="e.g. 6.5" value={gradeDraft} onChange={(e) => setGradeDraft(e.target.value)} />
                  </>
                )}

                <label className="field-label" style={{ marginTop: 14 }}>Feedback</label>
                <textarea className="field-input textarea" style={{ minHeight: 260 }} placeholder="Comments for the student…" value={feedbackDraft} onChange={(e) => setFeedbackDraft(e.target.value)} />

                <button className="btn-primary" style={{ marginTop: 16 }} disabled={busy || !canSave} onClick={saveGrade}>
                  {busy ? "Saving…" : "Save feedback"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
