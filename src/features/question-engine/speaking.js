
// Structured Speaking — shared helpers (teacher builder + student viewer).

export const SPEAKING_PARTS = {
  1: { label: "Part 1", title: "Introduction & interview", field: "Questions", placeholder: "One question per line, e.g.\nDo you work or are you a student?\nWhat do you enjoy most about your studies?" },
  2: { label: "Part 2", title: "Long turn (cue card)", field: "Cue card", placeholder: "Describe a place you visited that you really enjoyed.\n\nYou should say:\n– where it was\n– when you went there\n– what you did there\nand explain why you enjoyed it." },
  3: { label: "Part 3", title: "Discussion", field: "Discussion questions", placeholder: "One question per line, e.g.\nWhy do people like to travel?\nHow has tourism changed in your country?" },
};

export const MAX_DOC_MB = 20;
export const MAX_DOCS_PER_PART = 8;

// Accepted documents: PDF, images, audio, Word (.docx, download only).
const KINDS = [
  { kind: "pdf", exts: ["pdf"], mimes: ["application/pdf"] },
  { kind: "image", exts: ["png", "jpg", "jpeg", "webp"], mimes: ["image/png", "image/jpeg", "image/webp"] },
  { kind: "audio", exts: ["mp3", "m4a", "wav"], mimes: ["audio/mpeg", "audio/mp3", "audio/mp4", "audio/x-m4a", "audio/m4a", "audio/wav", "audio/x-wav", "audio/wave"] },
  { kind: "docx", exts: ["docx"], mimes: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"] },
];

export const DOC_ACCEPT = KINDS.flatMap((k) => k.exts.map((e) => "." + e)).join(",");

export function extOf(name) {
  const m = /\.([a-z0-9]+)$/i.exec(name || "");
  return m ? m[1].toLowerCase() : "";
}

// Returns "pdf" | "image" | "audio" | "docx" | null (not accepted).
export function docKindOf(file) {
  const ext = extOf(file?.name);
  const byExt = KINDS.find((k) => k.exts.includes(ext));
  if (!byExt) return null;
  // The browser's MIME type can be empty on some systems — the extension decides then.
  if (file.type && !byExt.mimes.includes(file.type)) return null;
  return byExt.kind;
}

// Only real https links are ever turned into links / players / frames —
// never "javascript:" or anything else stored by hand in the database.
export function isSafeUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === "https:";
  } catch {
    return false;
  }
}

export function fmtSize(bytes) {
  if (!bytes && bytes !== 0) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Cleans the stored documents list before it is used anywhere.
export function cleanDocuments(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((d) => d && typeof d === "object" && isSafeUrl(d.url) && ["pdf", "image", "audio", "docx"].includes(d.kind))
    .map((d) => ({ name: String(d.name || "Document").slice(0, 200), url: d.url, path: String(d.path || ""), kind: d.kind, size: Number(d.size) || 0 }));
}

// Deletes Speaking documents from storage — only the teacher's own files
// (speaking/<teacherId>/…, also enforced by the storage rule) and only
// when no assignment still points at the file (e.g. a duplicated copy).
// Best effort: a failure here never blocks the teacher.
export async function deleteUnusedSpeakingFiles(supabase, docs, teacherId) {
  for (const d of docs || []) {
    if (!d?.path || !teacherId || !d.path.startsWith(`speaking/${teacherId}/`)) continue;
    const { count, error } = await supabase
      .from("exam_sections")
      .select("id", { count: "exact", head: true })
      // JSON "contains" on the jsonb list (a JS array would be sent as a Postgres array).
      .filter("documents", "cs", JSON.stringify([{ path: d.path }]));
    if (error || (count || 0) > 0) continue;
    await supabase.storage.from("assignment-files").remove([d.path]);
  }
}
