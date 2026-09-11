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
// Numbered questions only — the one format that reliably tells us
// where one question's options end and the next question begins.

export function parseBulkMultipleChoice(text) {
  const lines = text.split("\n");
  const numberRe = /^\s*(\d+)[.)]\s*(.+?)\s*$/;
  const letterRe = /^\s*([A-Za-z])[.)]?\s+(.+?)\s*$/;

  const questions = [];
  let current = null;

  for (const rawLine of lines) {
    const numMatch = rawLine.match(numberRe);
    if (numMatch) {
      if (current) questions.push(current);
      current = { key: numMatch[1], prompt: numMatch[2], choices: [] };
      continue;
    }
    const letterMatch = rawLine.match(letterRe);
    if (letterMatch && current) {
      current.choices.push({ letter: letterMatch[1].toUpperCase(), text: letterMatch[2] });
    }
  }
  if (current) questions.push(current);

  return questions.filter((q) => q.choices.length >= 2);
}

// ---------- Passage title guess ----------
// Two independent signals, either one is enough: a blank line right
// after the first line, OR the first line simply being short (titles
// are almost always short; real sentences usually aren't). Always
// left editable by the teacher — this is only ever a starting point.

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
  return "";
}
