import React, { useState, useEffect, useCallback } from "react";
import { BookOpen, Users, Plus, Check, Clock, AlertTriangle, LogOut, GraduationCap, FileText, ChevronRight, X, Copy, CheckCircle2, Headphones, PenLine, Mic, ListChecks, ArrowLeft, Loader2, Timer, Highlighter } from "lucide-react";
import { supabase } from "../../supabaseClient";
import { uid, makeCode, TYPES, fmtDate, fmtDueDateTime, daysUntil, wordCount, isPdfUrl, isAudioUrl } from "../../lib/utils";
import { AttachmentPreview, PageHeader, EmptyState, CenterSpinner, Modal, StatusBadge } from "../../components/shared";
import { ReadingPassage } from "./ReadingPassage";

function parseReadingAnswers(text, count) {
  const arr = new Array(count).fill("");
  if (!text) return arr;
  text.split("\n").forEach((line) => {
    const m = line.match(/^(\d+)\.\s?(.*)$/);
    if (m) {
      const idx = parseInt(m[1], 10) - 1;
      if (idx >= 0 && idx < count) arr[idx] = m[2] || "";
    }
  });
  return arr;
}
function buildReadingContent(arr) {
  return arr.map((a, i) => `${i + 1}. ${a || ""}`).join("\n");
}

