
import React, { useState, useEffect } from "react";
import { ZoomIn, ZoomOut, RotateCcw, Maximize2, X, ImagePlus } from "lucide-react";
import { supabase } from "../../supabaseClient";
import { uid } from "../../lib/utils";
import { isSafeUrl } from "./speaking";

// Image attached to a question group — the map, plan or diagram of a
// labelling task (or any figure a group needs). Students can zoom in/out
// and open it full screen, like the computer-delivered IELTS test.
// Only real https links are ever displayed.

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3;
const ZOOM_STEP = 0.25;

export function GroupImage({ url, alt = "Figure for these questions" }) {
  const [zoom, setZoom] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    if (!fullscreen) return;
    function onKey(e) {
      if (e.key === "Escape") setFullscreen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen]);

  if (!isSafeUrl(url)) return null;
  const change = (d) => setZoom((z) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round((z + d) * 100) / 100)));

  return (
    <figure className="qe-gimg">
      <div className="qe-gimg-bar">
        <button type="button" className="qe-gimg-btn" title="Smaller" disabled={zoom <= ZOOM_MIN} onClick={() => change(-ZOOM_STEP)}><ZoomOut size={15} /></button>
        <span className="qe-gimg-zoom">{Math.round(zoom * 100)}%</span>
        <button type="button" className="qe-gimg-btn" title="Bigger" disabled={zoom >= ZOOM_MAX} onClick={() => change(ZOOM_STEP)}><ZoomIn size={15} /></button>
        {zoom !== 1 && (
          <button type="button" className="qe-gimg-btn" title="Reset size" onClick={() => setZoom(1)}><RotateCcw size={14} /></button>
        )}
        <button type="button" className="qe-gimg-btn qe-gimg-full" title="Open full screen" onClick={() => setFullscreen(true)}>
          <Maximize2 size={14} /> Full screen
        </button>
      </div>
      <div className="qe-gimg-scroll">
        <img src={url} alt={alt} style={{ width: `${zoom * 100}%` }} draggable={false} />
      </div>

      {fullscreen && (
        <div className="qe-gimg-lightbox" role="dialog" aria-modal="true" onClick={() => setFullscreen(false)}>
          <button type="button" className="qe-gimg-close" onClick={() => setFullscreen(false)} aria-label="Close"><X size={20} /></button>
          <img src={url} alt={alt} onClick={(e) => e.stopPropagation()} draggable={false} />
        </div>
      )}
    </figure>
  );
}

const MAX_IMAGE_MB = 10;
const ACCEPTED = ["image/png", "image/jpeg", "image/webp", "image/gif"];

// Teacher side: pick an image for a group. Uploaded straight away (like
// the audio picker) so the preview is the real stored file.
export function GroupImagePicker({ teacherId, value, onChange, label = "Image (optional)", hint, required = false }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [inputKey, setInputKey] = useState(0);

  async function pick(e) {
    const file = e.target.files?.[0];
    setInputKey((k) => k + 1);
    if (!file) return;
    setError("");
    if (!ACCEPTED.includes(file.type)) {
      setError("Please choose a PNG, JPG, WebP or GIF image.");
      return;
    }
    if (file.size > MAX_IMAGE_MB * 1024 * 1024) {
      setError(`This image is larger than ${MAX_IMAGE_MB} MB.`);
      return;
    }
    setBusy(true);
    const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
    const path = `images/${teacherId}/${uid("group")}.${ext}`;
    const { error: upError } = await supabase.storage.from("assignment-files").upload(path, file, { contentType: file.type });
    setBusy(false);
    if (upError) {
      setError("Upload failed: " + upError.message);
      return;
    }
    const { data: pub } = supabase.storage.from("assignment-files").getPublicUrl(path);
    onChange(pub.publicUrl);
  }

  return (
    <div className="qe-gimg-picker">
      <label className="field-label" style={{ marginTop: 14 }}>
        {label}
        {required && !value && <span className="qe-gimg-required"> — required</span>}
      </label>
      {value ? (
        <div className="qe-gimg-picker-preview">
          <img src={value} alt="" />
          <button type="button" className="btn-ghost" onClick={() => onChange("")}><X size={13} /> Remove image</button>
        </div>
      ) : (
        <label className={`qe-writing-image-drop ${busy ? "is-busy" : ""}`}>
          <ImagePlus size={18} />
          <span>{busy ? "Uploading…" : "Upload image"}</span>
          <input key={inputKey} type="file" accept={ACCEPTED.join(",")} onChange={pick} disabled={busy} style={{ display: "none" }} />
        </label>
      )}
      {hint && <p className="field-hint" style={{ marginTop: 6 }}>{hint}</p>}
      {error && <div className="field-error" style={{ marginTop: 6 }}>{error}</div>}
    </div>
  );
}
