
import React, { useState, useEffect } from "react";
import { Paperclip, X, FileText, Image as ImageIcon, Music, File } from "lucide-react";
import { supabase } from "../../supabaseClient";
import { uid } from "../../lib/utils";
import { fileRef } from "../../lib/storageFiles";
import { SPEAKING_PARTS, DOC_ACCEPT, MAX_DOC_MB, MAX_DOCS_PER_PART, docKindOf, extOf, fmtSize, cleanDocuments, deleteUnusedSpeakingFiles } from "./speaking";

// Structured Speaking — teacher side.
// One assignment = Part 1 and/or Part 2 (cue card) and/or Part 3, each
// with its text and optional documents (PDF, images, audio, Word).
// Students only CONSULT: no recording, no submit.
//
// Files are uploaded only when the teacher saves (nothing is left behind
// if they cancel). Documents removed from an already-saved assignment are
// deleted from storage after a successful save — unless another
// assignment (e.g. a duplicate) still uses the same file.
// Editing works in place (by speaking_part), like Writing.

function emptyPart(include) {
  return { include, sectionId: null, text: "", docs: [], newFiles: [] };
}

const KIND_ICON = { pdf: FileText, image: ImageIcon, audio: Music, docx: File };

export function TeacherSpeakingBuilder({ classId, teacherId, setScreen, showToast, editAssignmentId, returnTo}) {
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("");
  const [parts, setParts] = useState({ 1: emptyPart(true), 2: emptyPart(true), 3: emptyPart(true) });
  const [removedDocs, setRemovedDocs] = useState([]); // saved docs the teacher removed
  const [fileInputKey, setFileInputKey] = useState(0);
  const [publishing, setPublishing] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [loadingExisting, setLoadingExisting] = useState(Boolean(editAssignmentId));

  useEffect(() => {
    if (!editAssignmentId) return;
    (async () => {
      const { data: a } = await supabase.from("assignments").select("title, due_date, due_time").eq("id", editAssignmentId).single();
      if (a) {
        setTitle(a.title || "");
        setDueDate(a.due_date || "");
        setDueTime(a.due_time || "");
      }
      const { data: sections } = await supabase
        .from("exam_sections")
        .select("id, speaking_part, passage_text, documents")
        .eq("assignment_id", editAssignmentId)
        .order("order_index");
      const next = { 1: emptyPart(false), 2: emptyPart(false), 3: emptyPart(false) };
      for (const s of sections || []) {
        if (!next[s.speaking_part]) continue;
        next[s.speaking_part] = { include: true, sectionId: s.id, text: s.passage_text || "", docs: cleanDocuments(s.documents), newFiles: [] };
      }
      setParts(next);
      setLoadingExisting(false);
    })();
  }, [editAssignmentId]);

  function updatePart(n, patch) {
    setParts((prev) => ({ ...prev, [n]: { ...prev[n], ...patch } }));
  }

  function addFiles(n, fileList) {
    setError("");
    const part = parts[n];
    const accepted = [];
    for (const file of Array.from(fileList || [])) {
      const kind = docKindOf(file);
      if (!kind) {
        setError(`"${file.name}" is not accepted. Use PDF, PNG/JPG/WebP images, MP3/M4A/WAV audio or Word (.docx).`);
        continue;
      }
      if (file.size > MAX_DOC_MB * 1024 * 1024) {
        setError(`"${file.name}" is larger than ${MAX_DOC_MB} MB.`);
        continue;
      }
      accepted.push({ localId: crypto.randomUUID(), file, kind });
    }
    const room = MAX_DOCS_PER_PART - part.docs.length - part.newFiles.length;
    if (accepted.length > room) setError(`A part can have at most ${MAX_DOCS_PER_PART} documents.`);
    updatePart(n, { newFiles: [...part.newFiles, ...accepted.slice(0, Math.max(0, room))] });
    setFileInputKey((k) => k + 1);
  }

  function removeNewFile(n, localId) {
    updatePart(n, { newFiles: parts[n].newFiles.filter((f) => f.localId !== localId) });
  }

  function removeSavedDoc(n, doc) {
    updatePart(n, { docs: parts[n].docs.filter((d) => d.url !== doc.url) });
    setRemovedDocs((prev) => [...prev, doc]);
  }

  const includedParts = [1, 2, 3].filter((n) => parts[n].include);
  const canPublish = includedParts.length > 0 && includedParts.every((n) => parts[n].text.trim() || parts[n].docs.length + parts[n].newFiles.length > 0);

  async function uploadNewFiles(n) {
    const uploaded = [];
    for (const f of parts[n].newFiles) {
      const ext = extOf(f.file.name) || "bin";
      const path = `speaking/${teacherId}/${uid("doc")}.${ext}`;
      setProgress(`Uploading ${f.file.name}…`);
      const { error: upError } = await supabase.storage.from("assignment-files").upload(path, f.file, { contentType: f.file.type || undefined });
      if (upError) throw new Error(`Upload of "${f.file.name}" failed: ${upError.message}`);
      uploaded.push({ name: f.file.name, url: fileRef(path), path, kind: f.kind, size: f.file.size });
    }
    return uploaded;
  }

  async function publish() {
    setError("");
    if (!canPublish) return;

    const unticked = [1, 2, 3].filter((n) => !parts[n].include && parts[n].sectionId);
    if (unticked.length > 0) {
      const ok = window.confirm(`You unticked ${unticked.map((n) => `Part ${n}`).join(" and ")}. Saving will remove it from the assignment, with its documents. Continue?`);
      if (!ok) return;
    }

    setPublishing(true);

    const finalDocs = {};
    try {
      for (const n of includedParts) {
        finalDocs[n] = [...parts[n].docs, ...(await uploadNewFiles(n))];
      }
    } catch (e) {
      setPublishing(false);
      setProgress("");
      setError(e.message);
      return;
    }
    setProgress("Saving…");

    const finalTitle = title.trim() || `Speaking Practice — ${new Date().toLocaleDateString()}`;
    let assignmentId = editAssignmentId;
    const meta = { title: finalTitle, due_date: dueDate || null, due_time: dueTime || null };

    if (editAssignmentId) {
      const { error: uError } = await supabase.from("assignments").update(meta).eq("id", editAssignmentId);
      if (uError) {
        setPublishing(false);
        setProgress("");
        setError("Could not update the assignment: " + uError.message);
        return;
      }
    } else {
      const { data: created, error: aError } = await supabase
        .from("assignments")
        .insert({
          class_id: classId,
          type: "Speaking",
          description: null,
          time_limit_minutes: null,
          auto_release_score: false,
          show_answer_review: false,
          ...meta,
        })
        .select()
        .single();
      if (aError || !created) {
        setPublishing(false);
        setProgress("");
        setError("Could not create the assignment: " + (aError?.message || "unknown error"));
        return;
      }
      assignmentId = created.id;
    }

    const docsOfDeletedParts = [];
    let order = 0;
    for (const n of [1, 2, 3]) {
      const part = parts[n];
      if (!part.include) {
        if (part.sectionId) {
          docsOfDeletedParts.push(...part.docs);
          const { error: dError } = await supabase.from("exam_sections").delete().eq("id", part.sectionId);
          if (dError) {
            setPublishing(false);
            setProgress("");
            setError(`Could not remove Part ${n}: ` + dError.message);
            return;
          }
        }
        continue;
      }
      const pm = SPEAKING_PARTS[n];
      const row = {
        title: pm.label,
        passage_title: `Speaking ${pm.label} — ${pm.title}`,
        passage_text: part.text.trim(),
        speaking_part: n,
        documents: finalDocs[n],
        order_index: order,
      };
      const { error: sError } = part.sectionId
        ? await supabase.from("exam_sections").update(row).eq("id", part.sectionId)
        : await supabase.from("exam_sections").insert({ assignment_id: assignmentId, ...row });
      if (sError) {
        setPublishing(false);
        setProgress("");
        setError(`Assignment saved, but Part ${n} failed to save: ` + sError.message);
        return;
      }
      order++;
    }

    await deleteUnusedSpeakingFiles(supabase, [...removedDocs, ...docsOfDeletedParts], teacherId);

    setPublishing(false);
    setProgress("");
    showToast?.(editAssignmentId ? "Speaking assignment updated" : "Speaking assignment published");
    setScreen(returnTo || { name: "class", classId });
  }

  if (loadingExisting) {
    return (
      <div className="page page-wide">
        <p className="empty-inline">Loading assignment…</p>
      </div>
    );
  }

  return (
    <div className="page page-wide">
      <div className="eyebrow">Structured Speaking</div>
      <h1 className="page-title">{editAssignmentId ? "Edit Speaking assignment" : "New Speaking assignment"}</h1>
      <p className="field-hint" style={{ marginTop: 4 }}>Students consult the topics and documents to prepare. There is no recording and nothing to submit.</p>

      <label className="field-label" style={{ marginTop: 16 }}>Title (optional — auto-generated if left blank)</label>
      <input className="field-input" placeholder="e.g. Speaking Practice — Travel" value={title} onChange={(e) => setTitle(e.target.value)} />

      <div style={{ maxWidth: 320, marginTop: 14 }}>
        <label className="field-label">Due date (optional)</label>
        <input type="date" className="field-input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
      </div>
      <div style={{ maxWidth: 320, marginTop: 14 }}>
        <label className="field-label">Due time (optional)</label>
        <input type="time" className="field-input" value={dueTime} onChange={(e) => setDueTime(e.target.value)} />
      </div>

      <label className="field-label" style={{ marginTop: 18 }}>Parts in this assignment</label>
      {[1, 2, 3].map((n) => (
        <label key={n} className="checkbox-row" style={{ marginTop: n === 1 ? 0 : 6 }}>
          <input type="checkbox" checked={parts[n].include} onChange={(e) => updatePart(n, { include: e.target.checked })} />
          {SPEAKING_PARTS[n].label} — {SPEAKING_PARTS[n].title}
        </label>
      ))}
      <p className="field-hint" style={{ marginTop: 2 }}>
        {includedParts.length === 0 ? "Tick at least one part." : "Each part needs a text or at least one document."}
      </p>

      {includedParts.map((n) => {
        const part = parts[n];
        const meta = SPEAKING_PARTS[n];
        return (
          <div key={n} className="feedback-panel qe-writing-task-block">
            <h3 className="section-title" style={{ margin: 0 }}>{meta.label} — {meta.title}</h3>

            <label className="field-label" style={{ marginTop: 14 }}>{meta.field}</label>
            <textarea
              className="field-input textarea"
              style={{ minHeight: n === 2 ? 170 : 130 }}
              placeholder={meta.placeholder}
              value={part.text}
              onChange={(e) => updatePart(n, { text: e.target.value })}
            />

            <label className="field-label" style={{ marginTop: 14 }}>Documents (optional)</label>
            {(part.docs.length > 0 || part.newFiles.length > 0) && (
              <div className="qe-sp-doclist">
                {part.docs.map((d) => {
                  const Icon = KIND_ICON[d.kind] || File;
                  return (
                    <div key={d.url} className="qe-sp-docrow">
                      <Icon size={15} />
                      <span className="qe-sp-docname">{d.name}</span>
                      <span className="qe-sp-docmeta">{fmtSize(d.size)}</span>
                      <button type="button" className="btn-ghost qe-sp-docremove" onClick={() => removeSavedDoc(n, d)}><X size={13} /> Remove</button>
                    </div>
                  );
                })}
                {part.newFiles.map((f) => {
                  const Icon = KIND_ICON[f.kind] || File;
                  return (
                    <div key={f.localId} className="qe-sp-docrow qe-sp-docrow-new">
                      <Icon size={15} />
                      <span className="qe-sp-docname">{f.file.name}</span>
                      <span className="qe-sp-docmeta">{fmtSize(f.file.size)} · uploads when you save</span>
                      <button type="button" className="btn-ghost qe-sp-docremove" onClick={() => removeNewFile(n, f.localId)}><X size={13} /> Remove</button>
                    </div>
                  );
                })}
              </div>
            )}
            {part.docs.length + part.newFiles.length < MAX_DOCS_PER_PART && (
              <label className="qe-writing-image-drop" style={{ marginTop: 8 }}>
                <Paperclip size={16} />
                <span>Add documents</span>
                <input key={`${n}-${fileInputKey}`} type="file" multiple accept={DOC_ACCEPT} onChange={(e) => addFiles(n, e.target.files)} style={{ display: "none" }} />
              </label>
            )}
            <p className="field-hint" style={{ marginTop: 6 }}>PDF, images (PNG, JPG, WebP), audio (MP3, M4A, WAV) or Word (.docx) — up to {MAX_DOC_MB} MB each.</p>
          </div>
        );
      })}

      {error && <div className="field-error" style={{ marginTop: 16 }}>{error}</div>}

      <button className="btn-primary" style={{ marginTop: 24 }} disabled={!canPublish || publishing} onClick={publish}>
        {publishing ? progress || "Saving…" : editAssignmentId ? "Save changes" : "Publish assignment"}
      </button>
    </div>
  );
}
