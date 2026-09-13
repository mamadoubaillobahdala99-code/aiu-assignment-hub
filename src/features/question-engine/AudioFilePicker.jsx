import React, { useState, useEffect, useCallback } from "react";
import { Upload, Music, Check, X } from "lucide-react";
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
              <button
                type="button"
                key={f.name}
                className={`qe-audio-library-item ${value?.url === f.url ? "active" : ""}`}
                onClick={() => onChange({ url: f.url, filename: f.name })}
              >
                <Music size={14} />
                <span className="qe-audio-library-name">{f.name}</span>
                {value?.url === f.url && <Check size={14} className="qe-question-check" />}
              </button>
            ))}
          </div>
        )
      ) : (
        <div style={{ marginTop: 10 }}>
          <label className="btn-ghost" style={{ cursor: "pointer", display: "inline-flex" }}>
            <Upload size={14} /> {uploading ? "Uploading…" : "Choose an audio file"}
            <input type="file" accept="audio/*" style={{ display: "none" }} onChange={handleUpload} disabled={uploading} />
          </label>
          {error && <div className="field-error" style={{ marginTop: 8 }}>{error}</div>}
        </div>
      )}

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
