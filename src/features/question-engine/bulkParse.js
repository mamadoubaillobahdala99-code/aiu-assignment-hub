// All parsing here is deliberately simple and predictable — never
// guessing at meaning, only recognizing clear text patterns. The
// teacher always sees a preview before anything is created.

// ---------- True/False/Not Given bulk parsing ----------
// Tries, in order: numbered lines → blank-line-separated blocks →
// one statement per line. Returns { items, strategy } or empty items
// with a guidance message shown to the teacher if nothing was found.

function byNumbers(text) {
  const items = [];
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*(\d+)[.)]\s*(.+?)\s*$/);
    if (m) items.push({ key: m[1], text: m[2] });
  }
  return items;
}

function byBlankLineBlocks(text) {
  const blocks = text.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  if (blocks.length < 2) return [];
  return blocks.map((b, i) => ({ key: String(i + 1), text: b.replace(/\n/g, " ") }));
}

function byOnePerLine(text) {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  return lines.map((l, i) => ({ key: String(i + 1), text: l }));
}

export function parseBulkTrueFalse(text) {
  if (!text.trim()) return { items: [], strategy: null };
  const byNum = byNumbers(text);
  if (byNum.length >= 2) return { items: byNum, strategy: "numbers" };
  const byBlocks = byBlankLineBlocks(text);
  if (byBlocks.length >= 2) return { items: byBlocks, strategy: "blocks" };
  const byLine = byOnePerLine(text);
  if (byLine.length >= 2) return { items: byLine, strategy: "lines" };
  return { items: [], strategy: null };
}

// ---------- Multiple Choice bulk parsing ----------
// Blank-line-separated blocks (same convention as True/False): within
// each block, any line(s) before the first recognized letter option
// are the prompt, then each letter line becomes an option. No numbering
// required on the prompt, and the letter can be followed by punctuation
// ("A." "A)" "A:") or a space — either is enough, neither is mandatory
// on top of the other. A bare letter glued directly to a word (e.g.
// "Apple") is deliberately NOT treated as an option, to avoid
// mistaking an ordinary sentence for a lettered choice.

export function parseBulkMultipleChoice(text) {
  const blocks = text.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  const letterRe = /^\s*([A-Za-z])(?:[.):]\s*|\s+)(.+?)\s*$/;
  const leadingNumberRe = /^\s*\d+[.)]\s*/;

  const questions = [];
  blocks.forEach((block, bi) => {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    const promptLines = [];
    const choices = [];
    for (const line of lines) {
      const m = line.match(letterRe);
      if (m) {
        choices.push({ letter: m[1].toUpperCase(), text: m[2] });
      } else if (choices.length === 0) {
        promptLines.push(line.replace(leadingNumberRe, ""));
      }
    }
    if (promptLines.length > 0 && choices.length >= 2) {
      questions.push({ key: String(bi + 1), prompt: promptLines.join(" "), choices });
    }
  });

  return questions;
}

// ---------- Passage title guess ----------
// Two independent signals, either one is enough: a blank line right
// after the first line, OR the first line simply being short (titles
// are almost always short; real sentences usually aren't). Always
// left editable by the teacher — this is only ever a starting point.

// ---------- Question numbering slots ----------
// Most questions occupy exactly one number. A "choose N letters"
// multiple_selection question occupies N numbers on the answer sheet
// (e.g. "Questions 22-23" for a 2-letter pick) — one set of checkboxes,
// but N numbered slots, matching how real IELTS answer sheets work.
// Every screen that numbers questions uses this same function, so the
// running count can never drift apart between them.

export function questionSlotCount(question) {
  if (question?.type === "multiple_selection") {
    return question?.options?.required_count || 1;
  }
  return 1;
}

// Given a list of questions and the number the first one starts at,
// returns each question's actual number (accounting for any earlier
// multi-slot questions), the group's overall start/end, and the number
// the *next* group should start at.
export function numberQuestions(questions, startNumber) {
  const numbers = [];
  let n = startNumber;
  for (const q of questions) {
    numbers.push(n);
    n += questionSlotCount(q);
  }
  return { start: startNumber, end: Math.max(startNumber, n - 1), numbers, nextStart: n };
}

export function guessPassageTitle(text) {
  const lines = text.split("\n");
  const firstLine = (lines[0] || "").trim();
  const secondLine = (lines[1] || "").trim();
  if (!firstLine || firstLine.length > 90) return "";
  if (firstLine.endsWith(".")) return ""; // real sentences almost always end with a period

  const hasBlankLineAfter = secondLine === "";
  const wordCount = firstLine.split(/\s+/).filter(Boolean).length;
  const looksShort = wordCount > 0 && wordCount <= 12;

  return hasBlankLineAfter || looksShort ? firstLine : "";
}

// ---------- Auto-generated section instructions ----------

function joinLetters(letters) {
  if (letters.length === 0) return "";
  if (letters.length === 1) return letters[0];
  return letters.slice(0, -1).join(", ") + " or " + letters[letters.length - 1];
}

const NUMBER_WORDS = { 2: "TWO", 3: "THREE", 4: "FOUR", 5: "FIVE", 6: "SIX", 7: "SEVEN", 8: "EIGHT", 9: "NINE", 10: "TEN" };

