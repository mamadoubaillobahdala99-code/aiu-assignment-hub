
import React, { useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { supabase } from "../../supabaseClient";
import { uid } from "../../lib/utils";
import { GroupImage } from "./GroupImage";

// Images inside a Reading passage (a plant, an animal, a chart between
// two paragraphs). The passage stays plain text: an image is a line of
// its own, "[[image:<url>]]", at the place where it must appear.
//
// Only images stored in this site's own storage (assignment-files/images/)
// are ever displayed to students: any other link is ignored.
// "local:<n>" images exist only in the importer's preview (images read
// from a Word file, not uploaded yet).

export const IMAGE_MARKER_RE = /^\[\[image:([^\s\]]+)\]\]$/;
export const IMAGE_MARKER_ANY = /\[\[image:[^\s\]]*\]\]/g;
const ACCEPTED = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const MAX_IMAGE_MB = 10;

export function imageMarker(url) {
  return `[[image:${url}]]`;
}

// "https://<project>.supabase.co/storage/v1/object/public/assignment-files/images/"
function storagePrefix() {
  const { data } = supabase.storage.from("assignment-files").getPublicUrl("images/");
  return data?.publicUrl || "";
}

export function isStoredImageUrl(url) {
  const prefix = storagePrefix();
  try {
    const u = new URL(url);
    return u.protocol === "https:" && prefix.startsWith("https:") && url.startsWith(prefix) && !url.includes("..");
  } catch {
    return false;
  }
}

// Text without image lines (for short previews such as assignment lists).
export function stripImageMarkers(text) {
  return String(text || "")
    .replace(IMAGE_MARKER_ANY, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function imageUrlsIn(text) {
  return String(text || "")
    .split("\n")
    .map((l) => IMAGE_MARKER_RE.exec(l.trim()))
    .filter(Boolean)
    .map((m) => m[1]);
}

// resolveImage(url) → the URL to display (the importer turns "local:3"
// into an in-memory picture), or "" to show nothing.
export function defaultResolve(url) {
  return isStoredImageUrl(url) ? url : "";
}

// Read-only passage with its images (review screens, teacher previews).
export function PassageView({ text, resolveImage = defaultResolve, className = "" }) {
  const blocks = [];
  let buf = [];
  const flush = () => {
    if (buf.length) blocks.push({ kind: "text", text: buf.join("\n").replace(/^\n+|\n+$/g, "") });
    buf = [];
  };
  for (const line of String(text || "").split("\n")) {
    const m = IMAGE_MARKER_RE.exec(line.trim());
    if (m) {
      flush();
      blocks.push({ kind: "image", url: m[1] });
    } else buf.push(line);
  }
  flush();
  return (
    <div className={`qe-passage-view ${className}`}>
      {blocks.map((b, i) => {
        if (b.kind === "text") return b.text ? <p key={i} style={{ whiteSpace: "pre-wrap" }}>{b.text}</p> : null;
        const src = resolveImage(b.url);
        return src ? <PassageFigure key={i} url={src} /> : null;
      })}
    </div>
  );
}

export function PassageFigure({ url }) {
  return (
    <div className="qe-passage-figure">
      <GroupImage url={url} alt="Figure in the passage" allowBlob={url.startsWith("blob:")} />
    </div>
  );
}

// Uploads an image chosen by the teacher to images/{teacherId}/…
export async function uploadPassageImage(teacherId, fileOrBlob, name = "image.png") {
  const type = fileOrBlob.type;
  if (!ACCEPTED.includes(type)) throw new Error("Please choose a PNG, JPG, WebP or GIF image.");
  if (fileOrBlob.size > MAX_IMAGE_MB * 1024 * 1024) throw new Error(`This image is larger than ${MAX_IMAGE_MB} MB.`);
  const ext = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" }[type] || (name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `images/${teacherId}/${uid("passage")}.${ext}`;
  const { error } = await supabase.storage.from("assignment-files").upload(path, fileOrBlob, { contentType: type });
  if (error) throw new Error("Upload failed: " + error.message);
  const { data } = supabase.storage.from("assignment-files").getPublicUrl(path);
  return data.publicUrl;
}

// Teacher tools under a passage text box: insert an image where the
// cursor is, and see / remove the images already in the passage.
export function PassageImageTools({ teacherId, text, onChange, textareaId, resolveImage = defaultResolve }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [inputKey, setInputKey] = useState(0);
  const urls = imageUrlsIn(text);

  async function pick(e) {
    const file = e.target.files?.[0];
    setInputKey((k) => k + 1);
    if (!file) return;
    setError("");
    // Remember the cursor before the upload (the text box loses focus).
    const ta = textareaId ? document.getElementById(textareaId) : null;
    const pos = ta && typeof ta.selectionStart === "number" ? ta.selectionStart : String(text || "").length;
    setBusy(true);
    try {
      const url = await uploadPassageImage(teacherId, file, file.name);
      onChange(insertAt(text, pos, imageMarker(url)));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function remove(url) {
    const out = String(text || "")
      .split("\n")
      .filter((l) => l.trim() !== imageMarker(url))
      .join("\n")
      .replace(/\n{3,}/g, "\n\n");
    onChange(out);
  }

  return (
    <div className="qe-pimg-tools">
      <label className={`btn-ghost qe-pimg-add ${busy ? "is-busy" : ""}`}>
        <ImagePlus size={13} /> {busy ? "Uploading…" : "Insert an image at the cursor"}
        <input key={inputKey} type="file" accept={ACCEPTED.join(",")} onChange={pick} disabled={busy} style={{ display: "none" }} />
      </label>
      <span className="field-hint" style={{ margin: 0 }}>Click in the passage where the picture goes (e.g. between two paragraphs), then insert it.</span>
      {urls.length > 0 && (
        <div className="qe-pimg-list">
          {urls.map((u, i) => {
            const src = resolveImage(u);
            return (
              <div key={`${u}-${i}`} className="qe-pimg-item">
                {src ? <img src={src} alt="" /> : <span className="qe-pimg-missing">Image not available</span>}
                <button type="button" className="btn-ghost" onClick={() => remove(u)}><X size={12} /> Remove</button>
              </div>
            );
          })}
        </div>
      )}
      {error && <div className="field-error" style={{ marginTop: 6 }}>{error}</div>}
    </div>
  );
}

// Puts the image line right after the paragraph where the cursor is
// (or between paragraphs), always on a line of its own.
function insertAt(text, pos, marker) {
  const t = String(text || "");
  const after = t.slice(pos);
  // Move to the end of the current line so a word is never cut in two.
  const nl = after.indexOf("\n");
  const cut = nl === -1 ? t.length : pos + nl;
  const head = t.slice(0, cut).replace(/\s+$/, "");
  const tail = t.slice(cut).replace(/^\s+/, "");
  return `${head}${head ? "\n\n" : ""}${marker}${tail ? "\n\n" : ""}${tail}`;
}
