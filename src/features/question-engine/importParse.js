// =====================================================================
// Test importer — rule-based reading of a pasted IELTS Reading or
// Listening test (no AI, runs entirely in the teacher's browser).
//
//   parseTest(text, skill)      → parts + question groups (raw lines)
//   analyseGroup(group, skill)  → detected type, questions, layout, issues
//   parseAnswerKey(text)        → { number: "raw answer" }
//   resolveAnswers(analysis, answers) → per question: DB key or error
//   buildGroupRows(analysis, resolved, skill) → rows ready to insert
//
// Nothing here talks to the database. Everything is re-computed from
// the (editable) text, so the teacher can fix any line in the preview
// and the result updates immediately.
// =====================================================================

import { FORM_INSTRUCTION, FLOWCHART_INSTRUCTION, WORDBANK_INSTRUCTION, SHORT_ANSWER_INSTRUCTION, defaultInstructionFor, defaultInstructionForMatching } from "./bulkParse";

export const IMPORT_TYPES = [
  { value: "tfng", label: "True / False / Not Given" },
  { value: "ynng", label: "Yes / No / Not Given" },
  { value: "mcq", label: "Multiple choice — one answer" },
  { value: "multi", label: "Multiple choice — several answers" },
  { value: "headings", label: "Matching headings" },
  { value: "info", label: "Matching information (paragraph letter)" },
  { value: "features", label: "Matching features / list of options" },
  { value: "endings", label: "Matching sentence endings" },
  { value: "notes", label: "Note completion" },
  { value: "table", label: "Table completion" },
  { value: "form", label: "Form completion" },
  { value: "flowchart", label: "Flow-chart completion" },
  { value: "sentences", label: "Sentence completion" },
  { value: "summary", label: "Summary completion (write the words)" },
  { value: "wordbank", label: "Summary completion (list of words)" },
  { value: "short", label: "Short-answer questions" },
  { value: "map", label: "Map / plan labelling (letters)" },
  { value: "diagram", label: "Diagram labelling (words)" },
  { value: "unknown", label: "— Choose the type —" },
];

const COMPLETION_TYPES = new Set(["notes", "table", "form", "flowchart", "sentences", "summary", "wordbank"]);
const LETTER_TYPES = new Set(["info", "features", "endings", "map"]);
export const isCompletionType = (t) => COMPLETION_TYPES.has(t);

const ROMAN = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x", "xi", "xii", "xiii", "xiv", "xv", "xvi", "xvii", "xviii", "xix", "xx"];
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const COUNT_WORDS = { two: 2, three: 3, four: 4, five: 5 };

// A gap: ___ (3+), ..... (4+ dots), …… (2+ ellipsis chars) or a mix.
const GAP_SRC = "(?:_{3,}|[.…](?:\\s?[.…]){3,}|…{2,})";
const GAP_RE = new RegExp(GAP_SRC);
const GAP_RE_G = new RegExp(GAP_SRC, "g");

// ---------------------------------------------------------------------
// 1) Clean-up of pasted text
// ---------------------------------------------------------------------
const PROTECTED_LINE = /^(true|false|not given|yes|no|questions?\b|write|choose|complete|answer|nb\b|example|list of|[a-z]\b|[ivx]+\b|\d)/i;

export function normalizeText(raw) {
  let lines = String(raw || "")
    .replace(/\r\n?/g, "\n")
    .replace(/ *\t+ */g, " | ") // table cells copied from Word are separated by tabs
    .replace(/[\u00a0\u2000-\u200b\u202f\u3000]/g, " ")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .split("\n")
    .map((l) => l.replace(/ {2,}/g, " ").trim());

  // Page numbers and repeated page footers/headers ("SIMULATION 1/BCDE/NHMH").
  const counts = {};
  for (const l of lines) if (l) counts[l] = (counts[l] || 0) + 1;
  lines = lines.filter((l) => {
    if (!l) return true;
    if (/^page\s*\d+(\s*(of|\/)\s*\d+)?$/i.test(l)) return false;
    if (/^\d{1,3}\s*(of|\/)\s*\d{1,3}$/i.test(l)) return false;
    if (/^-\s*\d{1,3}\s*-$/.test(l)) return false;
    if (/^simulation\b/i.test(l)) return false;
    // (a line of symbols only, such as a flow-chart arrow "↓", is never a footer)
    if (counts[l] >= 3 && l.length <= 80 && /[A-Za-z0-9]/.test(l) && !PROTECTED_LINE.test(l)) return false;
    return true;
  });

  // A number alone on its line belongs to the next line ("1" / "The fence…").
  const merged = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^\(?\d{1,2}[.)]?$/.test(l)) {
      let j = i + 1;
      while (j < lines.length && !lines[j]) j++;
      if (j < lines.length && !/^\(?\d{1,2}[.)]?$/.test(lines[j]) && !/^questions?\b/i.test(lines[j])) {
        merged.push(`${l.replace(/[()]/g, "").replace(/[.)]$/, "")} ${lines[j]}`);
        i = j;
        continue;
      }
    }
    merged.push(l);
  }

  // "… into a 7" / "……… Later…": a question number at the end of a line
  // belongs to the gap that starts the next line.
  for (let i = 0; i < merged.length - 1; i++) {
    if (/\b\d{1,2}$/.test(merged[i]) && new RegExp(`^${GAP_SRC}`).test(merged[i + 1])) {
      merged[i] = `${merged[i]} ${merged[i + 1]}`;
      merged.splice(i + 1, 1);
    }
  }

  // Re-join lines that were wrapped in the middle of a sentence
  // (next line starts with a small letter and isn't a roman numeral).
  const out = [];
  for (const l of merged) {
    const prev = out[out.length - 1];
    if (
      prev &&
      l &&
      prev.length >= 40 &&
      /^[a-z]/.test(l) &&
      !/^(i{1,3}|iv|vi{0,3}|ix|xi{0,3}|x)[.)]?\s/.test(l) &&
      !/[.!?:;")]$/.test(prev) &&
      !GAP_RE.test(prev.slice(-6))
    ) {
      out[out.length - 1] = `${prev} ${l}`;
    } else {
      out.push(l);
    }
  }
  return out;
}

