import React, { useState, useEffect, useCallback, useMemo } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, CheckCircle2 } from "lucide-react";
import { supabase } from "../../supabaseClient";
import { CenterSpinner } from "../../components/shared";
import { ScoreRing } from "./ScoreRing";
import { ReviewContent } from "./ReviewContent";
import { formatAnswerValue, formatCorrectShort } from "./answerFormat";
import { numberQuestions } from "./bulkParse";
import { loadPaperTree, toReviewSections } from "./paperTree";
import { computeIeltsBand } from "./bandConversion";
import { Breadcrumb } from "../../components/DropMenu";
import { confirmDialog } from "../../lib/confirmDialog";
import { buildSheet, sheetCounts, AnswerSheet, fmtWhen } from "./ResultParts";

// Livraison 74 — one Reading / Listening copy, for the teacher: the
// answer sheet (or the whole paper) on the left; on the right, always in
// view, the score, the band, the comment and « Publish ». « ‹ Previous /
// Next › » go through the handed-in copies without going back to the list.
// crumbs / nav / onDirtyChange come from the assignment page.
export function TeacherQuestionEngineReview({ assignmentId, studentId, studentName, onBack, showToast, crumbs, nav, onDirtyChange, handedAt }) {
  const [loading, setLoading] = useState(true);
  const [assignment, setAssignment] = useState(null);
  const [sections, setSections] = useState([]);
  const [answersByQ, setAnswersByQ] = useState({});
  const [resultsByQ, setResultsByQ] = useState({});
  const [correctByQ, setCorrectByQ] = useState({});
  const [feedbackRow, setFeedbackRow] = useState(null);
  const [bandDraft, setBandDraft] = useState("");
  const [feedbackDraft, setFeedbackDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState("sheet");

  // Livraison 81: everything at once — the whole paper with its correct
  // answers (get_paper, the teacher's own rights), this student's answers
  // and the feedback row, in parallel. Before: one request per part and
  // per group, one after the other.
  const load = useCallback(async () => {
    setLoading(true);
    const [paper, { data: sa }, { data: fb }] = await Promise.all([
      loadPaperTree(assignmentId, { withKeys: true }),
      supabase
        .from("student_answers")
        .select("question_id, response, is_correct, points_earned")
        .eq("assignment_id", assignmentId)
        .eq("student_id", studentId),
      supabase
        .from("assignment_feedback")
        .select("*")
        .eq("assignment_id", assignmentId)
        .eq("student_id", studentId)
        .maybeSingle(),
    ]);
    const ok = paper.status === "ok";
    setAssignment(ok ? paper.assignment : null);
    const built = ok ? toReviewSections(paper.sections, numberQuestions) : [];
    setSections(built);

    // Only the answers to this paper's questions (as before).
    const inPaper = new Set(built.flatMap((s) => s.groups.flatMap((g) => g.questions.map((q) => q.id))));
    const answers = {};
    const results = {};
    (sa || []).forEach((row) => {
      if (!inPaper.has(row.question_id)) return;
      answers[row.question_id] = row.response;
      results[row.question_id] = { isCorrect: row.is_correct, earned: row.points_earned ?? (row.is_correct ? 1 : 0) };
    });
    setAnswersByQ(answers);
    setResultsByQ(results);
    const correct = {};
    if (ok) for (const [qid, k] of Object.entries(paper.answerKeys || {})) if (inPaper.has(qid)) correct[qid] = k;
    setCorrectByQ(correct);

    setFeedbackRow(fb || null);
    setBandDraft(fb?.band || "");
    setFeedbackDraft(fb?.feedback || "");
    setLoading(false);
  }, [assignmentId, studentId]);

  useEffect(() => { load(); }, [load]);

  const allQuestions = useMemo(() => sections.flatMap((s) => s.groups.flatMap((g) => g.questions)), [sections]);
  const totalPoints = useMemo(() => allQuestions.reduce((sum, q) => sum + (q.points || 1), 0), [allQuestions]);
  const earnedPoints = useMemo(
    () => allQuestions.reduce((sum, q) => sum + (resultsByQ[q.id]?.earned ?? 0), 0),
    [allQuestions, resultsByQ]
  );
  const skill = assignment?.type === "Listening" ? "listening" : "reading";
  const autoBand = computeIeltsBand(earnedPoints, totalPoints, skill, assignment?.reading_test_type);
  const displayBand = feedbackRow?.band || (autoBand != null ? autoBand : null);

  const correctAnswersFormatted = useMemo(() => {
    const map = {};
    for (const q of allQuestions) {
      if (correctByQ[q.id] !== undefined) map[q.id] = formatAnswerValue(q, correctByQ[q.id]);
    }
    return map;
  }, [allQuestions, correctByQ]);
  // Livraison 90: on the answer sheet, the letter only.
  const correctShort = useMemo(() => {
    const map = {};
    for (const q of allQuestions) {
      if (correctByQ[q.id] !== undefined) map[q.id] = formatCorrectShort(q, correctByQ[q.id]);
    }
    return map;
  }, [allQuestions, correctByQ]);

  async function saveFeedback(release) {
    setSaving(true);
    const payload = {
      assignment_id: assignmentId,
      student_id: studentId,
      band: bandDraft.trim() || null,
      feedback: feedbackDraft.trim() || null,
    };
    if (release) payload.released_at = new Date().toISOString();

    const { data, error } = await supabase
      .from("assignment_feedback")
      .upsert(payload, { onConflict: "assignment_id,student_id" })
      .select()
      .single();

    setSaving(false);
    if (error) {
      showToast?.("Could not save: " + error.message);
      return;
    }
    setFeedbackRow(data);
    showToast?.(release ? "Score published to student" : "Feedback saved");
  }


  const dirty = !loading && (String(bandDraft ?? "").trim() !== String(feedbackRow?.band ?? "").trim() || String(feedbackDraft ?? "").trim() !== String(feedbackRow?.feedback ?? "").trim());
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => onDirtyChange?.(false), []); // eslint-disable-line react-hooks/exhaustive-deps

  // Every way out of this copy asks first when the band or the comment
  // has not been saved.
  function guarded(fn) {
    return async () => {
      if (dirty && !(await confirmDialog({ title: "Leave without saving?", message: "The band or the comment for this copy is not saved. Leave without saving?", confirmLabel: "Leave without saving", danger: true }))) return;
      onDirtyChange?.(false);
      fn();
    };
  }

  if (loading || !assignment) return <CenterSpinner />;

  const needsManualRelease = !assignment.auto_release_score && !feedbackRow?.released_at;
  const published = Boolean(assignment.auto_release_score || feedbackRow?.released_at);
  const rows = buildSheet(sections);
  const counts = sheetCounts(rows, resultsByQ);

  return (
    <div className="page page-wide rs-page">
      {crumbs && <Breadcrumb items={crumbs.map((c) => (c.onClick ? { ...c, onClick: guarded(c.onClick) } : c))} />}

      <div className="ph">
        <div className="ph-main">
          <div>
            <div className="eyebrow">{assignment.type}{handedAt ? ` · handed in ${fmtWhen(handedAt)}` : ""}</div>
            <h1 className="ph-title">{studentName}</h1>
            <div className="ph-meta">
              {published
                ? <span className="pill pill-teal"><CheckCircle2 size={13} /> {assignment.auto_release_score ? "Score shown automatically" : "Published"}</span>
                : <span className="pill pill-amber">Not published yet</span>}
              <span className="pill">{assignment.title}</span>
            </div>
          </div>
        </div>
        {nav && (
          <div className="ph-actions rs-nav">
            <span className="rs-nav-label">{nav.label}</span>
            <button className="btn-ghost" disabled={!nav.prev} onClick={nav.prev ? guarded(nav.prev) : undefined}><ChevronLeft size={15} /> Previous</button>
            <button className="btn-ghost" disabled={!nav.next} onClick={nav.next ? guarded(nav.next) : undefined}>Next copy <ChevronRight size={15} /></button>
          </div>
        )}
      </div>

      <div className="rs-two rs-two-score-first">
        <div className="rs-main">
          <div className="rs-viewbar">
            <div className="rs-seg" role="tablist">
              <button type="button" role="tab" aria-selected={view === "sheet"} className={view === "sheet" ? "on" : ""} onClick={() => setView("sheet")}>Answer sheet</button>
              <button type="button" role="tab" aria-selected={view === "paper"} className={view === "paper" ? "on" : ""} onClick={() => setView("paper")}>Full paper</button>
            </div>
          </div>
          {view === "sheet" ? (
            <AnswerSheet rows={rows} answersByQ={answersByQ} resultsByQ={resultsByQ} correctFormatted={correctShort} showCorrect />
          ) : (
            <ReviewContent
              sections={sections}
              answersByQ={answersByQ}
              resultsByQ={resultsByQ}
              correctAnswersFormatted={correctAnswersFormatted}
              correctAnswersRaw={correctByQ}
              showCorrectAnswers
              assignmentId={assignmentId}
              viewerUserId={studentId}
            />
          )}
        </div>

        <div className="rs-side">
          <div className="panel rs-mark-panel">
            <div className="rs-ring"><ScoreRing score={earnedPoints} total={totalPoints} band={displayBand} size={120} /></div>
            {autoBand != null && !feedbackRow?.band && <p className="rs-hint rs-center">Estimated band (scaled to 40 questions)</p>}
            <div className="rs-counts"><span className="rs-ok">{counts.right} correct</span><span className="rs-ko">{counts.wrong + counts.partial} wrong</span></div>

            <label className="field-label" style={{ marginTop: 14 }}>Band (optional — replaces the estimate)</label>
            <input className="field-input" placeholder={autoBand != null ? String(autoBand) : "—"} value={bandDraft} onChange={(e) => setBandDraft(e.target.value)} />

            <label className="field-label" style={{ marginTop: 12 }}>Feedback for the student</label>
            <textarea className="field-input textarea" style={{ minHeight: 110 }} placeholder="Comments for the student…" value={feedbackDraft} onChange={(e) => setFeedbackDraft(e.target.value)} />

            <div className="rs-actions">
              <button className="btn-ghost" disabled={saving} onClick={() => saveFeedback(false)}>{saving ? "Saving…" : "Save"}</button>
              {needsManualRelease && (
                <button className="btn-primary" disabled={saving} onClick={() => saveFeedback(true)}>{saving ? "Publishing…" : "Publish to student"}</button>
              )}
            </div>
            <p className="rs-hint">
              {feedbackRow?.released_at ? `Published ${fmtWhen(feedbackRow.released_at)}. ` : needsManualRelease ? "The student sees nothing until you publish. " : "The student already sees the score. "}
              {dirty ? "You have unsaved changes." : ""}
            </p>
            {nav?.next && (
              <button className="panel-link rs-next" onClick={guarded(nav.next)}>Next copy <ChevronRight size={14} /></button>
            )}
          </div>
        </div>
      </div>

      <div className="rs-foot">
        <button className="back-link" onClick={guarded(onBack)}><ArrowLeft size={14} /> Back to the list of students</button>
      </div>
    </div>
  );
}
