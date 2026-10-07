import { buildXlsx, colName, sheetName, sheetRef, XLSX_TYPE } from "../../lib/xlsxWriter.js";

// Livraison 91 — the exam results as an Excel file, like the school's own
// sheet: Name, Programme, Group, Reading, Listening, Writing, Speaking,
// Average, each band coloured Achieved / Approaching / Not achieved.
//   - Programme and Group are left empty (a student can be in several
//     classes): the teacher fills them in if needed.
//   - Speaking is empty (it is marked face to face): the teacher types the
//     band, and the Average and the colours follow by themselves.
//   - Average = the bands filled in, averaged and rounded like IELTS (to the
//     nearest half band; .25 and .75 go up) — an Excel formula.
//   - The two thresholds sit in the sheet: change them there, every colour
//     follows.
// Everything is read with the teacher's OWN rights (the same reads as the
// exam page), nothing is written to the database.

export const SKILLS = ["Reading", "Listening", "Writing"];
const num = (b) => (b === null || b === undefined || b === "" || isNaN(Number(b)) ? null : Number(b));
export const ieltsRound = (x) => Math.round(x * 2 + 1e-9) / 2;

// One line per candidate: the band of each skill (several papers of one
// skill are averaged), exactly what the Results tab shows.
export function examRows(papers, candidates, cellOf) {
  return candidates.map((c) => {
    const bands = {};
    for (const skill of SKILLS) {
      const list = papers
        .filter((p) => p.assignment?.type === skill)
        .map((p) => {
          const cell = cellOf(c.id, p);
          if (!cell?.open) return null;
          if (skill === "Writing") return num(cell.band);
          return cell.score ? num(cell.band) : null;
        })
        .filter((b) => b !== null);
      bands[skill] = list.length ? ieltsRound(list.reduce((s, b) => s + b, 0) / list.length) : null;
    }
    return { name: c.name, bands };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

const fmtDate = (d) => d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
const avgOf = (vals) => { const v = vals.filter((x) => x !== null); return v.length ? ieltsRound(v.reduce((s, x) => s + x, 0) / v.length) : ""; };
const averageFormula = (from, to, r) => `IF(COUNT(${from}${r}:${to}${r})=0,"",ROUND(AVERAGE(${from}${r}:${to}${r})*2,0)/2)`;

// The legend under the table, with the two thresholds the colours use.
function legend(rows, startRow, labelCol, th) {
  const r1 = startRow, r2 = startRow + 1, r3 = startRow + 2;
  const L = labelCol;
  const pad = (n) => Array.from({ length: n }, () => null);
  rows.push([...pad(L), { v: "Achieved", s: "keyGreen" }, { v: "from band", s: "label" }, { v: th.achieved, s: "threshold" }]);
  rows.push([...pad(L), { v: "Approaching", s: "keyAmber" }, { v: "from band", s: "label" }, { v: th.approaching, s: "threshold" }]);
  rows.push([...pad(L), { v: "Not achieved", s: "keyRed" }, { v: "below", s: "label" }, { f: `${colName(L + 2)}${r2}`, v: th.approaching, s: "band" }]);
  return { achievedRef: `$${colName(L + 2)}$${r1}`, approachingRef: `$${colName(L + 2)}$${r2}`, lastRow: r3 };
}

function colourRules(range, firstCell, refs) {
  return [
    { range, color: "green", formula: `AND(ISNUMBER(${firstCell}),${firstCell}>=${refs.achievedRef})` },
    { range, color: "amber", formula: `AND(ISNUMBER(${firstCell}),${firstCell}>=${refs.approachingRef})` },
    { range, color: "red", formula: `ISNUMBER(${firstCell})` },
  ];
}

const NOTES = [
  "Speaking: type each band (0 to 9). The Average and the colours update by themselves.",
  "Average: the bands filled in, averaged and rounded like IELTS (to the nearest 0.5).",
  "Change the two yellow thresholds to recolour the whole sheet.",
  "Bands: the teacher's band if given, otherwise the IELTS estimate from the score.",
];

// One exam = one sheet. Returns the sheet and where each candidate's band
// cells are, so the « All results » sheet can point to them.
function examSheet(exam, th, usedNames, exportedOn) {
  const name = sheetName(exam.name, usedNames);
  const rows = [];
  const HEAD = ["Name", "Programme", "Group", "Reading", "Listening", "Writing", "Speaking", "Average"];
  rows.push([{ v: `${exam.name} — Results`, s: "title" }]);
  rows.push([{ v: `Exported ${exportedOn} · ${exam.rows.length} candidate${exam.rows.length === 1 ? "" : "s"}`, s: "subtitle" }]);
  rows.push([]);
  rows.push(HEAD.map((h) => ({ v: h, s: "header" })));
  const first = 5;
  const refs = [];
  exam.rows.forEach((c, i) => {
    const r = first + i;
    const b = c.bands;
    rows.push([
      { v: c.name, s: "text" }, { v: "", s: "text" }, { v: "", s: "text" },
      { v: b.Reading ?? "", s: "band" }, { v: b.Listening ?? "", s: "band" }, { v: b.Writing ?? "", s: "band" },
      { v: "", s: "input" },
      { f: averageFormula("D", "G", r), v: avgOf([b.Reading, b.Listening, b.Writing]), s: "band" },
    ]);
    refs.push({ row: r, name: c.name, bands: b });
  });
  const last = Math.max(first, first + exam.rows.length - 1);
  rows.push([]);
  const lg = legend(rows, rows.length + 1, 0, th);
  rows.push([]);
  for (const n of NOTES) rows.push([{ v: n, s: "note" }]);
  const sheet = {
    name, rows,
    cols: [28, 16, 14, 11, 11, 11, 11, 11],
    freezeRow: 4,
    heights: { 0: 24 },
    merges: ["A1:H1", "A2:H2"],
    cf: exam.rows.length ? colourRules(`D${first}:H${last}`, `D${first}`, lg) : [],
    validations: exam.rows.length ? [{ range: `G${first}:G${last}`, min: 0, max: 9, prompt: "Type the Speaking band (0 to 9)." }] : [],
  };
  return { sheet, refs };
}

// exams = [{ name, rows: examRows(...) }]; th = { achieved, approaching }.
export function buildResultsWorkbook(exams, th) {
  const used = new Set();
  const exportedOn = fmtDate(new Date());
  const sheets = [];
  if (exams.length > 1) used.add("all results");
  const built = exams.map((e) => ({ exam: e, ...examSheet(e, th, used, exportedOn) }));

  if (exams.length > 1) {
    // « All results »: one line per candidate per exam, pointing to the
    // exam's own sheet — fill Speaking there, it shows up here too.
    const rows = [];
    const HEAD = ["Session", "Name", "Programme", "Group", "Reading", "Listening", "Writing", "Speaking", "Average"];
    const total = built.reduce((n, b) => n + b.refs.length, 0);
    rows.push([{ v: "All results", s: "title" }]);
    rows.push([{ v: `Exported ${exportedOn} · ${exams.length} exams · ${total} results — fill Speaking in each exam's own sheet`, s: "subtitle" }]);
    rows.push([]);
    rows.push(HEAD.map((h) => ({ v: h, s: "header" })));
    const first = 5;
    let r = first;
    for (const b of built) {
      const S = sheetRef(b.sheet.name);
      for (const ref of b.refs) {
        const link = (col, cached) => ({ f: `IF(ISNUMBER(${S}!${col}${ref.row}),${S}!${col}${ref.row},"")`, v: cached ?? "", s: "band" });
        const text = (col) => ({ f: `IF(${S}!${col}${ref.row}="","",${S}!${col}${ref.row})`, v: "", s: "text" });
        rows.push([
          { v: b.exam.name, s: "text" }, { v: ref.name, s: "text" }, text("B"), text("C"),
          link("D", ref.bands.Reading), link("E", ref.bands.Listening), link("F", ref.bands.Writing), link("G", null),
          { f: averageFormula("E", "H", r), v: avgOf([ref.bands.Reading, ref.bands.Listening, ref.bands.Writing]), s: "band" },
        ]);
        r++;
      }
    }
    const last = Math.max(first, r - 1);
    rows.push([]);
    const lg = legend(rows, rows.length + 1, 0, th);
    rows.push([]);
    rows.push([{ v: "Speaking, Programme and Group come from each exam's own sheet.", s: "note" }]);
    rows.push([{ v: NOTES[1], s: "note" }]);
    rows.push([{ v: "Change the two yellow thresholds to recolour this sheet.", s: "note" }]);
    sheets.push({
      name: "All results", rows,
      cols: [26, 28, 16, 14, 11, 11, 11, 11, 11],
      freezeRow: 4, heights: { 0: 24 },
      merges: ["A1:I1", "A2:I2"],
      cf: total ? colourRules(`E${first}:I${last}`, `E${first}`, lg) : [],
    });
  }
  for (const b of built) sheets.push(b.sheet);
  return buildXlsx(sheets);
}

// A plain-ASCII file name: some browsers drop a name with accents or « — ».
export const safeFileName = (s, fallback = "exam") =>
  String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9 ._()-]+/g, "-").replace(/\s+/g, " ").trim() || fallback;

export function downloadBytes(filename, bytes, type = XLSX_TYPE) {
  const blob = new Blob([bytes], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