// ---------------------------------------------------------------------
// 2) Parts and question groups
// ---------------------------------------------------------------------
// A new part starts only on a heading line: "READING PASSAGE 2",
// "PASSAGE 2 – Title", "SECTION 1 Questions 1-10". A sentence such as
// "Reading Passage 2 has 7 paragraphs A-G" is an instruction, not a part.
// Reading uses PASSAGE (or PART); SECTION is only used in Listening.
const PART_RE_READING = /^(?:reading\s+passage|passage|part)\s*(\d{1,2})\b\s*(.*)$/i;
const PART_RE_LISTENING = /^(?:section|part)\s*(\d{1,2})\b\s*(.*)$/i;
function partHeading(line, skill) {
  const m = (skill === "listening" ? PART_RE_LISTENING : PART_RE_READING).exec(line);
  if (!m) return null;
  const rest = m[2].trim();
  if (rest === "" || /^questions?\s+\d/i.test(rest)) return { rest };
  // "PASSAGE 1 – The History of Glass" / "PASSAGE 1: …"
  const sep = /^[:.\-–—]\s*(.*)$/.exec(rest);
  if (sep) return { rest: sep[1] };
  return null;
}
const GROUP_RE = /^questions?\s+(\d{1,2})(?:\s*(?:[-–—]|to|and|&)\s*(\d{1,2}))?(?![\d])[\s:.,]*(.*)$/i;
const DROP_LINE = /^(you should spend about|(academic|general training)?\s*(reading|listening)(\s+test)?(\s*\d+)?$|test\s*\d+$)/i;

function numberedItemIn(lines, start, end) {
  return lines.some((l) => {
    const m = /^\(?(\d{1,2})\)?[.)]?\s+\S/.exec(l);
    return m && +m[1] >= start && +m[1] <= end;
  });
}

let groupSeq = 0;
function newGroup(start, end, introLines) {
  groupSeq += 1;
  return { id: `g${groupSeq}-${start}`, start, end, lines: [...(introLines || [])] };
}

export function parseTest(text, skill = "reading") {
  const lines = normalizeText(text);
  const parts = [];
  let part = null;
  let group = null;
  let umbrella = null;
  let lastEnd = 0;

  const openPart = (title) => {
    part = { id: `p${parts.length + 1}`, title: title || "", preamble: [], groups: [] };
    parts.push(part);
    group = null;
    umbrella = null;
  };

  for (const line of lines) {
    if (DROP_LINE.test(line)) continue;

    const pm = partHeading(line, skill);
    if (pm) {
      openPart(line);
      const rest = pm.rest;
      // "SECTION 1 Questions 1-10" — the range is only a heading here;
      // the real groups follow. It becomes a group only if none do.
      const gm = GROUP_RE.exec(rest);
      if (gm) {
        const s = +gm[1];
        const e = gm[2] ? +gm[2] : s;
        if (s > lastEnd) {
          group = newGroup(s, e);
          if (gm[3]) group.lines.push(gm[3]);
          part.groups.push(group);
          lastEnd = e;
        }
      }
      continue;
    }

    if (!part) openPart("");

    const gm = GROUP_RE.exec(line);
    if (gm) {
      const s = +gm[1];
      const e = gm[2] ? Math.max(+gm[2], s) : s;
      const last = part.groups[part.groups.length - 1];
      const nested = last && s >= last.start && e <= last.end && !(s === last.start && e === last.end);
      if (nested && !numberedItemIn(last.lines, last.start, last.end)) {
        // "Questions 21-24" followed by "Questions 21 and 22": the outer
        // one only carries shared instructions.
        umbrella = { start: last.start, end: last.end, lines: last.lines };
        part.groups.pop();
        lastEnd = s - 1;
      }
      const inUmbrella = umbrella && s >= umbrella.start && e <= umbrella.end;
      if (s > lastEnd || inUmbrella) {
        if (!inUmbrella) umbrella = null;
        group = newGroup(s, e, inUmbrella ? umbrella.lines : []);
        if (gm[3]) group.lines.push(gm[3]);
        part.groups.push(group);
        lastEnd = Math.max(lastEnd, e);
        continue;
      }
    }

    if (group) group.lines.push(line);
    else part.preamble.push(line);
  }

  // Finalise: passage text for Reading, clean line lists for groups.
  return parts
    .filter((p) => p.groups.length > 0 || p.preamble.some(Boolean))
    .map((p, pi) => {
      const groups = p.groups.map((g) => ({
        id: g.id,
        start: g.start,
        end: g.end,
        source: trimBlankLines(fillListNumbers(g.lines, g.start, g.end)).join("\n"),
        type: null, // null = automatic detection
        imageUrl: "",
        lastLetter: "",
      }));
      let passage = skill === "reading" ? trimBlankLines(p.preamble) : [];
      // Reading passages that sit after a group (e.g. after a list of
      // headings) are moved from the group into the passage.
      if (skill === "reading") {
        for (const g of groups) {
          const { keep, spill } = splitPassageSpill(g.source.split("\n"), g.start, g.end);
          if (spill.length) {
            g.source = trimBlankLines(keep).join("\n");
            passage = passage.concat(passage.length ? [""] : [], spill);
          }
        }
      }
      const { title, body } = takeTitle(trimBlankLines(passage));
      return {
        id: `part-${pi + 1}`,
        heading: p.title,
        passageTitle: title,
        passageText: paragraphs(body),
        audioUrl: "",
        maxPlays: "",
        groups,
      };
    });
}

