import React, { useState, useEffect, useCallback } from "react";
import { BookOpen, Users, Plus, Check, Clock, AlertTriangle, LogOut, GraduationCap, FileText, ChevronRight, X, Copy, CheckCircle2, Headphones, PenLine, Mic, ListChecks, ArrowLeft, Loader2, Timer, Highlighter } from "lucide-react";
import { supabase } from "../../supabaseClient";
import { uid, makeCode, TYPES, fmtDate, daysUntil, wordCount, isPdfUrl } from "../../lib/utils";
import { AttachmentPreview, PageHeader, EmptyState, CenterSpinner, Modal, StatusBadge } from "../../components/shared";
import { ReadingPassage } from "./ReadingPassage";

export function AssignmentStudent({ userId, classId, assignmentId, setScreen, showToast }) {
  const [assignment, setAssignment] = useState(null);
  const [mySub, setMySub] = useState(null);
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [remainingSec, setRemainingSec] = useState(null);
  const autoSubmitted = React.useRef(false);

  const isTimed = !!assignment?.time_limit_minutes;
  const alreadySubmitted = !!mySub?.submitted_at;

  const load = useCallback(async () => {
    const { data: a } = await supabase.from("assignments").select("*").eq("id", assignmentId).single();
    setAssignment(a || null);

    let { data: sub } = await supabase.from("submissions").select("*").eq("assignment_id", assignmentId).eq("student_id", userId).maybeSingle();

    // For timed assignments, the clock starts the instant the student opens it —
    // so we create the row (with started_at) right away if it doesn't exist yet.
    if (a?.time_limit_minutes && !sub) {
      const { data: created } = await supabase
        .from("submissions")
        .insert({ assignment_id: assignmentId, student_id: userId, content: "", started_at: new Date().toISOString() })
        .select()
        .single();
      sub = created;
    }

    setMySub(sub || null);
    setContent(sub?.content || "");
    setInitializing(false);
  }, [assignmentId, userId]);

  useEffect(() => { load(); }, [load]);

  // countdown tick
  useEffect(() => {
    if (!isTimed || !mySub?.started_at || alreadySubmitted) return;
    const deadline = new Date(mySub.started_at).getTime() + assignment.time_limit_minutes * 60 * 1000;

    function tick() {
      const secs = Math.max(0, Math.round((deadline - Date.now()) / 1000));
      setRemainingSec(secs);
      return secs;
    }
    const secs = tick();
    if (secs <= 0) return; // handled by the effect below
    const interval = setInterval(() => {
      const s = tick();
      if (s <= 0) clearInterval(interval);
    }, 1000);
    return () => clearInterval(interval);
  }, [isTimed, mySub?.started_at, alreadySubmitted, assignment?.time_limit_minutes]);

  // auto-submit the instant time hits zero
  useEffect(() => {
    if (!isTimed || alreadySubmitted || remainingSec === null || remainingSec > 0 || autoSubmitted.current) return;
    autoSubmitted.current = true;
    (async () => {
      await supabase.from("submissions").update({
        content: content.trim(), submitted_at: new Date().toISOString(),
      }).eq("id", mySub.id);
      showToast("Time's up — your answer was submitted automatically");
      load();
    })();
  }, [remainingSec, isTimed, alreadySubmitted]); // eslint-disable-line react-hooks/exhaustive-deps

  async function submit() {
    if (!content.trim()) return;
    setBusy(true);
    if (isTimed && mySub) {
      const { error } = await supabase.from("submissions").update({
        content: content.trim(), submitted_at: new Date().toISOString(),
      }).eq("id", mySub.id);
      setBusy(false);
      if (error) { showToast("Could not submit"); return; }
    } else {
      const { error } = await supabase.from("submissions").upsert(
        { assignment_id: assignmentId, student_id: userId, content: content.trim(), submitted_at: new Date().toISOString(), grade: null, feedback: null, graded_at: null },
        { onConflict: "assignment_id,student_id" }
      );
      setBusy(false);
      if (error) { showToast("Could not submit"); return; }
    }
    showToast("Submitted");
    load();
  }

  if (!assignment || initializing) return <CenterSpinner />;
  const meta = TYPES[assignment.type] || TYPES.Other;
  const Icon = meta.icon;
  const locked = isTimed && alreadySubmitted;
  const mm = remainingSec !== null ? String(Math.floor(remainingSec / 60)).padStart(2, "0") : null;
  const ss = remainingSec !== null ? String(remainingSec % 60).padStart(2, "0") : null;
  const urgent = remainingSec !== null && remainingSec <= 60;
  const isWriting = assignment.type === "Writing Task 1" || assignment.type === "Writing Task 2";

  const wordCountBadge = (assignment.target_word_count || content.trim()) ? (
    <div className={`word-count ${assignment.target_word_count && wordCount(content) >= assignment.target_word_count ? "met" : ""}`}>
      {wordCount(content)} {assignment.target_word_count ? `/ ${assignment.target_word_count} words` : "words"}
    </div>
  ) : null;

  const submitButton = !locked && (
    <button className="btn-primary" style={{ marginTop: 12 }} disabled={!content.trim() || busy} onClick={submit}>
      {busy ? "Submitting…" : isTimed ? "Submit now" : mySub?.submitted_at ? "Resubmit" : "Submit"}
    </button>
  );

  const submittedMeta = mySub?.submitted_at && (
    <div className="sub-meta" style={{ marginTop: 8 }}>Submitted {new Date(mySub.submitted_at).toLocaleString()}</div>
  );

  // ---- Writing Focus Mode: full-screen overlay layout, Task 1/2 only ----
  // This is a self-contained visual overlay — it does not touch Shell.jsx,
  // so no other screen or component is affected.
  if (isWriting) {
    return (
      <div className="wf-overlay">
        <div className="wf-topbar">
          <button className="back-link" onClick={() => setScreen({ name: "home" })}><ArrowLeft size={14} /> Exit</button>
          <div className="wf-title-group">
            <div className="asg-type">{assignment.type}</div>
            <div className="wf-title">{assignment.title}</div>
          </div>
          {isTimed && !alreadySubmitted ? (
            <div className={`wf-timer ${urgent ? "urgent" : ""}`}><Timer size={15} /> {mm}:{ss}</div>
          ) : <div />}
        </div>

        <div className={`wf-body ${assignment.image_url ? "with-image" : ""}`}>
          {assignment.image_url && (
            <div className="wf-image-panel">
              <AttachmentPreview url={assignment.image_url} />
            </div>
          )}

          <div className="wf-editor-panel">
            {assignment.description && <div className="wf-instructions">{assignment.description}</div>}

            {mySub?.grade && (
              <div className="feedback-panel">
                <div className="feedback-band">Band {mySub.grade}</div>
                {mySub.feedback && <p className="feedback-text">{mySub.feedback}</p>}
              </div>
            )}

            {isTimed && alreadySubmitted && (
              <div className="timer-panel done">
                <Timer size={18} />
                <div className="timer-label">Timed task — submitted, no further changes possible.</div>
              </div>
            )}

            <textarea
              className="wf-textarea"
              placeholder="Write your answer here…"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              disabled={locked}
              lang="en"
              spellCheck="true"
              autoFocus
            />
            <div className="wf-footer">
              {wordCountBadge}
              {submitButton}
            </div>
            {submittedMeta}
          </div>
        </div>
      </div>
    );
  }

  // ---- Original layout, unchanged, for every other assignment type ----
  return (
    <div className="page narrow">
      <button className="back-link" onClick={() => setScreen({ name: "home" })}><ArrowLeft size={14} /> All assignments</button>

      <div className="asg-header">
        <div className="asg-icon" style={{ color: meta.color }}><Icon size={22} /></div>
        <div>
          <div className="asg-type">{assignment.type}</div>
          <h1 className="asg-title">{assignment.title}</h1>
          <div className="asg-due"><Clock size={13} /> Due {fmtDate(assignment.due_date)}</div>
        </div>
      </div>
      <AttachmentPreview url={assignment.image_url} />
      {assignment.description && (
        assignment.type === "Reading"
          ? <ReadingPassage assignmentId={assignmentId} userId={userId} text={assignment.description} />
          : <p className="asg-desc">{assignment.description}</p>
      )}

      {isTimed && !alreadySubmitted && (
        <div className={`timer-panel ${urgent ? "urgent" : ""}`}>
          <Timer size={18} />
          <div>
            <div className="timer-label">Time remaining</div>
            <div className="timer-clock">{mm}:{ss}</div>
          </div>
        </div>
      )}
      {isTimed && alreadySubmitted && (
        <div className="timer-panel done">
          <Timer size={18} />
          <div className="timer-label">Timed task — submitted, no further changes possible.</div>
        </div>
      )}

      {mySub?.grade && (
        <div className="feedback-panel">
          <div className="feedback-band">Band {mySub.grade}</div>
          {mySub.feedback && <p className="feedback-text">{mySub.feedback}</p>}
        </div>
      )}

      <h3 className="section-title">{locked ? "Your submission" : "Write your answer"}</h3>
      <textarea
        className="field-input textarea big"
        placeholder="Write your answer, or paste a link to your file/recording…"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        disabled={locked}
        lang="en"
        spellCheck="true"
      />
      {wordCountBadge}
      {submitButton}
      {submittedMeta}
    </div>
  );
}

// ---------- shared bits ----------
