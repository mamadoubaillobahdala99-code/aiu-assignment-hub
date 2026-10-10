
import React, { useState, useEffect, useCallback, useRef } from "react";
import { ArrowLeft, Eye, PenLine, MessageSquare } from "lucide-react";
import { supabase } from "../../supabaseClient";
import { CenterSpinner, LoadFailed } from "../../components/shared";
import { WritingView } from "./WritingView";
import { sanitizeWritingHtml } from "./writingHtml";
import { StoredImg } from "../../lib/storageFiles";
import { Breadcrumb } from "../../components/DropMenu";
import { listMarks, NotesList, fmtWhen } from "./ResultParts";

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

// Livraison 74 — same content, new layout: the overall band, each task's
// band and the publication date at the top, the teacher's comment, then
// per task the corrected copy (or the original) with, beside it, the
// criteria as bars and the list of the teacher's notes (a click shows
// where the note is in the text).
// inExam: the paper belongs to an exam — "Back" returns to the exam.
export function StudentWritingFeedback({ assignmentId, userId, setScreen, inExam = false }) {
  const [loading, setLoading] = useState(true);
  const [assignment, setAssignment] = useState(null);
  const [sections, setSections] = useState([]);
  const [responses, setResponses] = useState({});
  const [grades, setGrades] = useState({});
  const [feedback, setFeedback] = useState(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [view, setView] = useState("corrected");
  const [openNote, setOpenNote] = useState(null); // { text, note }
  const textRef = useRef(null);
  // Livraison 95c: a failed read is never shown as « 0 words » / « You left
  // this task empty » (or an endless spinner).
  const [loadFailed, setLoadFailed] = useState("");   // "" | "error" | "gone"
  const loadIdRef = useRef(0);

  // Livraison 81: the five reads are asked at the same time (before: one
  // after the other). Same reads, same rights.
  const load = useCallback(async () => {
    const myId = ++loadIdRef.current;
    setLoadFailed("");
    const got = await Promise.all([
      supabase.from("assignments").select("id, title, type").eq("id", assignmentId).maybeSingle(),
      supabase
        .from("exam_sections")
        .select("id, title, passage_text, image_url, task_number, order_index")
        .eq("assignment_id", assignmentId)
        .order("order_index"),
      supabase
        .from("writing_responses")
        .select("section_id, content_html, word_count")
        .eq("assignment_id", assignmentId)
        .eq("student_id", userId),
      supabase
        .from("writing_grades")
        .select("section_id, corrected_html, score_ta, score_cc, score_lr, score_gra, task_band, task_feedback")
        .eq("assignment_id", assignmentId)
        .eq("student_id", userId),
      supabase
        .from("assignment_feedback")
        .select("band, feedback, released_at")
        .eq("assignment_id", assignmentId)
        .eq("student_id", userId)
        .maybeSingle(),
    ]).catch(() => null);
    if (myId !== loadIdRef.current) return;
    if (!got || got.some((x) => x.error) || !got[0].data) {
      setLoadFailed(got && !got.some((x) => x.error) ? "gone" : "error");
      setLoading(false);
      return;
    }
    const [{ data: a }, { data: rows }, { data: wr }, { data: wg }, { data: fb }] = got;
    setAssignment(a || null);
    setSections(
      (rows || [])
        .filter((s) => s.task_number)
        .map((s) => ({ id: s.id, taskNumber: s.task_number, prompt: s.passage_text || "", imageUrl: s.image_url || "" }))
    );
    const r = {};
    (wr || []).forEach((x) => { r[x.section_id] = x; });
    setResponses(r);
    const g = {};
    (wg || []).forEach((x) => { g[x.section_id] = x; });
    setGrades(g);
    setFeedback(fb || null);
    setLoading(false);
  }, [assignmentId, userId]);

  useEffect(() => { load(); return () => { loadIdRef.current++; }; }, [load]);

  if (loadFailed) {
    return (
      <div className="page">
        <button className="back-link" onClick={() => setScreen(inExam ? { name: "home" } : { name: "student-assignments" })}><ArrowLeft size={14} /> {inExam ? "Back to the exam" : "Back to my assignments"}</button>
        {loadFailed === "gone"
          ? <p className="empty-inline">This result is not available.</p>
          : <LoadFailed what="your result" onRetry={() => { setLoading(true); load(); }} />}
      </div>
    );
  }
  if (loading || !assignment) return <CenterSpinner />;

  const active = sections[Math.min(activeIndex, Math.max(0, sections.length - 1))];
  const resp = active ? responses[active.id] : null;
  const grade = active ? grades[active.id] : null;
  const hasScores = grade && CRITERIA.some((c) => grade[c.key] !== null && grade[c.key] !== undefined);
  const markCount = grade ? (sanitizeWritingHtml(grade.corrected_html, { allowMarks: true }).match(/<mark[\s>]/g) || []).length : 0;

  const back = () => setScreen(inExam ? { name: "home" } : { name: "student-assignments" });
  const marks = view === "corrected" && grade ? listMarks(grade.corrected_html) : [];
  const pct = (v) => (v === null || v === undefined ? 0 : Math.max(0, Math.min(100, (Number(v) / 9) * 100)));

  return (
    <div className="page page-wide rs-page qe-wrf">
      <Breadcrumb items={[{ label: inExam ? "Exam" : "My assignments", onClick: back }, { label: assignment.title }]} />

      <div className="rs-hero">
        <div className="rs-band-box">
          <div className="eyebrow">Overall band</div>
          <div className="rs-big">{feedback?.band || "—"}</div>
        </div>
        <div className="rs-hero-main">
          <div className="eyebrow">Writing · your result</div>
          <h1 className="rs-title">{assignment.title}</h1>
          <div className="rs-task-bands">
            {sections.map((s) => (
              <div key={s.id} className="rs-task-band">
                <span>Writing Task {s.taskNumber}</span>
                <b>{grades[s.id]?.task_band != null ? fmt(grades[s.id].task_band) : "—"}</b>
              </div>
            ))}
          </div>
          {feedback?.released_at && <div className="rs-hero-meta">Published {fmtWhen(feedback.released_at)}</div>}
        </div>
      </div>

      <div className="rs-teacher-note">
        <div className="rs-teacher-note-h"><MessageSquare size={14} /> {sections.length > 1 ? "General feedback from your teacher" : "Feedback from your teacher"}</div>
        <p>{feedback?.feedback || "No general comment."}</p>
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
        <div className="rs-two">
          <div className="rs-main">
            {/* Livraison 89: the teacher's comment on THIS task. */}
            {grade?.task_feedback && (
              <div className="rs-teacher-note rs-task-note">
                <div className="rs-teacher-note-h"><MessageSquare size={14} /> Your teacher on Task {active.taskNumber}</div>
                <p>{grade.task_feedback}</p>
              </div>
            )}
            <details className="qe-wrv-question">
              <summary>Question — Writing Task {active.taskNumber}</summary>
              {active.prompt && <div className="qe-wr-prompt">{active.prompt}</div>}
              {active.imageUrl && <StoredImg className="qe-wrv-question-img" src={active.imageUrl} alt={`Writing Task ${active.taskNumber}`} />}
            </details>

            <div className="rs-viewbar">
              <div className="rs-seg" role="tablist">
                <button type="button" role="tab" aria-selected={view === "corrected"} className={view === "corrected" ? "on" : ""} onClick={() => setView("corrected")}><PenLine size={13} /> Corrected copy</button>
                <button type="button" role="tab" aria-selected={view === "original"} className={view === "original" ? "on" : ""} onClick={() => { setView("original"); setOpenNote(null); }}><Eye size={13} /> My original</button>
              </div>
              {view === "corrected" && grade && (
                <span className="rs-hint">{markCount === 0 ? "No errors marked" : `${markCount} error${markCount > 1 ? "s" : ""} marked — click one to read the note`}</span>
              )}
            </div>

            <div className="qe-wrv-original" ref={textRef}>
              {view === "corrected" && grade ? (
                <WritingView html={grade.corrected_html} allowMarks onMarkClick={(m) => setOpenNote(m)} emptyText="You left this task empty." />
              ) : (
                <WritingView html={resp?.content_html} emptyText="You left this task empty." />
              )}
            </div>
            {view === "corrected" && !grade && <p className="field-hint">Your teacher didn't add corrections to this task.</p>}
            <div className="sub-meta" style={{ marginTop: 8 }}>{resp?.word_count || 0} words</div>
          </div>

          <div className="rs-side">
            {openNote && (
              <div className="qe-wrf-note">
                <div className="qe-wrf-note-quote">“{openNote.text}”</div>
                <p>{openNote.note || "Marked as an error (no note)."}</p>
                <button className="qe-wrv-link" onClick={() => setOpenNote(null)}>Close</button>
              </div>
            )}
            <div className="panel">
              <div className="panel-h"><h2>Task {active.taskNumber} — criteria</h2>{grade?.task_band != null && <span className="pill pill-teal">Band {fmt(grade.task_band)}</span>}</div>
              {hasScores ? CRITERIA.map((c) => (
                <div key={c.key} className="rs-crit">
                  <div className="rs-crit-h"><span>{c.label(active.taskNumber)}</span><b>{fmt(grade[c.key])}</b></div>
                  <div className="rs-crit-bar"><i style={{ width: `${pct(grade[c.key])}%` }} /></div>
                </div>
              )) : <p className="empty-inline" style={{ margin: 0 }}>No scores for this task.</p>}
            </div>
            {view === "corrected" && grade && (
              <div className="panel">
                <div className="panel-h"><h2>Notes from your teacher</h2><span className="panel-note">{marks.length}</span></div>
                <NotesList marks={marks} containerRef={textRef} empty="No error marked in this task." />
              </div>
            )}
          </div>
        </div>
      )}

      <div className="rs-foot">
        <button className="back-link" onClick={back}><ArrowLeft size={14} /> {inExam ? "Back to the exam" : "Back to my assignments"}</button>
      </div>
    </div>
  );
}