// Word's automatic list numbers are lost in the file ("# " lines, see
// fileExtract.js): they are filled in from the group's range, but only
// when the count matches, so nothing is ever guessed wrongly.
function fillListNumbers(lines, start, end) {
  const count = lines.filter((l) => /^# /.test(l)).length;
  if (count === 0) return lines;
  let n = start;
  const fits = count === end - start + 1;
  return lines.map((l) => (/^# /.test(l) ? (fits ? `${n++} ${l.slice(2)}` : `• ${l.slice(2)}`) : l));
}

function trimBlankLines(lines) {
  let a = 0;
  let b = lines.length;
  while (a < b && !lines[a]) a++;
  while (b > a && !lines[b - 1]) b--;
  return lines.slice(a, b);
}

// Joins lines into paragraphs separated by a blank line.
function paragraphs(lines) {
  const out = [];
  for (const l of lines) {
    if (!l) {
      if (out.length && out[out.length - 1] !== "") out.push("");
    } else out.push(l);
  }
  return trimBlankLines(out)
    .join("\n")
    .replace(/\n(?!\n)/g, "\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function takeTitle(lines) {
  const first = lines[0] || "";
  if (first && first.length <= 90 && !/[.:]$/.test(first) && lines.length > 1 && first.split(/\s+/).length <= 12) {
    return { title: first, body: lines.slice(1) };
  }
  return { title: "", body: lines };
}

// Long prose lines after the last question of a group are the passage.
function splitPassageSpill(lines, start, end) {
  let lastItemIdx = -1;
  lines.forEach((l, i) => {
    const m = /^\(?(\d{1,2})\)?[.)]?\s+/.exec(l);
    if (m && +m[1] >= start && +m[1] <= end) lastItemIdx = i;
    const gaps = l.match(new RegExp(`(\\d{1,2})\\s*${GAP_SRC}`, "g")) || [];
    if (gaps.some((g) => +g.match(/\d+/)[0] === end)) lastItemIdx = i;
  });
  if (lastItemIdx < 0) return { keep: lines, spill: [] };
  for (let i = lastItemIdx + 1; i < lines.length; i++) {
    const l = lines[i];
    if (!l) continue;
    const next = lines.slice(i + 1).find(Boolean) || "";
    const prose = (s) => s.length >= 150 && !GAP_RE.test(s);
    if (prose(l) || (l.length < 90 && prose(next))) {
      return { keep: lines.slice(0, i), spill: lines.slice(i) };
    }
  }
  return { keep: lines, spill: [] };
}

// ---------------------------------------------------------------------
// 3) One group: instructions, type, questions
// ---------------------------------------------------------------------
const INSTR_RE = /^(complete|choose|write|answer|do the following|in boxes|on your answer sheet|true\b|false\b|not given|yes\b|no\b|label|match|which|classify|look at|reading passage|the (reading )?(text|passage) has|you may use|nb\b|using no more|circle|select|what does|what do|what did|according to|one word|no more than|for each answer|identify|use the information|the (flow.?chart|table|diagram|map|plan|notes?|summary|form|sentences?|list|text|passage|boxes?)\b.*\b(below|above)\b)/i;

function splitInstruction(lines, start) {
  const instr = [];
  let i = 0;
  for (; i < lines.length; i++) {
    const l = lines[i];
    if (!l) continue;
    const num = /^\(?(\d{1,2})\)?[.)]?\s+/.exec(l);
    if (num && +num[1] === start) break;
    if (!INSTR_RE.test(l)) break;
    instr.push(l);
  }
  return { instruction: instr, body: lines.slice(i).filter((l) => l !== undefined) };
}

// Paragraph labels of a passage, in order: "A", "A Chapter 1",
// "Paragraph B", "C." … Only a run A, B, C… counts, so a sentence that
// starts with the article "A" alone never makes a list.
export function paragraphLetters(passageText) {
  const found = [];
  for (const raw of String(passageText || "").split("\n")) {
    const l = raw.trim();
    const m = /^(?:[Pp]aragraph\s+)?([A-Z])(?:[.):]?\s*$|[.):]\s+|\s+(?=[Cc]hapter\b|[Ss]ection\b|[Pp]aragraph\b|[A-Z]))/.exec(l);
    if (!m) continue;
    const letter = m[1].toUpperCase();
    if (letter === LETTERS[found.length]) found.push(letter);
  }
  return found.length >= 2 ? found : null;
}

function letterRange(text) {
  const m = /\b([A-Z])\s*(?:[-–—]|to)\s*([A-Z])\b/.exec(text);
  if (!m) return null;
  const a = LETTERS.indexOf(m[1]);
  const b = LETTERS.indexOf(m[2]);
  return a === 0 && b > 0 ? LETTERS.slice(0, b + 1) : null;
}

export function detectType(instructionText, bodyLines, start, end) {
  const t = instructionText.toLowerCase();
  const items = bodyLines.filter((l) => {
    const m = /^\(?(\d{1,2})\)?[.)]?\s+\S/.exec(l);
    return m && +m[1] >= start && +m[1] <= end;
  }).length;
  const gaps = bodyLines.join("\n").match(GAP_RE_G)?.length || 0;

  if (/not given/.test(t) && /\byes\b/.test(t)) return { type: "ynng" };
  if (/not given/.test(t)) return { type: "tfng" };
  if (/label the (map|plan)/.test(t)) return { type: "map" };
  if (/label the diagram/.test(t)) return { type: letterRange(instructionText) && /letter/.test(t) ? "map" : "diagram" };
  if (/heading/.test(t)) return { type: "headings" };
  if (/correct ending|sentence endings?/.test(t)) return { type: "endings" };
  if (/complete the (summary|paragraph)/.test(t)) {
    return { type: /list of (words|phrases)|from the box|box below|correct letter|[a-z]\s*[-–]\s*[a-z],? below/.test(t) || /letters?,?\s+a\s*[-–]/.test(t) ? "wordbank" : "summary" };
  }
  if (/complete the form/.test(t)) return { type: "form" };
  if (/flow.?chart/.test(t)) return { type: "flowchart" };
  if (/complete the table/.test(t)) return { type: "table" };
  if (/complete the notes?/.test(t)) return { type: "notes" };
  if (/complete the sentences?|complete each sentence/.test(t)) return { type: "sentences" };
  const countWord = /choose (two|three|four|five)\b/.exec(t);
  if (countWord && items < 2) return { type: "multi" };
  if (/which paragraph|which section|paragraphs?,? [a-z]\s*[-–]|contains the following information/.test(t)) return { type: "info" };
  if (/choose the correct (letter|answer)|circle the correct|choose (a|b|c)\b/.test(t) && !/next to questions|from the box|list of/.test(t)) return { type: "mcq" };
  if (/match|classify|list of|from the box|next to questions|correct letter/.test(t)) return { type: "features" };
  if (/answer the questions?/.test(t)) return { type: "short" };
  // Weak guesses — shown in orange so the teacher checks them.
  if (gaps > 0) return { type: "summary", weak: true };
  if (items > 0) return { type: "short", weak: true };
  return { type: "unknown" };
}

