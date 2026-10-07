import { supabase } from "../../supabaseClient";
import { loadAssignmentWork } from "../assignment-hub/assignmentWork";
import { roundHalf } from "../question-engine/writingHtml";
import { examRows } from "./examExport";

// Livraison 78 — what the teacher's exam pages show, read with the
// teacher's OWN rights (the database lets an exam's teachers — its
// creator and the invited ones — read its candidates, copies and marks;
// nobody else). Nothing here writes to the database.
//
// The rules are the SAME as a class (assignmentWork.js, livraison 73):
// handed in, in progress, score, band (the teacher's band if given,
// otherwise the IELTS estimate), Writing "to mark" until its correction
// is published.

// Where an exam stands, with the same rules as the database:
//   0 prepared  — never opened, its opening time not reached;
//   1 open      — opened (button or opening time), not closed, window not over;
//   2 closed    — closed, or its window is over;
//   3 published — results published.
export function examStage(s, now = Date.now()) {
  if (!s) return 0;
  if (s.results_released_at) return 3;
  const opensMs = s.opens_at ? new Date(s.opens_at).getTime() : null;
  const closesMs = s.closes_at ? new Date(s.closes_at).getTime() : null;
  if (s.closed_at) return 2;
  const open = Boolean(s.opened_at) || (opensMs !== null && now >= opensMs);
  if (open && (closesMs === null || now < closesMs)) return 1;
  if (open) return 2;   // the window is over
  return 0;
}
export const STAGE_NAMES = ["Prepared", "Open", "Closed", "Results published"];

export const skillLetter = (type) => ({ Listening: "L", Reading: "R", Writing: "W", Speaking: "S" }[type] || "?");
const scored = (type) => type === "Listening" || type === "Reading" || type === "Writing";

// The Exams list: every exam this teacher runs or was invited to (the
// database decides), with its papers' skills, its candidates and its
// Writing copies waiting for a mark.
export async function loadExamsList() {
  const { data } = await supabase
    .from("exam_sessions")
    .select("id, name, code, created_by, opened_at, closed_at, opens_at, closes_at, results_released_at, created_at, container_class_id")
    .order("created_at", { ascending: false });
  const rows = data || [];
  const ids = rows.map((r) => r.id);
  const boxes = rows.map((r) => r.container_class_id).filter(Boolean);
  const [items, roster] = await Promise.all([
    ids.length ? supabase.from("exam_session_items").select("session_id, assignment_id, order_index, assignments(type)").in("session_id", ids) : { data: [] },
    boxes.length ? supabase.from("roster").select("class_id, student_id").in("class_id", boxes) : { data: [] },
  ]);
  const papers = new Map();
  for (const it of items.data || []) {
    if (!papers.has(it.session_id)) papers.set(it.session_id, []);
    papers.get(it.session_id).push({ id: it.assignment_id, order: it.order_index, type: it.assignments?.type || "" });
  }
  for (const list of papers.values()) list.sort((a, b) => a.order - b.order);
  const people = new Map();
  for (const r of roster.data || []) {
    if (!people.has(r.class_id)) people.set(r.class_id, new Set());
    people.get(r.class_id).add(r.student_id);
  }

  // Writing copies handed in by a candidate still in the exam, whose
  // correction is not published yet.
  const writingIds = [...papers.values()].flat().filter((p) => p.type === "Writing").map((p) => p.id);
  // waiting = "assignment|student" pairs: a copy handed in, correction not published.
  const waiting = new Set();
  let marksOk = true;
  if (writingIds.length) {
    const [wr, fb] = await Promise.all([
      supabase.from("writing_responses").select("assignment_id, student_id, submitted_at").in("assignment_id", writingIds).not("submitted_at", "is", null),
      supabase.from("assignment_feedback").select("assignment_id, student_id, released_at").in("assignment_id", writingIds),
    ]);
    if (wr.error || fb.error) marksOk = false;
    const published = new Set((fb.data || []).filter((f) => f.released_at).map((f) => `${f.assignment_id}|${f.student_id}`));
    for (const w of wr.data || []) {
      const k = `${w.assignment_id}|${w.student_id}`;
      if (!published.has(k)) waiting.add(k);
    }
  }
  // Counted per exam, only for candidates still enrolled in it.
  const toMarkOf = (r) => {
    const inExam = people.get(r.container_class_id) || new Set();
    const mine = new Set((papers.get(r.id) || []).filter((p) => p.type === "Writing").map((p) => p.id));
    let n = 0;
    for (const k of waiting) { const [a, s] = k.split("|"); if (mine.has(a) && inExam.has(s)) n++; }
    return n;
  };
  return {
    marksOk,
    exams: rows.map((r) => ({
      ...r,
      papers: papers.get(r.id) || [],
      candidates: (people.get(r.container_class_id) || new Set()).size,
      toMark: toMarkOf(r),
      stage: examStage(r),
    })),
  };
}