export function AssignmentStudent({ userId, classId, assignmentId, setScreen, showToast }) {
  const [assignment, setAssignment] = useState(null);
  const [mySub, setMySub] = useState(null);
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [remainingSec, setRemainingSec] = useState(null);
  const [imgZoom, setImgZoom] = useState(1);
  const [saveState, setSaveState] = useState("idle"); // idle | saving | saved
  const [recording, setRecording] = useState(false);
  const [readingAnswers, setReadingAnswers] = useState([]);
  const [recordSec, setRecordSec] = useState(0);
  const [recordedBlob, setRecordedBlob] = useState(null);
  const [recordedUrl, setRecordedUrl] = useState(null);
  const [micError, setMicError] = useState("");
  const mediaRecorderRef = React.useRef(null);
  const chunksRef = React.useRef([]);
  const recordTimerRef = React.useRef(null);
  const autoSubmitted = React.useRef(false);
  const lastSavedRef = React.useRef("");

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
    lastSavedRef.current = sub?.content || "";
    if (a?.type === "Reading" && a?.reading_question_count > 0) {
      setReadingAnswers(parseReadingAnswers(sub?.content, a.reading_question_count));
    }
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
  // (skipped for Speaking: an audio recording can't be force-submitted here safely —
  // the UI instead disables new recordings and shows a "time's up" notice)
  useEffect(() => {
    if (!isTimed || alreadySubmitted || remainingSec === null || remainingSec > 0 || autoSubmitted.current) return;
    if (assignment?.type === "Speaking") return;
    autoSubmitted.current = true;
    (async () => {
      const isReadingStruct = assignment?.type === "Reading" && assignment?.reading_question_count > 0;
      const finalContent = isReadingStruct ? buildReadingContent(readingAnswers) : content.trim();
      await supabase.from("submissions").update({
        content: finalContent, submitted_at: new Date().toISOString(),
      }).eq("id", mySub.id);
      showToast("Time's up — your answer was submitted automatically");
      load();
    })();
  }, [remainingSec, isTimed, alreadySubmitted]); // eslint-disable-line react-hooks/exhaustive-deps

  // Autosave for Writing: saves a few seconds after the student stops typing.
  // Uses the same submissions row (unique per assignment+student), so it
  // never creates a duplicate — and never touches submitted_at or grade.
  const isWritingType = assignment?.type === "Writing Task 1" || assignment?.type === "Writing Task 2";
  useEffect(() => {
    if (!isWritingType || alreadySubmitted || initializing) return;
    if (content === lastSavedRef.current) return;
    const t = setTimeout(async () => {
      setSaveState("saving");
      const { error } = await supabase
        .from("submissions")
        .upsert({ assignment_id: assignmentId, student_id: userId, content }, { onConflict: "assignment_id,student_id" });
      if (!error) {
        lastSavedRef.current = content;
        setSaveState("saved");
        setTimeout(() => setSaveState("idle"), 1500);
      } else {
        setSaveState("idle");
      }
    }, 2500);
    return () => clearTimeout(t);
  }, [content, isWritingType, alreadySubmitted, initializing, assignmentId, userId]);

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

  // ---- Speaking: microphone recording ----
  async function startRecording() {
    setMicError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || "audio/webm" });
        setRecordedBlob(blob);
        setRecordedUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach((t) => t.stop());
      };
      mediaRecorderRef.current = mr;
      mr.start();
      setRecording(true);
      setRecordSec(0);
      recordTimerRef.current = setInterval(() => setRecordSec((s) => s + 1), 1000);
    } catch (err) {
      setMicError("Microphone access was blocked or unavailable. Please allow microphone access in your browser and try again.");
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    setRecording(false);
    clearInterval(recordTimerRef.current);
  }

  function reRecord() {
    setRecordedBlob(null);
    setRecordedUrl(null);
  }

  async function submitSpeaking() {
    if (!recordedBlob) return;
    setBusy(true);
    const path = `${classId}/${uid("rec")}.webm`;
    const { error: uploadError } = await supabase.storage
      .from("assignment-files")
      .upload(path, recordedBlob, { contentType: recordedBlob.type || "audio/webm" });
    if (uploadError) {
      setBusy(false);
      showToast("Could not upload recording");
      return;
    }
    const { data: pub } = supabase.storage.from("assignment-files").getPublicUrl(path);
    const { error } = await supabase.from("submissions").upsert(
      { assignment_id: assignmentId, student_id: userId, content: pub.publicUrl, submitted_at: new Date().toISOString(), grade: null, feedback: null, graded_at: null },
      { onConflict: "assignment_id,student_id" }
    );
    setBusy(false);
    if (error) { showToast("Could not submit"); return; }
    showToast("Recording submitted");
    setRecordedBlob(null);
    setRecordedUrl(null);
    load();
  }

  // ---- Reading: submit the numbered answer boxes as one combined string ----
  async function submitReadingAnswers() {
    const built = buildReadingContent(readingAnswers);
    setBusy(true);
    if (isTimed && mySub) {
      const { error } = await supabase.from("submissions").update({
        content: built, submitted_at: new Date().toISOString(),
      }).eq("id", mySub.id);
      setBusy(false);
      if (error) { showToast("Could not submit"); return; }
    } else {
      const { error } = await supabase.from("submissions").upsert(
        { assignment_id: assignmentId, student_id: userId, content: built, submitted_at: new Date().toISOString(), grade: null, feedback: null, graded_at: null },
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
  const isSpeaking = assignment.type === "Speaking";
  const isReadingStructured = assignment.type === "Reading" && assignment.reading_question_count > 0;
  const timeUp = isTimed && remainingSec === 0 && !alreadySubmitted;

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
              {isPdfUrl(assignment.image_url) ? (
                <AttachmentPreview url={assignment.image_url} />
              ) : (
                <>
                  <div className="wf-zoom-controls">
                    <button type="button" className="wf-zoom-btn" onClick={() => setImgZoom((z) => Math.max(0.5, +(z - 0.15).toFixed(2)))}>−</button>
                    <span className="wf-zoom-level">{Math.round(imgZoom * 100)}%</span>
                    <button type="button" className="wf-zoom-btn" onClick={() => setImgZoom((z) => Math.min(3, +(z + 0.15).toFixed(2)))}>+</button>
                    {imgZoom !== 1 && (
                      <button type="button" className="wf-zoom-reset" onClick={() => setImgZoom(1)}>Reset</button>
                    )}
                  </div>
                  <div className="wf-image-scroll">
                    <img
                      src={assignment.image_url}
                      alt="Assignment attachment"
                      className="wf-zoomable-image"
                      style={{ transform: `scale(${imgZoom})` }}
                    />
                  </div>
                </>
              )}
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
              {saveState !== "idle" && (
                <div className="wf-save-indicator">{saveState === "saving" ? "Saving…" : "Saved"}</div>
              )}
              {submitButton}
            </div>
            {submittedMeta}
          </div>
        </div>
      </div>
    );
  }

  // ---- Reading Focus Mode: full-screen split view, only when the teacher
  // set a number of questions. Regular Reading assignments (no question count)
  // fall through unchanged to the original layout below. ----
  if (isReadingStructured) {
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

        <div className="rf-body">
          <div className="rf-passage-panel">
            <AttachmentPreview url={assignment.image_url} />
            {assignment.description && (
              <ReadingPassage assignmentId={assignmentId} userId={userId} text={assignment.description} />
            )}
          </div>

          <div className="rf-answers-panel">
            <div className="rf-answers-title">Your Answers</div>

            {isTimed && alreadySubmitted && (
              <div className="timer-panel done" style={{ marginBottom: 12 }}>
                <Timer size={18} />
                <div className="timer-label">Timed task — submitted, no further changes possible.</div>
              </div>
            )}

            {mySub?.grade && (
              <div className="feedback-panel" style={{ marginBottom: 12 }}>
                <div className="feedback-band">Band {mySub.grade}</div>
                {mySub.feedback && <p className="feedback-text">{mySub.feedback}</p>}
              </div>
            )}

            {locked ? (
              readingAnswers.map((a, i) => (
                <div key={i} className="rf-answer-row">
                  <span className="rf-answer-num">{i + 1}.</span>
                  <span>{a || <em style={{ color: "var(--ink-soft)" }}>—</em>}</span>
                </div>
              ))
            ) : (
              <>
                {readingAnswers.map((a, i) => (
                  <div key={i} className="rf-answer-row">
                    <span className="rf-answer-num">{i + 1}.</span>
                    <input
                      className="rf-answer-input"
                      value={a}
                      onChange={(e) => {
                        const next = [...readingAnswers];
                        next[i] = e.target.value;
                        setReadingAnswers(next);
                      }}
                    />
                  </div>
                ))}
                <button
                  className="btn-primary"
                  style={{ marginTop: 12, width: "100%", justifyContent: "center" }}
                  disabled={busy}
                  onClick={submitReadingAnswers}
                >
                  {busy ? "Submitting…" : mySub?.submitted_at ? "Resubmit" : "Submit answers"}
                </button>
              </>
            )}
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
          <div className="asg-due"><Clock size={13} /> Due {fmtDueDateTime(assignment.due_date, assignment.due_time)}</div>
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

      {isSpeaking ? (
        <>
          <h3 className="section-title">{locked ? "Your recording" : "Record your answer"}</h3>

          {locked && mySub?.content && isAudioUrl(mySub.content) && (
            <audio controls src={mySub.content} className="audio-embed" style={{ width: "100%" }} />
          )}

          {!locked && (
            <div className="speaking-recorder">
              {micError && <div className="field-error">{micError}</div>}

              {!recording && !recordedBlob && !timeUp && (
                <button className="btn-primary" onClick={startRecording}><Mic size={16} /> Start recording</button>
              )}

              {timeUp && !recordedBlob && (
                <div className="field-error">Time's up — recording is disabled. If you already recorded a take, you can still submit it below.</div>
              )}

              {recording && (
                <div className="recording-live">
                  <span className="rec-dot" /> Recording… {String(Math.floor(recordSec / 60)).padStart(2, "0")}:{String(recordSec % 60).padStart(2, "0")}
                  <button className="btn-ghost" onClick={stopRecording}>Stop</button>
                </div>
              )}

              {recordedBlob && !recording && (
                <div className="recording-preview">
                  <audio controls src={recordedUrl} style={{ width: "100%" }} />
                  <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                    <button className="btn-ghost" onClick={reRecord}>Re-record</button>
                    <button className="btn-primary" disabled={busy} onClick={submitSpeaking}>
                      {busy ? "Submitting…" : "Submit recording"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
          {submittedMeta}
        </>
      ) : (
        <>
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
        </>
      )}
    </div>
  );
}

// ---------- shared bits ----------