// Numbered items ("14 The fence was…") with optional lettered choices.
function parseItems(lines, start, end, { choices = false, roman = false, letters = false } = {}) {
  const items = [];
  const options = [];
  const pre = [];
  let expected = start;
  let current = null;

  const clean = lines.map((x) => x.trim()).filter(Boolean);
  for (let li = 0; li < clean.length; li++) {
    const l = clean[li];
    const num = /^\(?(\d{1,2})\)?[.)]?\s+(.*)$/.exec(l);
    if (num && +num[1] === expected && expected <= end) {
      current = { number: expected, prompt: num[2].trim(), choices: [] };
      items.push(current);
      expected += 1;
      continue;
    }
    if (roman) {
      const r = /^(x{0,1}(?:ix|iv|v?i{0,3}))[.)]?\s+(\S.*)$/i.exec(l);
      if (r && r[1] && ROMAN.includes(r[1].toLowerCase())) {
        options.push({ letter: r[1].toLowerCase(), text: r[2].trim() });
        continue;
      }
    }
    if (choices || letters) {
      const opts = splitLetterOptions(l);
      if (opts) {
        if (choices && current && expected <= end + 1 && !letters) current.choices.push(...opts);
        else options.push(...opts);
        continue;
      }
    }
    // A short title just above a list ("List of Groups", "Comments") is not part of a question.
    const nextLine = clean[li + 1] || "";
    const isListTitle =
      /^list of\b/i.test(l) ||
      (l.split(/\s+/).length <= 5 && !/[.?]$/.test(l) && ((letters || choices) ? /^[A-Z](?:[.)]\s*|\s+)\S/.test(nextLine) : roman && /^[ivx]+[.)]?\s/i.test(nextLine)));
    if (isListTitle) continue;
    if (current && !/^(example|answer)\b/i.test(l)) current.prompt = `${current.prompt} ${l}`.trim();
    else if (!current) pre.push(l);
  }
  for (const it of items) it.prompt = it.prompt.replace(GAP_RE_G, " ").replace(/\s{2,}/g, " ").trim();
  return { items, options, pre };
}

// "A text" or "A. text" or several on one line ("A red B blue C green").
function splitLetterOptions(line) {
  const first = /^([A-Z])(?:[.)]\s*|\s+)(\S.*)$/.exec(line);
  if (!first) return null;
  const parts = [];
  const re = /(?:^|\s)([A-Z])(?:[.)]\s*|\s+)(?=\S)/g;
  let m;
  const marks = [];
  while ((m = re.exec(line))) marks.push({ letter: m[1], at: m.index + (m[0].startsWith(" ") ? 1 : 0), end: re.lastIndex });
  // Only split on letters that follow each other (A, B, C…).
  const seq = [];
  for (const mk of marks) {
    const want = seq.length === 0 ? first[1] : LETTERS[LETTERS.indexOf(seq[seq.length - 1].letter) + 1];
    if (mk.letter === want) seq.push(mk);
  }
  if (seq.length <= 1) return [{ letter: first[1], text: first[2].trim() }];
  for (let i = 0; i < seq.length; i++) {
    const text = line.slice(seq[i].end, i + 1 < seq.length ? seq[i + 1].at : undefined).trim();
    if (!text) return [{ letter: first[1], text: first[2].trim() }];
    parts.push({ letter: seq[i].letter, text });
  }
  return parts;
}

// Replaces every gap by ___ in reading order, removing the question
// number written next to it. Returns the numbers found in order.
function convertGaps(lines, start) {
  let expected = start;
  const numbers = [];
  const out = lines.map((line) => {
    let l = line;
    if (!GAP_RE.test(l)) return l;
    // "14 The researchers found that ………" — number at the start of the line.
    const lead = /^\(?(\d{1,2})\)?[.)]?\s+/.exec(l);
    if (lead && +lead[1] === expected) l = l.slice(lead[0].length);
    l = l.replace(new RegExp(`(?:\\(\\s*(\\d{1,2})\\s*\\)|\\b(\\d{1,2}))?\\s*${GAP_SRC}`, "g"), (m, a, b) => {
      const n = a || b;
      if (n && +n !== expected) {
        // A number that isn't this gap's (a price, a date…) stays in the text.
        numbers.push(expected++);
        return `${m.slice(0, m.search(/\s*(?:_|…|\.)/))} ___ `;
      }
      numbers.push(expected++);
      return " ___ ";
    });
    return l
      .replace(/ {2,}/g, " ")
      .replace(/___ ([.,;:!?)])/g, "___$1")
      .trim();
  });
  return { lines: out, numbers };
}

function notesBlocks(lines) {
  const blocks = [];
  const content = lines.filter(Boolean);
  content.forEach((l, i) => {
    const bullet = /^[•●▪◦○·*\-–]\s*(.+)$/.exec(l);
    if (bullet) return blocks.push({ type: "bullet", text: bullet[1] });
    const short = l.length <= 60 && !l.includes("___") && !/[.,;]$/.test(l);
    if (i === 0 && short) return blocks.push({ type: "h2", text: l.replace(/:$/, "") });
    if (short && content[i + 1] && /^[•●▪◦○·*\-–]/.test(content[i + 1])) return blocks.push({ type: "h3", text: l.replace(/:$/, "") });
    return blocks.push({ type: "p", text: l });
  });
  return blocks;
}

