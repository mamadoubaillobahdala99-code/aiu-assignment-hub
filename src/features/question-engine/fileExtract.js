// =====================================================================
// Reads the text of a PDF or Word (.docx) file in the teacher's browser.
// The file is never uploaded or stored: it is read into memory, turned
// into plain text for the importer's text box, then forgotten.
//
// The two readers (pdf.js by Mozilla, mammoth for Word) are loaded only
// when a file is dropped (dynamic import), so no other page of the site
// — and no student — ever downloads them.
// =====================================================================

export const MAX_FILE_MB = 20;
const MAX_IMAGE_MB = 10;
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];

export class ExtractError extends Error {}

function extOf(name) {
  const m = /\.([a-z0-9]+)$/i.exec(name || "");
  return m ? m[1].toLowerCase() : "";
}

// Returns { text, images, skippedImages }. images (Word only) are kept in
// memory: [{ id, blob }], shown in the preview as "[[image:local:<id>]]"
// and uploaded only when the teacher creates the assignment.
export async function extractTextFromFile(file) {
  if (!file) throw new ExtractError("No file selected.");
  if (file.size > MAX_FILE_MB * 1024 * 1024) throw new ExtractError(`This file is larger than ${MAX_FILE_MB} MB.`);
  const ext = extOf(file.name);
  if (ext === "pdf" || file.type === "application/pdf") return { text: await extractPdf(file), images: [], skippedImages: 0 };
  if (ext === "docx") return extractDocx(file);
  if (ext === "txt") return { text: (await file.text()).replace(/\r\n?/g, "\n"), images: [], skippedImages: 0 };
  if (ext === "doc") throw new ExtractError('Old Word files (.doc) can\'t be read. Open the file in Word and use "Save as" → Word Document (.docx).');
  throw new ExtractError("Please choose a PDF, a Word file (.docx) or a text file (.txt).");
}

// ---------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------
async function extractPdf(file) {
  // The "legacy" build of pdf.js works in older browsers too (the normal
  // build needs the very latest Chrome/Firefox/Safari).
  const [pdfjs, worker] = await Promise.all([import("pdfjs-dist/legacy/build/pdf.mjs"), import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url")]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;

  const data = new Uint8Array(await file.arrayBuffer());
  let doc;
  let task;
  try {
    task = pdfjs.getDocument({
      data,
      // Only the text is read: no fonts, no forms, no scripts, no network.
      disableFontFace: true,
      useSystemFonts: false,
      enableXfa: false,
      useWorkerFetch: false,
      disableAutoFetch: true,
      stopAtErrors: false,
    });
    doc = await task.promise;
  } catch (e) {
    task?.destroy();
    if (e?.name === "PasswordException") throw new ExtractError("This PDF is protected by a password. Remove the password or copy the text instead.");
    throw new ExtractError("This PDF could not be opened. Check that the file is not damaged, or copy the text instead.");
  }

  const pages = [];
  try {
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      pages.push(pageLines(content.items, viewport.height));
      page.cleanup();
    }
  } finally {
    // Frees the memory used by the file as soon as its text is read.
    await task.destroy();
  }

  const chars = pages.reduce((a, pg) => a + pg.lines.reduce((b, l) => b + l.text.length, 0), 0);
  if (chars < 40 * pages.length) {
    throw new ExtractError("This PDF seems to be a scan (a picture of the pages), so there is no text to read. Copy the text from the original Word file, or use a PDF made from Word.");
  }
  return assemblePages(pages);
}

// Groups the text pieces of a page into lines (top to bottom, left to right).
function pageLines(items, pageHeight) {
  const pieces = items
    // Spaces are rebuilt from the positions below, so blank pieces (which
    // can stretch across a whole column gap) are ignored.
    .filter((it) => typeof it.str === "string" && it.str.trim().length > 0)
    .map((it) => {
      const size = Math.hypot(it.transform[2], it.transform[3]) || Math.abs(it.transform[3]) || 10;
      return { str: it.str, x: it.transform[4], y: it.transform[5], w: it.width || 0, size };
    });
  pieces.sort((a, b) => b.y - a.y || a.x - b.x);

  const rows = [];
  for (const pc of pieces) {
    const row = rows.find((r) => Math.abs(r.y - pc.y) <= Math.max(2, pc.size * 0.45));
    if (row) row.pieces.push(pc);
    else rows.push({ y: pc.y, pieces: [pc] });
  }
  rows.sort((a, b) => b.y - a.y);

  const lines = rows.map((r) => {
    r.pieces.sort((a, b) => a.x - b.x);
    let text = "";
    let end = null;
    let size = 0;
    for (const pc of r.pieces) {
      size = Math.max(size, pc.size);
      if (end !== null) {
        const gap = pc.x - end;
        // A wide gap separates columns (lists printed in 2–3 columns, tables).
        // …except after a paragraph label ("A", "B.", "Paragraph C"),
        // which starts the paragraph's text.
        if (gap > pc.size * 2.5 && !/^(?:[Pp]aragraph\s+)?[A-Z][.)]?$/.test(text.trim())) text += "\t";
        else if (gap > pc.size * 2.5) text += " ";
        else if (gap > pc.size * 0.15 && !/\s$/.test(text) && !/^\s/.test(pc.str)) text += " ";
      }
      text += pc.str;
      end = pc.x + pc.w;
    }
    const left = r.pieces[0].x;
    return { text: text.replace(/ {2,}/g, " ").trim(), y: r.y, left, right: end, size };
  });
  return { lines: lines.filter((l) => l.text), height: pageHeight };
}