// One exam's grid: one row per candidate, one cell per paper — status,
// times, score, band — with the class rules (loadAssignmentWork).
export async function loadExamGrid(items, roster) {
  const papers = items.filter((it) => it.assignment);
  const works = await Promise.all(papers.map((it) => loadAssignmentWork({ assignment: it.assignment, roster, structured: it.structured !== false })));
  const cells = {};   // `${studentId}|${assignmentId}` -> row of assignmentWork
  papers.forEach((it, i) => {
    for (const r of works[i].rows) cells[`${r.id}|${it.assignment_id}`] = { ...r, total: works[i].total };
  });
  return cells;
}

const num = (b) => (b === null || b === undefined || b === "" || isNaN(Number(b)) ? null : Number(b));

// A candidate's overall band: the average of the bands of the scored
// papers (Listening, Reading, Writing), rounded like IELTS (to the nearest
// half band, .25 and .75 going up). Only when EVERY scored paper has a band.
export function overallBand(papers, cellOf) {
  const list = papers.filter((p) => scored(p.assignment?.type));
  if (list.length === 0) return null;
  const bands = list.map((p) => num(cellOf(p)?.band));
  if (bands.some((b) => b === null)) return null;
  return roundHalf(bands.reduce((s, b) => s + b, 0) / bands.length);
}

export function average(values) {
  const v = values.map(num).filter((x) => x !== null);
  if (v.length === 0) return null;
  return roundHalf(v.reduce((s, x) => s + x, 0) / v.length);
}

export const fmtBand = (b) => (num(b) === null ? "—" : Number(b).toFixed(1));

// The results as a CSV file (opens in Excel: UTF-8 with its mark, ";"
// would be locale-dependent, so commas and quotes everywhere).
export function resultsCsv(examName, papers, candidates, cellOf) {
  const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const head = ["Candidate"];
  for (const p of papers) {
    const t = p.assignment?.type || "Paper";
    const name = `${t} — ${p.assignment?.title || ""}`;
    if (t === "Listening" || t === "Reading") head.push(`${name} (score)`, `${name} (band)`);
    else if (t === "Writing") head.push(`${name} (band)`);
    else head.push(`${name} (viewed)`);
  }
  head.push("Overall band");
  const lines = [head.map(q).join(",")];
  for (const c of candidates) {
    const row = [c.name];
    for (const p of papers) {
      const cell = cellOf(c.id, p);
      const t = p.assignment?.type;
      if (t === "Listening" || t === "Reading") {
        row.push(cell?.score ? `${cell.score.earned}/${cell.score.total ?? "?"}` : "", num(cell?.band) === null ? "" : Number(cell.band).toFixed(1));
      } else if (t === "Writing") {
        row.push(num(cell?.band) === null ? (cell?.status === "to-mark" ? "to mark" : "") : Number(cell.band).toFixed(1));
      } else {
        row.push(cell?.status === "viewed" ? "yes" : "");
      }
    }
    const o = overallBand(papers, (p) => cellOf(c.id, p));
    row.push(o === null ? "" : o.toFixed(1));
    lines.push(row.map(q).join(","));
  }
  return "﻿" + lines.join("\r\n") + "\r\n";
}

export function downloadText(filename, text, type = "text/csv;charset=utf-8") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// "1 h 12 min", "41 min", "less than a minute".
export function left(ms) {
  if (ms <= 0) return "time over";
  const m = Math.floor(ms / 60000);
  if (m < 1) return "less than a minute";
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}`;
}

// Livraison 91 — for the Exams list: everything one exam's results need, with the same
// reads (and the same rights) as the exam page. Read only.
export async function loadExamForExport(session) {
  const [{ data: items }, { data: papers }, { data: roster }] = await Promise.all([
    supabase.from("exam_session_items").select("id, assignment_id, order_index").eq("session_id", session.id).order("order_index"),
    supabase.from("assignments").select("id, title, type, time_limit_minutes, created_at, listening_audio_url, listening_exam_mode").eq("class_id", session.container_class_id),
    supabase.from("roster").select("student_id, profiles(name)").eq("class_id", session.container_class_id),
  ]);
  const byId = new Map((papers || []).map((a) => [a.id, a]));
  const list = (items || []).map((x) => ({ ...x, assignment: byId.get(x.assignment_id) || null })).filter((x) => x.assignment);
  const ids = list.map((x) => x.assignment_id);
  const { data: secs } = ids.length ? await supabase.from("exam_sections").select("assignment_id").in("assignment_id", ids) : { data: [] };
  const withContent = new Set((secs || []).map((s) => s.assignment_id));
  const candidates = (roster || []).map((x) => ({ id: x.student_id, name: x.profiles?.name || "Student" }));
  const grid = await loadExamGrid(list.map((it) => ({ ...it, structured: withContent.has(it.assignment_id) })), candidates);
  const cellOf = (sid, it) => grid[`${sid}|${it.assignment_id}`];
  return { name: session.name, rows: examRows(list, candidates, cellOf) };
}
