
import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { ArrowLeft, CheckCircle2, Eye, PenLine, RotateCcw, ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "../../supabaseClient";
import { CenterSpinner } from "../../components/shared";
import { WritingEditor } from "./WritingEditor";
import { WritingView } from "./WritingView";
import { taskBandFrom, overallWritingBand } from "./writingHtml";
import { StoredImg } from "../../lib/storageFiles";
import { confirmDialog } from "../../lib/confirmDialog";
import { Breadcrumb } from "../../components/DropMenu";
import { listMarks, NotesList, fmtWhen } from "./ResultParts";

// Livraison 74 — the criteria are chosen by clicking a band (5 → 9; lower
// bands in the small list beside them; a second click clears), the notes of the red
// marks are listed beside the text, and « ‹ Previous / Next › » /
// « Next copy to mark » go from copy to copy (each asks first when
// something is not saved). Saving, publishing and the rules are unchanged.
const CHIPS = ["5", "5.5", "6", "6.5", "7", "7.5", "8", "8.5", "9"];
const LOWER = ["0", "0.5", "1", "1.5", "2", "2.5", "3", "3.5", "4", "4.5"];
function BandPicker({ value, onChange, label }) {
  const v = value === "" || value === null || value === undefined ? "" : String(Number(value));
  const lower = v !== "" && Number(v) < 5;
  return (
    <div className="rs-pick" role="group" aria-label={label}>
      {CHIPS.map((c) => (
        <button key={c} type="button" className={`rs-chip ${v === c ? "on" : ""}`} aria-pressed={v === c} onClick={() => onChange(v === c ? "" : c)}>{c}</button>
      ))}
      <select className={`rs-chip rs-lower ${lower ? "on" : ""}`} aria-label={`${label}: a band under 5`} value={lower ? v : ""} onChange={(e) => onChange(e.target.value)}>
        <option value="">&lt;5</option>
        {LOWER.map((x) => <option key={x} value={x}>{x}</option>)}
      </select>
    </div>
  );
}

// Structured Writing — teacher correction screen (one student).
// The teacher works on a CORRECTED COPY of each task: it starts as an
// exact copy of the student's text, can be edited with B / I / U, and
// gets red "error" marks with optional notes. The student's original
// (writing_responses) is never modified — there is no write rule on it.
// Scores are optional: 4 IELTS criteria per task → task band (average,
// rounded to .5) → overall band (T1 + 2×T2) / 3, editable by the teacher.
// "Save draft" keeps everything hidden; "Publish" makes it visible, and
// later saves are visible to the student immediately.

const CRITERIA = [
  { key: "ta", label: (n) => (n === 1 ? "Task Achievement" : "Task Response") },
  { key: "cc", label: () => "Coherence & Cohesion" },
  { key: "lr", label: () => "Lexical Resource" },
  { key: "gra", label: () => "Grammatical Range & Accuracy" },
];
const EMPTY_SCORES = { ta: "", cc: "", lr: "", gra: "" };

function isValidScore(v) {
  if (v === "" || v === null || v === undefined) return true;
  const n = Number(v);
  return !isNaN(n) && n >= 0 && n <= 9 && Math.round(n * 2) === n * 2;
}
const toNum = (v) => (v === "" || v === null || v === undefined ? null : Number(v));
const toStr = (v) => (v === null || v === undefined ? "" : String(Number(v)));

export function TeacherWritingReview({ assignmentId, studentId, studentName, onBack, showToast, crumbs, nav, onDirtyChange, handedAt }) {
  const [loading, setLoading] = useState(true);
  const [assignment, setAssignment] = useState(null);
  const [sections, setSections] = useState([]); // [{ id, title, taskNumber, prompt, imageUrl }]
  const [responses, setResponses] = useState({}); // sectionId -> { html, words, submittedAt }
  const [corrected, setCorrected] = useState({}); // sectionId -> html
  const [scores, setScores] = useState({}); // sectionId -> { ta, cc, lr, gra }
  const [taskFeedback, setTaskFeedback] = useState({}); // sectionId -> text (livraison 89)
  const [overallDraft, setOverallDraft] = useState("");
  const [overallTouched, setOverallTouched] = useState(false);
  const [feedbackDraft, setFeedbackDraft] = useState("");
  const [releasedAt, setReleasedAt] = useState(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [view, setView] = useState("corrected"); // corrected | original
  const [editorVersion, setEditorVersion] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const editorBoxRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    // Livraison 81: the five reads are asked at the same time (before: one
    // after the other). Same reads, same rights.
    const [{ data: a }, { data: rows }, { data: wr }, { data: grades }, { data: fb }] = await Promise.all([
      supabase.from("assignments").select("*").eq("id", assignmentId).single(),
      supabase
        .from("exam_sections")
        .select("id, title, passage_text, image_url, task_number, order_index")
        .eq("assignment_id", assignmentId)
        .order("order_index"),
      supabase
        .from("writing_responses")
        .select("section_id, content_html, word_count, submitted_at")
        .eq("assignment_id", assignmentId)
        .eq("student_id", studentId),
      supabase
        .from("writing_grades")
        .select("section_id, corrected_html, score_ta, score_cc, score_lr, score_gra, task_feedback")
        .eq("assignment_id", assignmentId)
        .eq("student_id", studentId),
      supabase
        .from("assignment_feedback")
        .select("band, feedback, released_at")
        .eq("assignment_id", assignmentId)
        .eq("student_id", studentId)
        .maybeSingle(),
    ]);
    setAssignment(a || null);
    const built = (rows || [])
      .filter((s) => s.task_number)
      .map((s) => ({ id: s.id, title: s.title, taskNumber: s.task_number, prompt: s.passage_text || "", imageUrl: s.image_url || "" }));
    setSections(built);
    const resp = {};
    (wr || []).forEach((r) => { resp[r.section_id] = { html: r.content_html || "", words: r.word_count || 0, submittedAt: r.submitted_at }; });
    setResponses(resp);
    const corr = {};
    const sc = {};
    const tf = {};
    for (const s of built) {
      const g = (grades || []).find((x) => x.section_id === s.id);
      corr[s.id] = g ? g.corrected_html : resp[s.id]?.html || "";
      sc[s.id] = g ? { ta: toStr(g.score_ta), cc: toStr(g.score_cc), lr: toStr(g.score_lr), gra: toStr(g.score_gra) } : { ...EMPTY_SCORES };
      tf[s.id] = g?.task_feedback || "";
    }
    setCorrected(corr);
    setScores(sc);
    setTaskFeedback(tf);
    setFeedbackDraft(fb?.feedback || "");
    setReleasedAt(fb?.released_at || null);
    // A saved overall band that simply equals the automatic one keeps
    // following the criteria; a different one is the teacher's override.
    const b1 = built.find((x) => x.taskNumber === 1);
    const b2 = built.find((x) => x.taskNumber === 2);
    const autoLoaded = overallWritingBand(
      b1 ? taskBandFrom(sc[b1.id]) : null,
      b2 ? taskBandFrom(sc[b2.id]) : null,
      Boolean(b1),
      Boolean(b2)
    );
    const overridden = Boolean(fb?.band) && Number(fb.band) !== autoLoaded;
    setOverallDraft(overridden ? fb.band : "");
    setOverallTouched(overridden);

    setEditorVersion((v) => v + 1);
    setDirty(false);
    setLoading(false);
  }, [assignmentId, studentId]);

  useEffect(() => { load(); }, [load]);

  const bandsBySection = useMemo(() => {
    const m = {};
    for (const s of sections) m[s.id] = taskBandFrom(scores[s.id] || EMPTY_SCORES);
    return m;
  }, [sections, scores]);

  const t1 = sections.find((s) => s.taskNumber === 1);
  const t2 = sections.find((s) => s.taskNumber === 2);
  const autoOverall = overallWritingBand(t1 ? bandsBySection[t1.id] : null, t2 ? bandsBySection[t2.id] : null, Boolean(t1), Boolean(t2));
  const overallShown = overallTouched ? overallDraft : autoOverall != null ? String(autoOverall) : "";

  const scoreErrors = sections.some((s) => Object.values(scores[s.id] || {}).some((v) => !isValidScore(v))) || !isValidScore(overallShown);

  function setScore(sectionId, key, value) {
    setScores((prev) => ({ ...prev, [sectionId]: { ...(prev[sectionId] || EMPTY_SCORES), [key]: value } }));
    setDirty(true);
    setError("");
  }

  useEffect(() => { onDirtyChange?.(dirty); }, [dirty]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => onDirtyChange?.(false), []); // eslint-disable-line react-hooks/exhaustive-deps

  // Every way out of this copy asks first when something is not saved.
  function guarded(fn) {
    return async () => {
      if (dirty && !(await confirmDialog({ title: "Leave without saving?", message: "You have unsaved changes. Leave without saving?", confirmLabel: "Leave without saving", danger: true }))) return;
      onDirtyChange?.(false);
      fn();
    };
  }
  const confirmLeave = guarded(onBack);

  async function resetToOriginal(sectionId) {
    if (!(await confirmDialog({ title: "Go back to the original text?", message: "Replace your corrected copy of this task with the student's original text? Your marks and edits on this task will be lost.", confirmLabel: "Replace my corrections", danger: true }))) return;
    setCorrected((prev) => ({ ...prev, [sectionId]: responses[sectionId]?.html || "" }));
    setEditorVersion((v) => v + 1);
    setDirty(true);
  }

  async function save(publish) {
    setError("");
    if (scoreErrors) {
      setError("Scores must be between 0 and 9, in steps of 0.5 (e.g. 6 or 6.5).");
      return;
    }
    setSaving(true);

    for (const s of sections) {
      if (!responses[s.id]) continue; // nothing submitted for this task
      const sc = scores[s.id] || EMPTY_SCORES;
      const { error: gErr } = await supabase.from("writing_grades").upsert(
        {
          assignment_id: assignmentId,
          section_id: s.id,
          student_id: studentId,
          corrected_html: corrected[s.id] || "",
          score_ta: toNum(sc.ta),
          score_cc: toNum(sc.cc),
          score_lr: toNum(sc.lr),
          score_gra: toNum(sc.gra),
          task_band: bandsBySection[s.id],
          task_feedback: (taskFeedback[s.id] || "").trim() || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "section_id,student_id" }
      );
      if (gErr) {
        setSaving(false);
        setError(`Could not save Task ${s.taskNumber}: ` + gErr.message);
        return;
      }
    }

    const payload = {
      assignment_id: assignmentId,
      student_id: studentId,
      band: overallShown.trim() ? String(Number(overallShown)) : null,
      feedback: feedbackDraft.trim() || null,
    };
    if (publish && !releasedAt) payload.released_at = new Date().toISOString();
    const { data: fb, error: fErr } = await supabase
      .from("assignment_feedback")
      .upsert(payload, { onConflict: "assignment_id,student_id" })
      .select("released_at")
      .single();

    setSaving(false);
    if (fErr) {
      setError("Could not save the feedback: " + fErr.message);
      return;
    }
    setReleasedAt(fb?.released_at || releasedAt);
    setDirty(false);
    showToast?.(publish && !releasedAt ? "Published to the student" : releasedAt ? "Saved — the student sees the update" : "Draft saved (not visible to the student)");
  }

  if (loading || !assignment) return <CenterSpinner />;

  if (sections.length === 0 || Object.keys(responses).length === 0) {
    return (
      <div className="page">
        <button className="back-link" onClick={onBack}><ArrowLeft size={14} /> Back to the list of students</button>
        <p className="empty-inline">No writing found for this student.</p>
      </div>
    );
  }

  const active = sections[Math.min(activeIndex, sections.length - 1)];
  const resp = responses[active.id];
  const sc = scores[active.id] || EMPTY_SCORES;
  const activeBand = bandsBySection[active.id];
  const marks = listMarks(corrected[active.id] || "");
  const totalWords = sections.reduce((n, s) => n + (responses[s.id]?.words || 0), 0);

  return (
    <div className="grade-overlay qe-wrv rs-wrv">
      <div className="rs-wrv-top">
        {crumbs && <Breadcrumb items={crumbs.map((c) => (c.onClick ? { ...c, onClick: guarded(c.onClick) } : c))} />}
        <div className="ph">
          <div className="ph-main">
            <div>
              <div className="eyebrow">Writing{handedAt ? ` · handed in ${fmtWhen(handedAt)}` : ""}</div>
              <h1 className="ph-title">{studentName}</h1>
              <div className="ph-meta">
                <span className={`pill ${releasedAt ? "pill-teal" : "pill-amber"}`}>
                  {releasedAt ? <><CheckCircle2 size={13} /> Published</> : "To mark — not published yet"}
                </span>
                {sections.map((s) => <span key={s.id} className="pill">Task {s.taskNumber} · {responses[s.id]?.words || 0} words</span>)}
              </div>
            </div>
          </div>
          {nav && (
            <div className="ph-actions rs-nav">
              <span className="rs-nav-label">{nav.label}</span>
              <button className="btn-ghost" disabled={!nav.prev} onClick={nav.prev ? guarded(nav.prev) : undefined}><ChevronLeft size={15} /> Previous</button>
              <button className="btn-ghost" disabled={!nav.next} onClick={nav.next ? guarded(nav.next) : undefined}>Next <ChevronRight size={15} /></button>
              {nav.nextToMark && <button className="btn-teal" onClick={guarded(nav.nextToMark)}>Next copy to mark <ChevronRight size={15} /></button>}
            </div>
          )}
        </div>
      </div>

      {sections.length > 1 && (
        <div className="qe-wrv-tabs">
          {sections.map((s, i) => (
            <button key={s.id} className={`qe-wrv-tab ${i === activeIndex ? "active" : ""}`} onClick={() => { setActiveIndex(i); setView("corrected"); }}>
              Writing Task {s.taskNumber}
              <span className="qe-wrv-tab-meta">{responses[s.id]?.words || 0} words{bandsBySection[s.id] != null ? ` · Band ${bandsBySection[s.id]}` : ""}</span>
            </button>
          ))}
        </div>
      )}

      <div className="grade-body">
        <div className="grade-panel grade-panel-submission">
          <details className="qe-wrv-question">
            <summary>Question — Writing Task {active.taskNumber}</summary>
            {active.prompt && <div className="qe-wr-prompt">{active.prompt}</div>}
            {active.imageUrl && <StoredImg className="qe-wrv-question-img" src={active.imageUrl} alt={`Writing Task ${active.taskNumber}`} />}
          </details>

          <div className="qe-wrv-viewbar">
            <div className="qe-wrv-toggle" role="tablist">
              <button className={view === "corrected" ? "active" : ""} onClick={() => setView("corrected")}><PenLine size={13} /> Corrected copy</button>
              <button className={view === "original" ? "active" : ""} onClick={() => setView("original")}><Eye size={13} /> Original</button>
            </div>
            {view === "corrected" && (
              <button className="btn-ghost qe-wrv-reset" onClick={() => resetToOriginal(active.id)}><RotateCcw size={13} /> Start again from original</button>
            )}
          </div>

          {view === "corrected" ? (
            <>
              <div className="qe-wrv-editor" ref={editorBoxRef}>
                <WritingEditor
                  key={`${active.id}-${editorVersion}`}
                  initialHtml={corrected[active.id] || ""}
                  allowMarks
                  allowPaste
                  spellCheck
                  placeholder="The student left this task empty."
                  onHint={(msg) => showToast?.(msg)}
                  onChange={(html) => {
                    setCorrected((prev) => ({ ...prev, [active.id]: html }));
                    setDirty(true);
                  }}
                />
              </div>
              <p className="qe-wrv-hint">
                Select words and click <strong>Mark error</strong> to highlight them in red and add a note. Click a red mark to edit or remove it.
                The student's original text is never changed.
              </p>
            </>
          ) : (
            <div className="qe-wrv-original">
              <WritingView html={resp?.html} emptyText="The student left this task empty." />
            </div>
          )}

          <div className="sub-meta" style={{ marginTop: 8 }}>
            {resp?.submittedAt ? `Submitted ${new Date(resp.submittedAt).toLocaleString()} · ` : ""}{resp?.words || 0} words (original) · {totalWords} words in all
          </div>
        </div>

        <div className="grade-panel grade-panel-form rs-wrv-form">
          <div className="panel">
            <div className="panel-h"><h2>Task {active.taskNumber} — criteria</h2><span className="panel-note">optional · click again to clear</span></div>
            {CRITERIA.map((c) => (
              <div key={c.key} className="rs-crit-row">
                <div className="rs-crit-h"><span>{c.label(active.taskNumber)}</span><b>{sc[c.key] === "" ? "—" : sc[c.key]}</b></div>
                <BandPicker label={c.label(active.taskNumber)} value={sc[c.key]} onChange={(v) => setScore(active.id, c.key, v)} />
              </div>
            ))}
            <div className="criteria-avg">
              Task {active.taskNumber} band: <strong>{activeBand != null ? activeBand : "—"}</strong>
              {activeBand == null && <span className="qe-wrv-small"> (choose the 4 criteria)</span>}
            </div>
          </div>

          <div className="panel">
            <label className="field-label" style={{ marginTop: 0 }}>Overall Writing band</label>
            <input
              type="number"
              min="0"
              max="9"
              step="0.5"
              className={`field-input qe-wrv-overall-input ${isValidScore(overallShown) ? "" : "qe-wrv-invalid"}`}
              placeholder="—"
              value={overallShown}
              onChange={(e) => { setOverallTouched(true); setOverallDraft(e.target.value); setDirty(true); }}
            />
            <p className="field-hint" style={{ margin: "4px 0 0" }}>
              {t1 && t2 ? "Auto: (Task 1 + 2 × Task 2) ÷ 3, rounded to .5" : "Auto: the task band"}
              {autoOverall != null ? ` = ${autoOverall}` : ""}.
              {overallTouched && (
                <> <button type="button" className="qe-wrv-link" onClick={() => { setOverallTouched(false); setOverallDraft(""); setDirty(true); }}>Use auto</button></>
              )}
            </p>
          </div>

          <div className="panel">
            <label className="field-label" style={{ marginTop: 0 }} htmlFor="rs-task-feedback">Feedback on Task {active.taskNumber}</label>
            <textarea
              id="rs-task-feedback"
              className="field-input textarea rs-task-feedback"
              style={{ minHeight: 110 }}
              maxLength={5000}
              placeholder={`What went well and what to improve in Task ${active.taskNumber}…`}
              value={taskFeedback[active.id] || ""}
              onChange={(e) => { const v = e.target.value; setTaskFeedback((prev) => ({ ...prev, [active.id]: v })); setDirty(true); }}
            />
            {sections.length > 1 && <p className="field-hint" style={{ margin: "4px 0 0" }}>Shown to the student with Task {active.taskNumber} only.</p>}
          </div>

          {view === "corrected" && (
            <div className="panel">
              <div className="panel-h"><h2>Errors marked</h2><span className="panel-note">{marks.length}</span></div>
              <NotesList marks={marks} containerRef={editorBoxRef} empty="No error marked in this task yet." />
            </div>
          )}

          <div className="panel">
            <label className="field-label" style={{ marginTop: 0 }}>{sections.length > 1 ? "General feedback (both tasks)" : "General feedback"}</label>
            <textarea
              className="field-input textarea"
              style={{ minHeight: 140 }}
              placeholder="General comments…"
              value={feedbackDraft}
              onChange={(e) => { setFeedbackDraft(e.target.value); setDirty(true); }}
            />

            {error && <div className="field-error" style={{ marginTop: 12 }}>{error}</div>}

            <div className="qe-wrv-actions">
              {releasedAt ? (
                <button className="btn-primary" disabled={saving} onClick={() => save(false)}>
                  {saving ? "Saving…" : "Save changes"}
                </button>
              ) : (
                <>
                  <button className="btn-ghost" disabled={saving} onClick={() => save(false)}>{saving ? "Saving…" : "Save draft"}</button>
                  <button className="btn-primary" disabled={saving} onClick={() => save(true)}>{saving ? "Saving…" : "Publish to student"}</button>
                </>
              )}
            </div>
            <p className="field-hint" style={{ marginTop: 6 }}>
              {releasedAt
                ? "Already published — every saved change is visible to the student right away."
                : "Draft: the student sees nothing until you publish."}
              {dirty ? " You have unsaved changes." : ""}
            </p>
            {releasedAt && !dirty && nav?.nextToMark && (
              <button className="panel-link rs-next" onClick={guarded(nav.nextToMark)}>Next copy to mark{nav.nextToMarkName ? ` (${nav.nextToMarkName})` : ""} <ChevronRight size={14} /></button>
            )}
          </div>

          <button className="back-link" onClick={confirmLeave}><ArrowLeft size={14} /> Back to the list of students</button>
        </div>
      </div>
    </div>
  );
}
