
import React, { useState, useEffect, useCallback } from "react";
import { ArrowLeft, Eye, PenLine, MessageSquare } from "lucide-react";
import { supabase } from "../../supabaseClient";
import { CenterSpinner } from "../../components/shared";
import { WritingView } from "./WritingView";
import { sanitizeWritingHtml } from "./writingHtml";

// Structured Writing — what the student sees once the teacher publishes:
// overall band + general feedback, then per task the teacher's corrected
// copy (red marks; click one to read the teacher's note), the student's
// own original, and the 4 criteria. The database only returns the
// corrections after publication (RLS), so nothing leaks before that.

const CRITERIA = [
  { key: "score_ta", label: (n) => (n === 1 ? "Task Achievement" : "Task Response") },
  { key: "score_cc", label: () => "Coherence & Cohesion" },
  { key: "score_lr", label: () => "Lexical Resource" },
  { key: "score_gra", label: () => "Grammatical Range & Accuracy" },
];

const fmt = (v) => (v === null || v === undefined ? "—" : String(Number(v)));

export function StudentWritingFeedback({ assignmentId, userId, setScreen }) {
  const [loading, setLoading] = useState(true);
  const [assignment, setAssignment] = useState(null);
  const [sections, setSections] = useState([]);
  const [responses, setResponses] = useState({});
  const [grades, setGrades] = useState({});
  const [feedback, setFeedback] = useState(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [view, setView] = useState("corrected");
  const [openNote, setOpenNote] = useState(null); // { text, note }

  const load = useCallback(async () => {
    const { data: a } = await supabase.from("assignments").select("id, title, type").eq("id", assignmentId).single();
    setAssignment(a || null);

    const { data: rows } = await supabase
      .from("exam_sections")
      .select("id, title, passage_text, image_url, task_number, order_index")
      .eq("assignment_id", assignmentId)
      .order("order_index");
    setSections(
      (rows || [])
        .filter((s) => s.task_number)
        .map((s) => ({ id: s.id, taskNumber: s.task_number, prompt: s.passage_text || "", imageUrl: s.image_url || "" }))
    );

    const { data: wr } = await supabase
      .from("writing_responses")
      .select("section_id, content_html, word_count")
      .eq("assignment_id", assignmentId)
      .eq("student_id", userId);
    const r = {};
    (wr || []).forEach((x) => { r[x.section_id] = x; });
    setResponses(r);

    const { data: wg } = await supabase
      .from("writing_grades")
      .select("section_id, corrected_html, score_ta, score_cc, score_lr, score_gra, task_band")
      .eq("assignment_id", assignmentId)
      .eq("student_id", userId);
    const g = {};
    (wg || []).forEach((x) => { g[x.section_id] = x; });
    setGrades(g);

    const { data: fb } = await supabase
      .from("assignment_feedback")
      .select("band, feedback, released_at")
      .eq("assignment_id", assignmentId)
      .eq("student_id", userId)
      .maybeSingle();
    setFeedback(fb || null);
    setLoading(false);
  }, [assignmentId, userId]);

  useEffect(() => { load(); }, [load]);

  if (loading || !assignment) return <CenterSpinner />;

  const active = sections[Math.min(activeIndex, Math.max(0, sections.length - 1))];
  const resp = active ? responses[active.id] : null;
  const grade = active ? grades[active.id] : null;
  const hasScores = grade && CRITERIA.some((c) => grade[c.key] !== null && grade[c.key] !== undefined);
  const markCount = grade ? (sanitizeWritingHtml(grade.corrected_html, { allowMarks: true }).match(/<mark[\s>]/g) || []).length : 0;

  return (
    <div className="page page-wide qe-wrf">
      <button className="back-link" onClick={() => setScreen({ name: "home" })}><ArrowLeft size={14} /> Back to assignments</button>
      <div className="eyebrow">Writing — feedback</div>
      <h1 className="page-title">{assignment.title}</h1>

      <div className="qe-wrf-summary">
        <div className="qe-wrf-band">
          <div className="qe-wrf-band-label">Overall band</div>
          <div className="qe-wrf-band-value">{feedback?.band || "—"}</div>
        </div>
        <div className="qe-wrf-comment">
          <div className="qe-wrf-band-label"><MessageSquare size={13} /> Teacher's feedback</div>
          <p>{feedback?.feedback || "No general comment."}</p>
        </div>
      </div>

      {sections.length > 1 && (
        <div className="qe-wrv-tabs qe-wrf-tabs">
          {sections.map((s, i) => (
            <button key={s.id} className={`qe-wrv-tab ${i === activeIndex ? "active" : ""}`} onClick={() => { setActiveIndex(i); setView("corrected"); setOpenNote(null); }}>
              Writing Task {s.taskNumber}
              <span className="qe-wrv-tab-meta">{grades[s.id]?.task_band != null ? `Band ${fmt(grades[s.id].task_band)}` : `${responses[s.id]?.word_count || 0} words`}</span>
            </button>
          ))}
        </div>
      )}

      {active && (
        <div className="qe-wrf-body">
          <div className="qe-wrf-text">
            <details className="qe-wrv-question">
              <summary>Question — Writing Task {active.taskNumber}</summary>
              {active.prompt && <div className="qe-wr-prompt">{active.prompt}</div>}
              {active.imageUrl && <img className="qe-wrv-question-img" src={active.imageUrl} alt={`Writing Task ${active.taskNumber}`} />}
            </details>

            <div className="qe-wrv-viewbar">
              <div className="qe-wrv-toggle" role="tablist">
                <button className={view === "corrected" ? "active" : ""} onClick={() => setView("corrected")}><PenLine size={13} /> Teacher's correction</button>
                <button className={view === "original" ? "active" : ""} onClick={() => { setView("original"); setOpenNote(null); }}><Eye size={13} /> My original</button>
              </div>
              {view === "corrected" && grade && (
                <span className="qe-wrf-markcount">{markCount === 0 ? "No errors marked" : `${markCount} error${markCount > 1 ? "s" : ""} marked — click one to read the note`}</span>
              )}
            </div>

            <div className="qe-wrv-original">
              {view === "corrected" && grade ? (
                <WritingView html={grade.corrected_html} allowMarks onMarkClick={(m) => setOpenNote(m)} emptyText="You left this task empty." />
              ) : (
                <WritingView html={resp?.content_html} emptyText="You left this task empty." />
              )}
            </div>
            {view === "corrected" && !grade && <p className="field-hint">Your teacher didn't add corrections to this task.</p>}
            <div className="sub-meta" style={{ marginTop: 8 }}>{resp?.word_count || 0} words</div>
          </div>

          <div className="qe-wrf-side">
            {openNote && (
              <div className="qe-wrf-note">
                <div className="qe-wrf-note-quote">“{openNote.text}”</div>
                <p>{openNote.note || "Marked as an error (no note)."}</p>
                <button className="qe-wrv-link" onClick={() => setOpenNote(null)}>Close</button>
              </div>
            )}

            <div className="feedback-panel">
              <div className="field-label">Writing Task {active.taskNumber}</div>
              {hasScores ? (
                <>
                  {CRITERIA.map((c) => (
                    <div key={c.key} className="criteria-row">
                      <span className="criteria-label">{c.label(active.taskNumber)}</span>
                      <strong>{fmt(grade[c.key])}</strong>
                    </div>
                  ))}
                  <div className="criteria-avg">Task band: <strong>{fmt(grade.task_band)}</strong></div>
                </>
              ) : (
                <p className="field-hint" style={{ margin: 0 }}>No scores for this task.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
