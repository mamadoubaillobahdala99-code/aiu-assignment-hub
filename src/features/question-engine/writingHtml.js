// Writing text helpers — shared by the student editor now and the teacher
// correction screen later.
//
// SECURITY: a student's text is stored as HTML (for bold / italic /
// underline) and later displayed to the teacher. Anyone could call the
// save function directly with hand-made HTML, so this sanitizer runs
// BOTH when saving AND every time a text is displayed. Only these tags
// survive, with no attributes at all: <p> <br> <b> <i> <u>.
// Teacher corrections (opts.allowMarks) may also contain
//   <mark data-note="…">…</mark>  — a red error mark with an optional note.
// The note is re-escaped and length-limited; nothing else is kept.
// Everything else is either unwrapped (its text kept) or dropped entirely.

const DROP_ENTIRELY = new Set(["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "TEMPLATE", "NOSCRIPT", "SVG", "MATH", "IMG", "VIDEO", "AUDIO", "CANVAS", "INPUT", "TEXTAREA", "SELECT", "BUTTON", "LINK", "META", "HEAD", "TITLE"]);
const BLOCKS = new Set(["P", "DIV", "LI", "H1", "H2", "H3", "H4", "H5", "H6", "BLOCKQUOTE", "PRE", "SECTION", "ARTICLE"]);

export const MAX_NOTE_LENGTH = 500;

function escapeText(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(s) {
  return escapeText(s).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// Inline marks carried by a node — from the tag itself, or from inline
// styles some browsers use instead of <b>/<i>/<u>.
function marksOf(el) {
  const tag = el.tagName;
  const style = el.getAttribute?.("style") || "";
  return {
    b: tag === "B" || tag === "STRONG" || /font-weight\s*:\s*(bold|[6-9]00)/i.test(style),
    i: tag === "I" || tag === "EM" || /font-style\s*:\s*italic/i.test(style),
    u: tag === "U" || /text-decoration[^;]*underline/i.test(style),
  };
}

function walk(node, inBlock, opts, inMark) {
  let out = "";
  for (const child of node.childNodes) {
    if (child.nodeType === 3) {
      out += escapeText(child.nodeValue);
      continue;
    }
    if (child.nodeType !== 1) continue;
    const tag = child.tagName;
    if (DROP_ENTIRELY.has(tag)) continue;
    if (tag === "BR") {
      out += "<br>";
      continue;
    }
    if (BLOCKS.has(tag)) {
      const inner = walk(child, true, opts, inMark);
      out += inBlock ? inner + "<br>" : `<p>${inner || "<br>"}</p>`;
      continue;
    }
    if (tag === "MARK" && opts.allowMarks && !inMark) {
      const note = (child.getAttribute("data-note") || "").slice(0, MAX_NOTE_LENGTH);
      const inner = walk(child, inBlock, opts, true);
      out += note ? `<mark data-note="${escapeAttr(note)}">${inner}</mark>` : `<mark>${inner}</mark>`;
      continue;
    }
    const m = marksOf(child);
    let inner = walk(child, inBlock, opts, inMark);
    if (m.u) inner = `<u>${inner}</u>`;
    if (m.i) inner = `<i>${inner}</i>`;
    if (m.b) inner = `<b>${inner}</b>`;
    out += inner;
  }
  return out;
}

export function sanitizeWritingHtml(html, opts = {}) {
  if (!html) return "";
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  return walk(doc.body, false, opts, false);
}

// Counts words the way a person would: "don't" and "well-known" are one
// word each, numbers count, punctuation alone doesn't.
export function countWords(text) {
  if (!text) return 0;
  const matches = text.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu);
  return matches ? matches.length : 0;
}

// Plain text of a stored HTML answer (paragraphs → line breaks).
export function writingHtmlToText(html) {
  const doc = new DOMParser().parseFromString(`<body>${sanitizeWritingHtml(html)}</body>`, "text/html");
  doc.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));
  doc.querySelectorAll("p").forEach((p) => p.append("\n"));
  return doc.body.textContent || "";
}

// IELTS-style rounding to the nearest half band (6.25 → 6.5, 6.17 → 6.0).
export function roundHalf(x) {
  return Math.round(x * 2) / 2;
}

// Band for one task: average of the 4 criteria, only when all 4 are given.
export function taskBandFrom(scores) {
  const vals = [scores.ta, scores.cc, scores.lr, scores.gra];
  if (vals.some((v) => v === "" || v === null || v === undefined || isNaN(Number(v)))) return null;
  return roundHalf(vals.reduce((sum, v) => sum + Number(v), 0) / 4);
}

// Overall Writing band: Task 2 counts double — (T1 + 2×T2) / 3.
// With only one task in the assignment, that task's band is the overall band.
export function overallWritingBand(t1, t2, hasT1, hasT2) {
  if (hasT1 && hasT2) return t1 != null && t2 != null ? roundHalf((t1 + 2 * t2) / 3) : null;
  if (hasT1) return t1 ?? null;
  if (hasT2) return t2 ?? null;
  return null;
}
