import React, { useState, useEffect, useCallback } from "react";
import { Upload, Music, Check, X, Trash2 } from "lucide-react";
import { supabase } from "../../supabaseClient";
import { uid } from "../../lib/utils";

// Every Listening audio file lives under audio/{teacherId}/ in the same
// "assignment-files" bucket already used for assignment images — no new
// bucket, same upload pattern already proven in AssignmentsTab.jsx.
function audioFolder(teacherId) {
  return `audio/${teacherId}`;
}

export function AudioFilePicker({ teacherId, value, onChange }) {
  const [tab, setTab] = useState("library"); // "library" | "upload"
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deletingName, setDeletingName] = useState(null);
  const [error, setError] = useState("");

  const loadLibrary = useCallback(async () => {
    setLoading(true);
    const { data, error: listError } = await supabase.storage.from("assignment-files").list(audioFolder(teacherId), {
      sortBy: { column: "created_at", order: "desc" },
    });
    if (!listError && data) {
      const withUrls = data
        .filter((f) => f.name && !f.name.startsWith("."))
        .map((f) => {
          const path = `${audioFolder(teacherId)}/${f.name}`;
          const { data: pub } = supabase.storage.from("assignment-files").getPublicUrl(path);
          return { name: f.name, url: pub.publicUrl };
        });
      setFiles(withUrls);
    }
    setLoading(false);
  }, [teacherId]);

  useEffect(() => { loadLibrary(); }, [loadLibrary]);

  async function handleUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError("");
    const ext = file.name.split(".").pop();
    const path = `${audioFolder(teacherId)}/${uid("audio")}.${ext}`;
    const { error: uploadError } = await supabase.storage.from("assignment-files").upload(path, file);
    setUploading(false);
    if (uploadError) {
      setError("Upload failed: " + uploadError.message);
      return;
    }
    const { data: pub } = supabase.storage.from("assignment-files").getPublicUrl(path);
    onChange({ url: pub.publicUrl, filename: file.name });
    loadLibrary();
    setTab("library");
  }

  // Deletes the file from the library entirely — not just from the
  // current Part. Checked against every assignment first (not only this
  // one), since the same file is often reused across several Parts.
  async function handleDeleteForever(f) {
    setError("");
    setDeletingName(f.name);

    const { data: usedIn, error: usageError } = await supabase
      .from("exam_sections")
      .select("id, title, assignment_id, assignments!exam_sections_assignment_id_fkey(title)")
      .eq("audio_url", f.url);

    if (usageError) {
      setDeletingName(null);
      setError("Could not check where this file is used: " + usageError.message);
      return;
    }

    const count = usedIn?.length || 0;
    const message =
      count > 0
        ? `"${f.name}" is currently used in ${count} part${count > 1 ? "s" : ""} across your assignments` +
          (usedIn.length <= 5 ? ": " + usedIn.map((s) => `${s.assignments?.title || "an assignment"} — ${s.title}`).join(", ") : "") +
          `. Deleting it will remove the audio from ${count > 1 ? "those parts" : "that part"} too — students opening ${count > 1 ? "them" : "it"} will see no audio until you pick a new one. Delete anyway?`
        : `Delete "${f.name}"? This can't be undone.`;

    if (!window.confirm(message)) {
      setDeletingName(null);
      return;
    }

    const path = `${audioFolder(teacherId)}/${f.name}`;
    const { error: removeError } = await supabase.storage.from("assignment-files").remove([path]);
    if (removeError) {
      setDeletingName(null);
      setError("Could not delete the file: " + removeError.message);
      return;
    }

    if (count > 0) {
      await supabase.from("exam_sections").update({ audio_url: null }).eq("audio_url", f.url);
    }

    // If the file we just deleted was selected right here, clear it too
    // — no point leaving a phantom selection pointing at a dead file.
    if (value?.url === f.url) onChange(null);

    setDeletingName(null);
    loadLibrary();
  }

  return (
    <div className="qe-audio-picker">
      <div className="type-row">
        <button type="button" className={`type-chip ${tab === "library" ? "active" : ""}`} onClick={() => setTab("library")}>Choose existing</button>
        <button type="button" className={`type-chip ${tab === "upload" ? "active" : ""}`} onClick={() => setTab("upload")}>Upload new</button>
      </div>

      {tab === "library" ? (
        loading ? (
          <p className="empty-inline" style={{ marginTop: 10 }}>Loading your audio files…</p>
        ) : files.length === 0 ? (
          <p className="empty-inline" style={{ marginTop: 10 }}>No audio files uploaded yet — use "Upload new".</p>
        ) : (
          <div className="qe-audio-library" style={{ marginTop: 10 }}>
            {files.map((f) => (
              <div key={f.name} className={`qe-audio-library-item ${value?.url === f.url ? "active" : ""}`}>
                <button type="button" className="qe-audio-library-select" onClick={() => onChange({ url: f.url, filename: f.name })}>
                  <Music size={14} />
                  <span className="qe-audio-library-name">{f.name}</span>
                  {value?.url === f.url && <Check size={14} className="qe-question-check" />}
                </button>
                <button
                  type="button"
                  className="qe-audio-delete-btn"
                  title="Delete this file forever"
                  disabled={deletingName === f.name}
                  onClick={() => handleDeleteForever(f)}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )
      ) : (
        <div style={{ marginTop: 10 }}>
          <label className="btn-ghost" style={{ cursor: "pointer", display: "inline-flex" }}>
            <Upload size={14} /> {uploading ? "Uploading…" : "Choose an audio file"}
            <input type="file" accept="audio/*" style={{ display: "none" }} onChange={handleUpload} disabled={uploading} />
          </label>
        </div>
      )}

      {error && <div className="field-error" style={{ marginTop: 8 }}>{error}</div>}

      {value?.url && (
        <div className="qe-audio-selected">
          <Music size={13} /> Selected: {value.filename || "audio file"}
          <button type="button" className="qe-audio-remove-btn" onClick={() => onChange(null)}>
            <X size={12} /> Remove
          </button>
        </div>
      )}
    </div>
  );
}