// "Type | Role | Life span" lines (cells separated by | or tabs) → table.
function tablePayload(lines) {
  // A line without cells right after a row is the rest of that row's last
  // cell (text that wrapped onto a second line in a PDF).
  const rowsRaw = [];
  for (const l of lines.filter(Boolean)) {
    if (l.includes("|")) rowsRaw.push(l.replace(/^\||\|$/g, "").split("|").map((c) => c.trim()));
    else if (rowsRaw.length) {
      const last = rowsRaw[rowsRaw.length - 1];
      last[last.length - 1] = `${last[last.length - 1]} ${l}`.trim();
    }
  }
  if (rowsRaw.length < 2) return null;
  const width = Math.max(...rowsRaw.map((r) => r.length));
  const pad = (r) => [...r, ...Array(width - r.length).fill("")];
  let header = null;
  let body = rowsRaw;
  if (!rowsRaw[0].some((c) => c.includes("___"))) {
    header = pad(rowsRaw[0]);
    body = rowsRaw.slice(1);
  }
  const gapInFirst = body.some((r) => (r[0] || "").includes("___"));
  if (gapInFirst) {
    return { style: "table", headers: header || Array(width).fill(""), rows: body.map((r) => ({ label: "", cells: pad(r) })) };
  }
  return {
    style: "table",
    headers: (header || Array(width).fill("")).slice(1),
    rows: body.map((r) => ({ label: r[0] || "", cells: pad(r).slice(1) })),
  };
}

function formPayload(lines) {
  const content = lines.filter(Boolean);
  let title = "";
  if (content[0] && !content[0].includes(":") && !content[0].includes("___") && content[0].length <= 60) title = content.shift();
  const rows = [];
  let exampleNext = false;
  for (const raw of content) {
    let l = raw;
    if (/^example\s*(answer)?$/i.test(l)) {
      exampleNext = true;
      continue;
    }
    let example = exampleNext;
    exampleNext = false;
    const ex = /^example\s*[:\-–—]?\s*/i.exec(l);
    if (ex) {
      example = true;
      l = l.slice(ex[0].length);
    }
    if (example && l.includes("___")) example = false;
    const colon = l.indexOf(":");
    if (colon > 0) rows.push({ label: l.slice(0, colon).trim(), value: l.slice(colon + 1).trim(), example });
    else rows.push({ label: "", value: l, example });
  }
  return { title, rows };
}

function sentenceList(lines) {
  const out = [];
  for (const l of lines.filter(Boolean)) {
    if (l.includes("___") || out.length === 0) out.push(l);
    else out[out.length - 1] = `${out[out.length - 1]} ${l}`;
  }
  return out.filter((s) => s.includes("___"));
}

function wordBankSplit(lines) {
  const text = [];
  const options = [];
  for (const l of lines.filter(Boolean)) {
    const opts = !l.includes("___") ? splitLetterOptions(l) : null;
    if (opts && (options.length > 0 || opts.length > 1 || opts[0].letter === "A")) options.push(...opts);
    else if (!/^(list of|words?|options?)\b/i.test(l) || l.includes("___")) text.push(l);
  }
  return { text: text.join(" ").replace(/\s{2,}/g, " ").trim(), options: dedupeLetters(options) };
}

// Removes repeated letters and puts the list back in order (lists printed
// in 2–3 columns are read row by row: A, D, B, E…).
function dedupeLetters(options) {
  const seen = new Set();
  const rank = (l) => (ROMAN.includes(l) ? ROMAN.indexOf(l) : LETTERS.indexOf(l));
  return options.filter((o) => (seen.has(o.letter) ? false : (seen.add(o.letter), true))).sort((a, b) => rank(a.letter) - rank(b.letter));
}

// Cells separated by " | " (tabs from Word/PDF columns). Outside a table,
// a line whose cells each start with a label ("A …", "iv …", "12 …") is
// split into one line per cell; any other line is simply re-joined.
const CELL_LABEL = /^(\(?\d{1,2}\)?[.)]?\s|[A-Z](?:[.)]\s*|\s+)\S|[ivx]{1,5}[.)]?\s|[•●▪◦○·*\-–])/;
function unpipe(lines) {
  const out = [];
  for (const l of lines) {
    if (!l.includes("|")) {
      out.push(l);
      continue;
    }
    const cells = l.split("|").map((c) => c.trim()).filter(Boolean);
    if (cells.length > 1 && cells.every((c) => CELL_LABEL.test(c))) out.push(...cells);
    else out.push(cells.join(" "));
  }
  return out;
}