export function defaultInstructionFor(type, options) {
  if (type === "true_false_not_given") {
    return options?.label_set === "yes_no"
      ? "Do the following statements agree with the views of the writer in the Reading Passage?\nYES if the statement agrees with the views of the writer\nNO if the statement contradicts the views of the writer\nNOT GIVEN if it is impossible to say what the writer thinks about this"
      : "Do the following statements agree with the information given in the Reading Passage?\nTRUE if the statement agrees with the information\nFALSE if the statement contradicts the information\nNOT GIVEN if there is no information on this";
  }
  if (type === "multiple_choice") {
    const letters = (options?.choices || []).map((c) => c.letter);
    return letters.length > 0 ? `Choose the correct letter, ${joinLetters(letters)}.` : "Choose the correct letter.";
  }
  if (type === "multiple_selection") {
    const choices = options?.choices || [];
    const count = options?.required_count || 2;
    const word = NUMBER_WORDS[count] || String(count);
    if (choices.length === 0) return `Choose ${word} letters.`;
    const first = choices[0].letter;
    const last = choices[choices.length - 1].letter;
    return `Choose ${word} letters, ${first}-${last}.`;
  }
  return "";
}

// ---------- Shared blank counting ----------
// Used by every completion style (plain paragraph, Notes, Table) so a
// blank is always exactly "three or more underscores", counted in the
// same order the teacher reads the content, top to bottom, left to right.

export function countBlanksInTexts(texts) {
  return texts.reduce((sum, t) => sum + ((t.match(/_{3,}/g) || []).length), 0);
}

// ---------- Notes (titles + bullets) markdown parsing ----------
// Deliberately tiny: "## " -> title, "### " -> subtitle, "- " -> bullet,
// anything else -> plain paragraph line. Recognized is true only if at
// least one heading or bullet marker was found, so a plain pasted
// paragraph with no markers never gets mistaken for a structured Notes
// completion — the teacher gets a clear "switch to visual builder" exit
// instead of a silently wrong render.

export function parseNotesMarkdown(text) {
  const lines = text.split("\n");
  const blocks = [];
  const warnings = [];
  let recognized = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith("### ")) {
      blocks.push({ type: "h3", text: line.slice(4).trim() });
      recognized = true;
    } else if (line.startsWith("## ")) {
      blocks.push({ type: "h2", text: line.slice(3).trim() });
      recognized = true;
    } else if (line.startsWith("- ")) {
      blocks.push({ type: "bullet", text: line.slice(2).trim() });
      recognized = true;
    } else {
      blocks.push({ type: "p", text: line });
      // This line starts with a marker character but doesn't match the
      // exact "## ", "### " or "- " format — most likely a missing
      // space ("###Features", "-the buses"), which used to fall
      // through silently as plain text with the symbols still showing.
      // Flagged individually so a fix to one line doesn't require
      // hunting through a whole block that otherwise parsed correctly.
      if (/^#{1,3}(?!\s)/.test(line) || /^-(?!\s)/.test(line)) {
        warnings.push(line);
      }
    }
  }

  return { blocks, recognized, warnings };
}

// ---------- Completion payload envelope ----------
// question_groups.passage_text stores one of:
//  - a plain string (legacy Reading paragraph completion, unchanged)
//  - a JSON string { style: "notes", blocks: [...] }
//  - a JSON string { style: "table", headers: [...], rows: [...] }
// Parsing is always tried as JSON first; anything that isn't valid JSON,
// or is JSON without a recognized "style", falls back to the original
// plain-paragraph behavior. This means every one of the reading
// assignments already published keeps rendering exactly as before —
// nothing about existing data changes.

export function parseCompletionPayload(raw) {
  if (!raw) return { style: "paragraph", text: "" };
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && (parsed.style === "notes" || parsed.style === "table" || parsed.style === "sentences")) {
      return parsed;
    }
  } catch {
    // Not JSON — this is the existing plain-paragraph format.
  }
  return { style: "paragraph", text: raw };
}

// ---------- Matching family (Headings / Information / Features / Sentence Endings) ----------
// Two independent paste steps, teacher-facing:
//  1. The shared option bank — one option per line, auto-labelled in
//     order (roman numerals for Headings, letters for everything else).
//  2. The items to match — reuses the exact same numbers→blocks→lines
//     fallback chain already proven for True/False, since it's the
//     same underlying problem ("how many separate things are there").
// Both stay fully editable before anything is created.

const ROMAN_NUMERALS = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x", "xi", "xii", "xiii", "xiv", "xv", "xvi"];

export function parseMatchingOptions(text, labelStyle) {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  return lines.map((line, i) => ({
    letter: labelStyle === "roman" ? ROMAN_NUMERALS[i] || String(i + 1) : String.fromCharCode(65 + i),
    text: line,
  }));
}

export function parseMatchingItems(text) {
  // Same fallback chain as True/False bulk paste — numbered lines,
  // then blank-line blocks, then one per line.
  return parseBulkTrueFalse(text).items;
}

export function defaultInstructionForMatching(matchingType, options) {
  const bank = (options?.choices || []).map((c) => c.text).join(", ");
  if (matchingType === "matching_headings") {
    return `Choose the correct heading for each paragraph from the list of headings below.`;
  }
  if (matchingType === "matching_information") {
    return `Which paragraph contains the following information? Write the correct letter in the box.`;
  }
  if (matchingType === "matching_features") {
    return `Match each statement with the correct option. You may use any letter more than once.`;
  }
  if (matchingType === "matching_sentence_endings") {
    return `Complete each sentence with the correct ending from the box below.`;
  }
  return "";
}

// ---------- Sentence Completion ----------
// Deliberately no syntax to remember — unlike Notes, which needs "- "
// for a bullet, here every non-empty pasted line is automatically its
// own separate numbered sentence. Simplest possible paste for the
// teacher: one sentence per line, each with its own ___ blank(s).

export function parseSentenceCompletion(text) {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  return lines;
}
