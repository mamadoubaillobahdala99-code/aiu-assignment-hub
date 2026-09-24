import React, { useState, useEffect, useCallback, useRef } from "react";
import { Upload, Music, Check, X, Trash2, Play, Square } from "lucide-react";
import { supabase } from "../../supabaseClient";
import { uid } from "../../lib/utils";
import { fileRef, useSignedUrl } from "../../lib/storageFiles";

// Every Listening audio file lives under audio/{teacherId}/ in the same
// "assignment-files" bucket already used for assignment images — no new
// bucket, same upload pattern already proven in AssignmentsTab.jsx.
function audioFolder(teacherId) {
  return `audio/${teacherId}`;
}

// The teacher's own player: normal controls, no limit — it is only there
// to check the file before (or after) choosing it. Starting one player
// pauses every other one on the page.
function AudioPreview({ url, autoPlay = false }) {
  const [src, renew] = useSignedUrl(url);
  const renewed = useRef(false);
  if (!src) return <p className="qe-audio-preview-wait">Loading the recording…</p>;
  return (
    <audio
      className="qe-audio-preview"
      controls
      preload="metadata"
      autoPlay={autoPlay}
      src={src}
      onPlay={(e) => {
        document.querySelectorAll("audio.qe-audio-preview").forEach((el) => {
          if (el !== e.target && !el.paused) el.pause();
        });
      }}
      onError={() => {
        if (renewed.current) return;
        renewed.current = true;
        renew();
      }}
    />
  );
}

export function AudioFilePicker({ teacherId, value, onChange }) {
  const [tab, setTab] = useState("library"); // "library" | "upload"
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deletingName, setDeletingName] = useState(null);
  const [error, setError] = useState("");
  // The library file being listened to (one at a time), or null.
  const [listening, setListening] = useState(null);

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
          return { name: f.name, url: fileRef(path) };
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
    onChange({ url: fileRef(path), filename: file.name });
    loadLibrary();
    setTab("library");
  }

  // Deletes the file from the library entirely — not just from the
  // current Part. Refused while ANY paper still uses it: the teacher's own
  // papers, and copies other teachers made (duplicated into their exam),
  // which this browser cannot see. The database counts them for us
  // (storage_file_usage) and gives back numbers only, never titles.
  async function handleDeleteForever(f) {
    setError("");
    setDeletingName(f.name);
    const path = `${audioFolder(teacherId)}/${f.name}`;

    const { data: usage, error: usageError } = await supabase.rpc("storage_file_usage", { p_name: path });
    if (usageError || !usage) {
      setDeletingName(null);
      setError("Could not check where this file is used, so nothing was deleted. Try again in a moment.");
      return;
    }

    const mine = Number(usage.mine) || 0;
    const others = Number(usage.others) || 0;
    if (mine + others > 0) {
      setDeletingName(null);
      const parts = [];
      if (mine) parts.push(`${mine} of your paper${mine > 1 ? "s" : ""}`);
      if (others) parts.push(`${others} paper${others > 1 ? "s" : ""} of another teacher (a copy of yours)`);
      setError(`"${f.name}" can't be deleted: it is used in ${parts.join(" and ")}. Deleting it would leave ${mine + others > 1 ? "them" : "it"} without audio.`);
      return;
    }

    if (!window.confirm(`Delete "${f.name}"? No paper uses it. This can't be undone.`)) {
      setDeletingName(null);
      return;
    }

    const { error: removeError } = await supabase.storage.from("assignment-files").remove([path]);
    if (removeError) {
      setDeletingName(null);
      setError("Could not delete the file: " + removeError.message);
      return;
    }

    // If the file we just deleted was selected right here, clear it too
    // — no point leaving a phantom selection pointing at a dead file.
    if (value?.url === f.url) onChange(null);
    if (listening === f.name) setListening(null);

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
              <div key={f.name} className={`qe-audio-library-row ${value?.url === f.url ? "active" : ""}`}>
                <div className={`qe-audio-library-item ${value?.url === f.url ? "active" : ""}`}>
                  <button
                    type="button"
                    className={`qe-audio-listen-btn ${listening === f.name ? "is-on" : ""}`}
                    title={listening === f.name ? "Stop listening" : "Listen to this file"}
                    aria-label={listening === f.name ? "Stop listening" : "Listen to this file"}
                    onClick={() => setListening((n) => (n === f.name ? null : f.name))}
                  >
                    {listening === f.name ? <Square size={12} /> : <Play size={13} />}
                  </button>
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
                {listening === f.name && <AudioPreview url={f.url} autoPlay />}
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
        <>
          <div className="qe-audio-selected">
            <Music size={13} /> Selected: {value.filename || "audio file"}
            <button type="button" className="qe-audio-remove-btn" onClick={() => onChange(null)}>
              <X size={12} /> Remove
            </button>
          </div>
          <AudioPreview url={value.url} />
        </>
      )}
    </div>
  );
}