// context.passageText: the part's passage, used to find paragraph letters.
export function analyseGroup(group, skill = "reading", context = {}) {
  const rawLines = String(group.source || "").split("\n").map((l) => l.trim());
  const { start, end } = group;
  const expectedCount = end - start + 1;
  // The type is detected on the text read line by line; only a table
  // keeps its "|" cells (see unpipe).
  let lines = unpipe(rawLines);
  let { instruction, body } = splitInstruction(lines, start);
  // Type keywords are searched in every line above the first question,
  // not only in the lines recognised as instructions.
  const firstItem = body.findIndex((l) => {
    const m = /^\(?(\d{1,2})\)?[.)]?\s+\S/.exec(l);
    return (m && +m[1] === start) || GAP_RE.test(l);
  });
  const head = firstItem < 0 ? [] : body.slice(0, firstItem);
  const detected = detectType([instruction.join("\n"), ...head].join("\n"), body, start, end);
  const type = group.type || detected.type;
  if (type === "table") {
    lines = rawLines;
    ({ instruction, body } = splitInstruction(lines, start));
  }
  const instructionText = instruction.join("\n");
  const issues = [];
  if (!group.type && detected.weak) issues.push({ level: "warn", msg: "Type guessed from the layout — please check it." });

  const result = {
    type,
    detectedType: detected.type,
    start,
    end,
    instruction: instructionText,
    questions: [], // { number, prompt, dbType, options }
    payload: null, // completion layout (JSON for question_groups.passage_text)
    letters: null,
    issues,
    needsImage: type === "map" || type === "diagram",
  };

  if (!lines.some(Boolean)) {
    issues.push({ level: "error", msg: "The text of this group is empty — a line above may have been read as a new part. Paste the questions in \"Edit the text of this group\"." });
    return result;
  }
  if (type === "unknown") {
    issues.push({ level: "error", msg: "Type not recognised — choose it in the list." });
    return result;
  }

  if (COMPLETION_TYPES.has(type)) {
    const { lines: conv, numbers } = convertGaps(body, start);
    const qs = numbers.map((n, i) => ({ number: n, prompt: `Gap ${i + 1}`, dbType: "gap_fill", options: type === "wordbank" ? { word_bank: true } : {} }));
    const table = type === "table" ? tablePayload(conv) : null;
    if (table) {
      result.payload = table;
    } else if (type === "notes" || type === "table") {
      result.payload = { style: "notes", blocks: notesBlocks(conv) };
      if (type === "table") issues.push({ level: "warn", msg: "Table columns not found (put | or tabs between cells) — shown as notes." });
    } else if (type === "form") {
      result.payload = { style: "form", ...formPayload(conv) };
    } else if (type === "flowchart") {
      const steps = conv.filter(Boolean).map((l) => l.replace(/^[↓→▼⬇>]+\s*/, "")).filter((l) => l && !/^[↓→▼⬇|]+$/.test(l));
      result.payload = { style: "flowchart", title: "", steps };
      // The first line is a title (not a box) when it is written like one,
      // or when arrows link the boxes but none follows that first line.
      const raw = conv.filter(Boolean);
      const isArrow = (l) => /^[↓→▼⬇]/.test(l);
      const arrowAfterFirst = raw[1] ? isArrow(raw[1]) : false;
      const looksLikeTitle = (l) => /:$/.test(l) || (l === l.toUpperCase() && /[A-Z]/.test(l)) || (raw.some(isArrow) && !arrowAfterFirst);
      if (steps[0] && !steps[0].includes("___") && steps[0].length <= 60 && steps.length > 2 && looksLikeTitle(steps[0])) {
        result.payload.title = steps[0].replace(/:$/, "");
        result.payload.steps = steps.slice(1);
      }
    } else if (type === "sentences") {
      result.payload = { style: "sentences", sentences: sentenceList(conv) };
    } else if (type === "summary") {
      const c = conv.filter(Boolean);
      const title = c[0] && !c[0].includes("___") && c[0].length <= 60 && c.length > 1 ? c.shift() : "";
      result.payload = { style: "paragraph", text: (title ? `${title} — ` : "") + c.join(" ").replace(/\s{2,}/g, " ") };
    } else if (type === "wordbank") {
      const wb = wordBankSplit(conv);
      result.payload = { style: "wordbank", text: wb.text, options: wb.options };
      result.letters = wb.options.map((o) => o.letter);
      if (wb.options.length < 2) issues.push({ level: "error", msg: "The list of words (A, B, C…) was not found." });
    }
    result.questions = qs;
    const shown = countShownGaps(result.payload);
    if (qs.length !== expectedCount) issues.push({ level: "error", msg: `Found ${qs.length} gap${qs.length === 1 ? "" : "s"}, expected ${expectedCount} (Questions ${start}–${end}).` });
    else if (shown !== qs.length) issues.push({ level: "error", msg: "Some gaps are outside the text — check the lines." });
    return result;
  }

  if (type === "multi") {
    const { items, options, pre } = parseItems(body, start, end, { letters: true });
    const countWord = /choose (two|three|four|five)\b/i.exec(instructionText);
    const required = expectedCount > 1 ? expectedCount : COUNT_WORDS[countWord?.[1]?.toLowerCase()] || 2;
    let prompt = pre.join(" ").trim() || items.map((i) => i.prompt).join(" ").trim();
    if (!prompt) {
      const q = [...instruction].reverse().find((l) => /^(which|what)\b/i.test(l));
      if (q) {
        prompt = q;
        result.instruction = instruction.filter((l) => l !== q).join("\n");
      }
    }
    const choices = dedupeLetters(options);
    result.questions = [{ number: start, prompt: prompt || "Choose the correct answers.", dbType: "multiple_selection", options: { choices, required_count: required }, points: required, slots: required }];
    result.letters = choices.map((c) => c.letter);
    if (choices.length < required + 1) issues.push({ level: "error", msg: "The answer options (A, B, C…) were not found." });
    if (!prompt) issues.push({ level: "warn", msg: "Question text not found." });
    return result;
  }

  if (type === "mcq") {
    const { items } = parseItems(body, start, end, { choices: true });
    result.questions = items.map((it) => ({ number: it.number, prompt: it.prompt, dbType: "multiple_choice", options: { choices: dedupeLetters(it.choices) } }));
    items.forEach((it) => {
      if (it.choices.length < 2) issues.push({ level: "error", msg: `Question ${it.number}: options A, B, C… not found.` });
    });
  } else if (type === "tfng" || type === "ynng") {
    const { items } = parseItems(body, start, end);
    result.questions = items.map((it) => ({ number: it.number, prompt: it.prompt, dbType: "true_false_not_given", options: { label_set: type === "ynng" ? "yes_no" : "true_false" } }));
  } else if (type === "headings") {
    const { items, options } = parseItems(body, start, end, { roman: true });
    const choices = options;
    result.letters = choices.map((c) => c.letter);
    result.questions = items.map((it) => ({ number: it.number, prompt: it.prompt, dbType: "matching_headings", options: { choices } }));
    if (choices.length < 2) issues.push({ level: "error", msg: "The list of headings (i, ii, iii…) was not found." });
  } else if (LETTER_TYPES.has(type)) {
    const { items, options } = parseItems(body, start, end, { letters: type !== "info" && type !== "map" });
    let choices = dedupeLetters(options);
    if (type === "info" || type === "map" || choices.length === 0) {
      const override = group.lastLetter && LETTERS.includes(group.lastLetter) ? LETTERS.slice(0, LETTERS.indexOf(group.lastLetter) + 1) : null;
      const range =
        override ||
        letterRange([instructionText, ...head].join(" ")) ||
        (type === "info" ? paragraphLetters(context.passageText) : null);
      if (range) choices = range.map((l) => ({ letter: l, text: "" }));
      else if (choices.length === 0) {
        choices = LETTERS.slice(0, 8).map((l) => ({ letter: l, text: "" }));
        issues.push({ level: "warn", msg: "Letter range not found — using A–H. Change the last letter if needed." });
      }
    }
    const announced = letterRange([instructionText, ...head].join(" "));
    if (type !== "info" && type !== "map" && options.length > 0 && announced && announced.length !== choices.length) {
      issues.push({ level: "warn", msg: `The instructions say A–${announced[announced.length - 1]} but the list has A–${choices[choices.length - 1].letter}. Check the list of options.` });
    }
    result.letters = choices.map((c) => c.letter);
    const dbType = { info: "matching_information", features: "matching_features", endings: "matching_sentence_endings", map: "matching_map_labelling" }[type];
    result.questions = items.map((it) => ({ number: it.number, prompt: it.prompt, dbType, options: { choices } }));
    if (choices.length < 2) issues.push({ level: "error", msg: "The list of options (A, B, C…) was not found." });
  } else if (type === "short" || type === "diagram") {
    const { items } = parseItems(body, start, end);
    result.questions = items.map((it) => ({
      number: it.number,
      prompt: it.prompt || (type === "diagram" ? `Label ${it.number}` : ""),
      dbType: "gap_fill",
      options: type === "diagram" ? { labelling: true } : { short_answer: true },
    }));
  }

  const found = result.questions.length;
  if (found !== expectedCount) {
    issues.push({ level: "error", msg: `Found ${found} question${found === 1 ? "" : "s"}, expected ${expectedCount} (Questions ${start}–${end}).` });
  }
  result.questions.forEach((q) => {
    if (!q.prompt) issues.push({ level: "error", msg: `Question ${q.number}: text is empty.` });
  });
  return result;
}

