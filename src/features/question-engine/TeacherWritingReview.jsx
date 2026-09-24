
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { ArrowLeft, CheckCircle2, Eye, PenLine, RotateCcw } from "lucide-react";
import { supabase } from "../../supabaseClient";
import { CenterSpinner } from "../../components/shared";
import { WritingEditor } from "./WritingEditor";
import { WritingView } from "./WritingView";
import { taskBandFrom, overallWritingBand } from "./writingHtml";
import { StoredImg } from "../../lib/storageFiles";

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

export function TeacherWritingReview({ assignmentId, studentId, studentName, onBack, showToast }) {
  const [loading, setLoading] = useState(true);
  const [assignment, setAssignment] = useState(null);
  const [sections, setSections] = useState([]); // [{ id, title, taskNumber, prompt, imageUrl }]
  const [responses, setResponses] = useState({}); // sectionId -> { html, words, submittedAt }
  const [corrected, setCorrected] = useState({}); // sectionId -> html
  const [scores, setScores] = useState({}); // sectionId -> { ta, cc, lr, gra }
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

  const load = useCallback(async () => {
    setLoading(true);
    const { data: a } = await supabase.from("assignments").select("*").eq("id", assignmentId).single();
    setAssignment(a || null);

    const { data: rows } = await supabase
      .from("exam_sections")
      .select("id, title, passage_text, image_url, task_number, order_index")
      .eq("assignment_id", assignmentId)
      .order("order_index");
    const built = (rows || [])
      .filter((s) => s.task_number)
      .map((s) => ({ id: s.id, title: s.title, taskNumber: s.task_number, prompt: s.passage_text || "", imageUrl: s.image_url || "" }));
    setSections(built);

    const { data: wr } = await supabase
      .from("writing_responses")
      .select("section_id, content_html, word_count, submitted_at")
      .eq("assignment_id", assignmentId)
      .eq("student_id", studentId);
    const resp = {};
    (wr || []).forEach((r) => { resp[r.section_id] = { html: r.content_html || "", words: r.word_count || 0, submittedAt: r.submitted_at }; });
    setResponses(resp);

    const { data: grades } = await supabase
      .from("writing_grades")
      .select("section_id, corrected_html, score_ta, score_cc, score_lr, score_gra")
      .eq("assignment_id", assignmentId)
      .eq("student_id", studentId);
    const corr = {};
    const sc = {};
    for (const s of built) {
      const g = (grades || []).find((x) => x.section_id === s.id);
      corr[s.id] = g ? g.corrected_html : resp[s.id]?.html || "";
      sc[s.id] = g ? { ta: toStr(g.score_ta), cc: toStr(g.score_cc), lr: toStr(g.score_lr), gra: toStr(g.score_gra) } : { ...EMPTY_SCORES };
    }
    setCorrected(corr);
    setScores(sc);

    const { data: fb } = await supabase
      .from("assignment_feedback")
      .select("band, feedback, released_at")
      .eq("assignment_id", assignmentId)
      .eq("student_id", studentId)
      .maybeSingle();
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

  function confirmLeave() {
    if (!dirty || window.confirm("You have unsaved changes. Leave without saving?")) onBack();
  }

  function resetToOriginal(sectionId) {
    if (!window.confirm("Replace your corrected copy of this task with the student's original text? Your marks and edits on this task will be lost.")) return;
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
        <button className="back-link" onClick={onBack}><ArrowLeft size={14} /> Back to submissions</button>
        <p className="empty-inline">No writing found for this student.</p>
      </div>
    );
  }

  const active = sections[Math.min(activeIndex, sections.length - 1)];
  const resp = responses[active.id];
  const sc = scores[active.id] || EMPTY_SCORES;
  const activeBand = bandsBySection[active.id];

  return (
    <div className="grade-overlay qe-wrv">
      <div className="grade-topbar">
        <button className="back-link" onClick={confirmLeave}><ArrowLeft size={14} /> Back to submissions</button>
        <div className="grade-title">{studentName} — {assignment.title}</div>
        <span className={`qe-wrv-status ${releasedAt ? "published" : ""}`}>
          {releasedAt ? <><CheckCircle2 size={13} /> Published</> : "Not published yet"}
        </span>
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
              <div className="qe-wrv-editor">
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
            {resp?.submittedAt ? `Submitted ${new Date(resp.submittedAt).toLocaleString()} · ` : ""}{resp?.words || 0} words (original)
          </div>
        </div>

        <div className="grade-panel grade-panel-form">
          <div className="field-label">Writing Task {active.taskNumber} — criteria (optional)</div>
          {CRITERIA.map((c) => (
            <div key={c.key} className="criteria-row">
              <span className="criteria-label">{c.label(active.taskNumber)}</span>
              <input
                type="number"
                min="0"
                max="9"
                step="0.5"
                className={`field-input criteria-input ${isValidScore(sc[c.key]) ? "" : "qe-wrv-invalid"}`}
                placeholder="—"
                value={sc[c.key]}
                onChange={(e) => setScore(active.id, c.key, e.target.value)}
              />
            </div>
          ))}
          <div className="criteria-avg">
            Task {active.taskNumber} band: <strong>{activeBand != null ? activeBand : "—"}</strong>
            {activeBand == null && <span className="qe-wrv-small"> (fill the 4 criteria)</span>}
          </div>

          <div className="qe-wrv-overall">
            <label className="field-label" style={{ margin: 0 }}>Overall Writing band (optional)</label>
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

          <label className="field-label" style={{ marginTop: 16 }}>Feedback for the student</label>
          <textarea
            className="field-input textarea"
            style={{ minHeight: 180 }}
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
        </div>
      </div>
    </div>
  );
}
