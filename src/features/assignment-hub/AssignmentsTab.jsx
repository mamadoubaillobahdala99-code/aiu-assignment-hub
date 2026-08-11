import React, { useState, useEffect, useCallback } from "react";
import { BookOpen, Users, Plus, Check, Clock, AlertTriangle, LogOut, GraduationCap, FileText, ChevronRight, X, Copy, CheckCircle2, Headphones, PenLine, Mic, ListChecks, ArrowLeft, Loader2, Timer, Highlighter } from "lucide-react";
import { supabase } from "../../supabaseClient";
import { uid, makeCode, TYPES, fmtDate, daysUntil, wordCount, isPdfUrl } from "../../lib/utils";
import { AttachmentPreview, PageHeader, EmptyState, CenterSpinner, Modal, StatusBadge } from "../../components/shared";
import { TicketCard } from "./TicketCard";

export function AssignmentsTab({ classId, assignments, onCreated, onOpen }) {
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [type, setType] = useState("Reading");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [timeLimit, setTimeLimit] = useState("");
  const [targetWords, setTargetWords] = useState("");
  const [readingQuestionCount, setReadingQuestionCount] = useState("");
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [uploadPct, setUploadPct] = useState(null);

  function pickImage(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(file.type.startsWith("image/") ? URL.createObjectURL(file) : null);
  }

  function removeImage() {
    setImageFile(null);
    setImagePreview(null);
    setFileInputKey((k) => k + 1); // remounts the <input type="file"> so it forgets the old selection
  }

  function selectType(t) {
    setType(t);
    const preset = TYPES[t];
    setTimeLimit(preset?.timeLimit != null ? String(preset.timeLimit) : "");
    setTargetWords(preset?.targetWords != null ? String(preset.targetWords) : "");
  }

  async function create() {
    if (!title.trim()) return;
    setBusy(true);

    let image_url = null;
    if (imageFile) {
      setUploadPct(0);
      const ext = imageFile.name.split(".").pop();
      const path = `${classId}/${uid("img")}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("assignment-files").upload(path, imageFile);
      setUploadPct(null);
      if (uploadError) {
        setBusy(false);
        alert("Image upload failed: " + uploadError.message);
        return;
      }
      const { data: pub } = supabase.storage.from("assignment-files").getPublicUrl(path);
      image_url = pub.publicUrl;
    }

    const { error } = await supabase.from("assignments").insert({
      class_id: classId,
      title: title.trim(),
      type,
      description: description.trim(),
      due_date: dueDate || null,
      time_limit_minutes: timeLimit ? parseInt(timeLimit, 10) : null,
      target_word_count: targetWords ? parseInt(targetWords, 10) : null,
      reading_question_count: type === "Reading" && readingQuestionCount ? parseInt(readingQuestionCount, 10) : null,
      image_url,
    });
    setBusy(false);
    if (error) return;
    setShowCreate(false);
    setTitle(""); setDescription(""); setDueDate(""); setType("Reading"); setTimeLimit(""); setTargetWords(""); setReadingQuestionCount("");
    setImageFile(null); setImagePreview(null); setFileInputKey((k) => k + 1);
    onCreated();
  }

  return (
    <div>
      <div className="row-right">
        <button className="btn-primary" onClick={() => setShowCreate(true)}><Plus size={16} /> New assignment</button>
      </div>

      {assignments.length === 0 ? (
        <EmptyState icon={<FileText size={26} />} title="No assignments posted" body="Create your first task — Reading, Listening, Writing, Speaking, or anything else." />
      ) : (
        <div className="ticket-list">
          {assignments.map((a) => (
            <TicketCard key={a.id} assignment={{ ...a, dueDate: a.due_date, time_limit_minutes: a.time_limit_minutes }} onClick={() => onOpen(a)} />
          ))}
        </div>
      )}

      {showCreate && (
        <Modal onClose={() => setShowCreate(false)} title="New assignment">
          <label className="field-label">Title</label>
          <input className="field-input" placeholder="e.g. Writing Task 2 — Opinion Essay" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />

          <label className="field-label" style={{ marginTop: 14 }}>Type</label>
          <div className="type-row">
            {Object.keys(TYPES).map((t) => (
              <button key={t} className={`type-chip ${type === t ? "active" : ""}`} onClick={() => selectType(t)}>{t}</button>
            ))}
          </div>
          <p className="field-hint">Click a skill and the time limit + word target below fill in automatically — feel free to adjust them.</p>

          <label className="field-label" style={{ marginTop: 14 }}>Instructions</label>
          <textarea className="field-input textarea" placeholder="Task instructions, prompt text, or a link to the material…" value={description} onChange={(e) => setDescription(e.target.value)} />

          <label className="field-label" style={{ marginTop: 14 }}>Due date</label>
          <input type="date" className="field-input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />

          <label className="field-label" style={{ marginTop: 14 }}>Time limit (optional)</label>
          <input
            type="number"
            min="1"
            className="field-input"
            placeholder="e.g. 60 (minutes) — leave empty for no time limit"
            value={timeLimit}
            onChange={(e) => setTimeLimit(e.target.value)}
          />
          <p className="field-hint">If set, the countdown starts the moment the student opens this assignment — just like the real IELTS test.</p>

          <label className="field-label" style={{ marginTop: 14 }}>Target word count (optional)</label>
          <input
            type="number"
            min="1"
            className="field-input"
            placeholder="e.g. 250 (Writing Task 2) — leave empty to skip"
            value={targetWords}
            onChange={(e) => setTargetWords(e.target.value)}
          />
          <p className="field-hint">Students see a live word counter that turns green once they reach this target.</p>

          {type === "Reading" && (
            <>
              <label className="field-label" style={{ marginTop: 14 }}>Number of questions (optional)</label>
              <input
                type="number"
                min="1"
                max="40"
                className="field-input"
                placeholder="e.g. 13 — leave empty for a simple free-text answer instead"
                value={readingQuestionCount}
                onChange={(e) => setReadingQuestionCount(e.target.value)}
              />
              <p className="field-hint">If set, students get a numbered answer box for each question, side-by-side with the passage, in full-screen focus mode.</p>
            </>
          )}

          <label className="field-label" style={{ marginTop: 14 }}>Attach an image, PDF, or audio file (fully optional)</label>
          <p className="field-hint" style={{ marginTop: 0, marginBottom: 8 }}>Only if you want to — perfect for a Writing Task 1 chart, a scanned Reading passage, a Listening audio clip, or any reference material. Skip it entirely for a text-only task.</p>
          <input key={fileInputKey} type="file" accept="image/*,application/pdf,audio/*" className="field-input" onChange={pickImage} style={{ padding: 8 }} />
          {imageFile && imagePreview && (
            <div className="file-preview-row">
              <img src={imagePreview} alt="Preview" className="image-preview" />
              <button type="button" className="btn-ghost remove-file" onClick={removeImage}><X size={13} /> Remove</button>
            </div>
          )}
          {imageFile && !imagePreview && (
            <div className="file-preview-row">
              <div className="file-chip"><FileText size={14} /> {imageFile.name}</div>
              <button type="button" className="btn-ghost remove-file" onClick={removeImage}><X size={13} /> Remove</button>
            </div>
          )}
          {uploadPct !== null && <div className="field-hint">Uploading…</div>}

          <button className="btn-primary" style={{ marginTop: 16 }} disabled={!title.trim() || busy} onClick={create}>
            {busy ? "Posting…" : "Post assignment"}
          </button>
        </Modal>
      )}
    </div>
  );
}