function countShownGaps(payload) {
  if (!payload) return 0;
  const n = (s) => (String(s || "").match(/_{3,}/g) || []).length;
  switch (payload.style) {
    case "notes":
      return payload.blocks.reduce((a, b) => a + n(b.text), 0);
    case "table":
      return payload.rows.reduce((a, r) => a + r.cells.reduce((b, c) => b + n(c), 0), 0);
    case "form":
      return payload.rows.filter((r) => !r.example).reduce((a, r) => a + n(r.value), 0);
    case "flowchart":
      return payload.steps.reduce((a, s) => a + n(s), 0);
    case "sentences":
      return payload.sentences.reduce((a, s) => a + n(s), 0);
    default:
      return n(payload.text);
  }
}

export function defaultImportInstruction(analysis) {
  const t = analysis.type;
  const lastLetter = analysis.letters?.[analysis.letters.length - 1] || "H";
  if (t === "form") return FORM_INSTRUCTION;
  if (t === "flowchart") return FLOWCHART_INSTRUCTION;
  if (t === "wordbank") return WORDBANK_INSTRUCTION;
  if (t === "short") return SHORT_ANSWER_INSTRUCTION;
  if (t === "tfng") return defaultInstructionFor("true_false_not_given", { label_set: "true_false" });
  if (t === "ynng") return defaultInstructionFor("true_false_not_given", { label_set: "yes_no" });
  if (t === "mcq") return defaultInstructionFor("multiple_choice", analysis.questions[0]?.options || {});
  if (t === "multi") return defaultInstructionFor("multiple_selection", analysis.questions[0]?.options || {});
  if (t === "map") return `Label the map below.\nWrite the correct letter, A–${lastLetter}, next to each question.`;
  if (t === "diagram") return "Label the diagram below.\nWrite NO MORE THAN TWO WORDS for each answer.";
  if (t === "headings") return defaultInstructionForMatching("matching_headings");
  if (t === "info") return defaultInstructionForMatching("matching_information");
  if (t === "features") return defaultInstructionForMatching("matching_features");
  if (t === "endings") return defaultInstructionForMatching("matching_sentence_endings");
  return "Complete the text below.\nWrite NO MORE THAN TWO WORDS for each answer.";
}

// ---------------------------------------------------------------------
// 4) Answer key
// ---------------------------------------------------------------------
const KEY_LINE = /^\(?(\d{1,2})\)?(?:\s*(?:[-–&,]|and)\s*(\d{1,2}))?\s*[.):\-–]?\s+(\S.*)$/i;

function cleanKeyAnswer(a) {
  return a
    .replace(/\(?\s*(in\s+)?either\s+order\s*\)?/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s:;,.–-]+|[\s;,]+$/g, "")
    .trim();
}

export function parseAnswerKey(text) {
  const map = {};
  const lines = String(text || "")
    .replace(/\r\n?/g, "\n")
    // Keys printed in columns (PDF/Word tables) come as cells: one per line.
    .split(/\n|\t+|\s\|\s/)
    .map((l) => l.trim())
    .filter(Boolean);
  const put = (a, b, ans) => {
    const v = cleanKeyAnswer(ans);
    if (!v) return;
    for (let n = a; n <= (b || a); n++) map[n] = map[n] ? `${map[n]}, ${v}` : v;
  };

  const lineMatches = lines.filter((l) => KEY_LINE.test(l));
  const lineMode = lineMatches.length >= 2 && lineMatches.length >= lines.filter((l) => /\d/.test(l)).length * 0.6;
  if (lineMode) {
    for (const l of lineMatches) {
      const m = KEY_LINE.exec(l);
      // Several answers on the same line: "1 TRUE 2 FALSE"
      const inner = scanKey(`${m[1]} ${m[3]}`, +m[1]);
      if (!m[2] && Object.keys(inner).length > 1) Object.entries(inner).forEach(([n, v]) => put(+n, null, v));
      else put(+m[1], m[2] ? +m[2] : null, m[3]);
    }
    return map;
  }
  Object.entries(scanKey(lines.join(" "))).forEach(([n, v]) => put(+n, null, v));
  return map;
}

// Reads "1 TRUE 2 FALSE 3 NOT GIVEN 4 B 5 12" in order: a number starts
// the next answer only if it is the next question number AND the
// current answer is not empty (so "5 6 6 river" = 5 → "6", 6 → "river").
function scanKey(text, firstNumber) {
  const tokens = text.split(/\s+/).filter(Boolean);
  const out = {};
  let current = null;
  let buf = [];
  const flush = () => {
    if (current !== null && buf.length) out[current.a] = { b: current.b, v: buf.join(" ") };
  };
  for (const tok of tokens) {
    const m = /^\(?(\d{1,2})\)?(?:[-–&](\d{1,2}))?[.):]?$/.exec(tok);
    const n = m ? +m[1] : null;
    const next = current === null ? (firstNumber ?? n) : (current.b ?? current.a) + 1;
    if (m && n === next && (current === null || buf.length > 0)) {
      flush();
      current = { a: n, b: m[2] ? +m[2] : null };
      buf = [];
    } else if (current !== null) {
      buf.push(tok);
    }
  }
  flush();
  const flat = {};
  for (const [a, { b, v }] of Object.entries(out)) {
    for (let n = +a; n <= (b || +a); n++) flat[n] = v;
  }
  return flat;
}