const MARKER = /^(\(?\d{1,2}[.)]?\s|\d{1,2}$|[A-Z][.)]?\s|[ivx]{1,5}[.)]?\s|[•●▪◦○·*\-–↓→▼]|questions?\s+\d|reading passage|passage\s+\d|section\s+\d|part\s+\d|example\b|true\b|false\b|not given\b|yes\b|no\b)/i;

function assemblePages(pages) {
  // Lines repeated at the top or bottom of most pages (headers, footers,
  // page numbers) are removed.
  const key = (t) => t.replace(/\d+/g, "#").toLowerCase();
  const edgeCount = {};
  for (const pg of pages) {
    const edges = new Set();
    for (const l of pg.lines) if (l.y > pg.height * 0.9 || l.y < pg.height * 0.1) edges.add(key(l.text));
    edges.forEach((k) => (edgeCount[k] = (edgeCount[k] || 0) + 1));
  }
  const repeated = (t) => pages.length >= 2 && (edgeCount[key(t)] || 0) >= Math.max(2, Math.ceil(pages.length * 0.5));

  const out = [];
  for (const pg of pages) {
    const lines = pg.lines.filter((l) => {
      const inMargin = l.y > pg.height * 0.9 || l.y < pg.height * 0.1;
      if (inMargin && (repeated(l.text) || /^(page\s*)?\d{1,3}(\s*(of|\/)\s*\d{1,3})?$/i.test(l.text))) return false;
      return true;
    });
    if (lines.length === 0) continue;

    // Typical line spacing and text width on this page.
    const gaps = [];
    for (let i = 1; i < lines.length; i++) gaps.push(lines[i - 1].y - lines[i].y);
    gaps.sort((a, b) => a - b);
    const spacing = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 12;
    const maxRight = Math.max(...lines.map((l) => l.right));
    const minLeft = Math.min(...lines.map((l) => l.left));
    const width = maxRight - minLeft;

    let prev = null;
    for (const l of lines) {
      if (prev) {
        const gap = prev.y - l.y;
        const wrapped = prev.right - minLeft >= width * 0.85 && !prev.text.includes("\t") && !l.text.includes("\t");
        const continues = wrapped && gap <= spacing * 1.35 && !MARKER.test(l.text) && !/[:]$/.test(prev.text);
        if (continues) {
          // Same paragraph: the previous line was cut at the right margin.
          out[out.length - 1] = prev.text.endsWith("-") && /^[a-z]/.test(l.text) ? `${out[out.length - 1].slice(0, -1)}${l.text}` : `${out[out.length - 1]} ${l.text}`;
          prev = { ...l, text: out[out.length - 1] };
          continue;
        }
        if (gap > spacing * 1.6) out.push("");
      }
      out.push(l.text);
      prev = l;
    }
    out.push("");
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

// ---------------------------------------------------------------------
// Word (.docx)
// ---------------------------------------------------------------------
async function extractDocx(file) {
  const mod = await import("mammoth/mammoth.browser.min.js");
  const mammoth = mod.default || mod;
  let html;
  // Pictures of the file (a plant in the passage, a map for Questions
  // 11-15…) are kept in memory at their place. Only web picture formats
  // are kept; Word drawings (EMF/WMF) are counted so the teacher knows.
  const images = [];
  let skippedImages = 0;
  const convertImage = mammoth.images.imgElement(async (image) => {
    const type = (image.contentType || "").toLowerCase();
    if (!IMAGE_TYPES.includes(type)) {
      skippedImages += 1;
      return { src: "" };
    }
    const b64 = await image.read("base64");
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    if (bytes.length > MAX_IMAGE_MB * 1024 * 1024) {
      skippedImages += 1;
      return { src: "" };
    }
    const id = images.length + 1;
    images.push({ id, blob: new Blob([bytes], { type }) });
    return { src: `local:${id}` };
  });
  try {
    const result = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() }, { convertImage, ignoreEmptyParagraphs: false });
    html = result.value;
  } catch {
    throw new ExtractError("This Word file could not be read. Check that it is a real .docx file, or copy the text instead.");
  }

  // DOMParser builds an inert document: nothing in it is ever displayed
  // or executed — only its text is taken.
  const body = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html").body;
  // Each kept picture becomes its own line: [[image:local:<id>]]
  body.querySelectorAll("img").forEach((img) => {
    const src = img.getAttribute("src") || "";
    img.replaceWith(/^local:\d+$/.test(src) ? `\n[[image:${src}]]\n` : "");
  });
  const out = [];
  const text = (el) => (el.textContent || "").replace(/\s+/g, " ").trim();

  const walk = (el) => {
    for (const node of el.children) {
      const tag = node.tagName.toLowerCase();
      if (tag === "table") {
        out.push("");
        for (const tr of node.querySelectorAll("tr")) {
          const cells = [...tr.children].filter((c) => /^t[dh]$/i.test(c.tagName)).map((c) => [...c.querySelectorAll("p")].map(text).filter(Boolean).join(" ") || text(c));
          if (cells.some(Boolean)) out.push(cells.join("\t"));
        }
        out.push("");
      } else if (tag === "ul" || tag === "ol") {
        for (const li of node.children) {
          const nested = [...li.children].filter((c) => /^(ul|ol)$/i.test(c.tagName));
          nested.forEach((n) => n.remove());
          const t = text(li);
          // Word's automatic numbering is not kept in the file: "#" marks
          // an item whose number the importer fills in from "Questions x-y".
          if (t) out.push(tag === "ol" ? `# ${t}` : `• ${t}`);
          nested.forEach((n) => walk({ children: [n] }));
        }
      } else if (/^(p|h[1-6])$/.test(tag)) {
        // Line breaks inside a paragraph (Shift+Enter) stay line breaks.
        node.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));
        const parts = (node.textContent || "").split("\n").map((s) => s.replace(/[ \t]+/g, " ").trim());
        if (parts.every((p) => !p)) out.push("");
        else parts.forEach((p) => out.push(p));
      } else if (node.children.length) {
        walk(node);
      } else {
        const t = text(node);
        if (t) out.push(t);
      }
    }
  };
  walk(body);

  const joined = out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!joined) throw new ExtractError("No text was found in this Word file.");
  return { text: joined, images, skippedImages };
}