// "(the) river / riverside OR river bank" → accepted answers.
export function keyAlternatives(raw) {
  const s = String(raw || "").trim();
  if (!s) return [];
  const pieces = [];
  let cur = "";
  const chunks = s.split(/(\s+or\s+|\/)/i);
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i];
    if (/^\s+or\s+$/i.test(c)) {
      pieces.push(cur);
      cur = "";
    } else if (c === "/") {
      const before = cur.trim();
      const after = (chunks[i + 1] || "").trim();
      if (/\d$/.test(before) && /^\d/.test(after)) cur += "/"; // 15/06 stays one answer
      else {
        pieces.push(cur);
        cur = "";
      }
    } else cur += c;
  }
  pieces.push(cur);
  const out = [];
  for (const p of pieces) for (const v of expandOptional(p.trim().replace(/^["']|["']$/g, ""))) if (v && !out.some((o) => o.toLowerCase() === v.toLowerCase())) out.push(v);
  return out;
}

function expandOptional(text) {
  const m = /\(([^()]+)\)|\[([^[\]]+)\]/.exec(text);
  if (!m) return [text.replace(/\s{2,}/g, " ").trim()];
  const inner = m[1] ?? m[2];
  const before = text.slice(0, m.index);
  const after = text.slice(m.index + m[0].length);
  return [...expandOptional(before + inner + after), ...expandOptional(before + after)].map((v) => v.replace(/\s{2,}/g, " ").trim());
}

// ---------------------------------------------------------------------
// 5) Answers → database keys (with validation)
// ---------------------------------------------------------------------
function tfValue(raw, labelSet) {
  const v = String(raw || "").trim().toLowerCase().replace(/[^a-z ]/g, "").replace(/\s+/g, " ");
  if (!v) return null;
  if (labelSet === "yes_no") {
    if (v === "yes" || v === "y") return "positive";
    if (v === "no" || v === "n") return "negative";
  } else {
    if (v === "true" || v === "t") return "positive";
    if (v === "false" || v === "f") return "negative";
  }
  if (v === "not given" || v === "ng" || v === "notgiven") return "not_given";
  return undefined;
}

// answers: { [number]: string } — returns one entry per question.
export function resolveAnswers(analysis, answers) {
  return analysis.questions.map((q) => {
    const raw = String(answers[q.number] ?? "").trim();
    const fail = (msg) => ({ number: q.number, key: null, error: msg });
    if (q.dbType === "multiple_selection") {
      const need = q.options.required_count;
      const all = [];
      for (let n = analysis.start; n <= analysis.end; n++) all.push(String(answers[n] ?? ""));
      const letters = [...new Set(all.join(" ").toUpperCase().match(/\b[A-Z]\b/g) || [])];
      if (letters.length === 0) return fail("Answer missing");
      if (letters.length !== need) return fail(`Give ${need} letters (found ${letters.length})`);
      const bad = letters.find((l) => !analysis.letters?.includes(l));
      if (bad) return fail(`${bad} is not one of the options`);
      return { number: q.number, key: letters.sort(), error: "" };
    }
    if (!raw) return fail("Answer missing");
    if (q.dbType === "true_false_not_given") {
      const v = tfValue(raw, q.options.label_set);
      if (!v) return fail(q.options.label_set === "yes_no" ? "Use YES, NO or NOT GIVEN" : "Use TRUE, FALSE or NOT GIVEN");
      return { number: q.number, key: v, error: "" };
    }
    if (q.dbType === "matching_headings") {
      const v = raw.toLowerCase().replace(/[^ivx]/g, "");
      if (!analysis.letters?.includes(v)) return fail("Use a heading number (i, ii, iii…)");
      return { number: q.number, key: v, error: "" };
    }
    if (q.dbType === "multiple_choice" || q.dbType.startsWith("matching_")) {
      const v = (raw.toUpperCase().match(/\b[A-Z]\b/) || [])[0];
      const valid = q.dbType === "multiple_choice" ? q.options.choices.map((c) => c.letter) : analysis.letters || [];
      if (!v || !valid.includes(v)) return fail(`Use one letter: ${valid.join(", ")}`);
      return { number: q.number, key: v, error: "" };
    }
    // gap_fill
    if (q.options?.word_bank) {
      const v = (raw.toUpperCase().match(/\b[A-Z]\b/) || [])[0];
      if (!v || !analysis.letters?.includes(v)) return fail(`Use one letter from the list: ${(analysis.letters || []).join(", ")}`);
      return { number: q.number, key: [v], error: "" };
    }
    const alts = keyAlternatives(raw);
    if (alts.length === 0) return fail("Answer missing");
    return { number: q.number, key: alts, error: "" };
  });
}

// Everything needed to insert one group, in order.
export function buildGroupRows(analysis, resolved, skill) {
  const byNumber = Object.fromEntries(resolved.map((r) => [r.number, r]));
  return {
    instruction: (analysis.instruction || "").trim() || defaultImportInstruction(analysis),
    passageText: analysis.payload
      ? analysis.payload.style === "paragraph"
        ? analysis.payload.text
        : JSON.stringify(analysis.payload)
      : null,
    questions: analysis.questions.map((q) => ({
      row: { type: q.dbType, skill, prompt: q.prompt, options: q.options, ...(q.points ? { points: q.points } : {}) },
      key: byNumber[q.number]?.key,
    })),
  };
}

// Number of answer slots a group takes (a "choose TWO" counts as 2).
export function analysisSlots(analysis) {
  return analysis.questions.reduce((a, q) => a + (q.slots || 1), 0);
}
