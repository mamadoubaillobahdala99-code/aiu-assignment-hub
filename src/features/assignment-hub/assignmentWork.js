import { supabase } from "../../supabaseClient";
import { numberQuestions } from "../question-engine/bulkParse";
import { computeIeltsBand } from "../question-engine/bandConversion";

// Livraison 73 — what the teacher's page of ONE assignment shows about
// its students: status, when, result — and, for Reading / Listening,
// how each question went.
//
// "Handed in" follows exactly the same rules as the class page (script 44)
// and the student's own screen:
//   - Reading / Listening: has answers, OR the copy is marked handed in
//     (an empty copy handed in still counts, and opens);
//   - Writing: a submitted text; "to mark" until the feedback is published;
//   - Speaking: consult only — "viewed" once opened.
// Everything here is read with the teacher's own rights (row security):
// nothing new is opened to anyone.

const roundHalf = (x) => Math.round(x * 2) / 2;

export async function loadAssignmentWork({ assignment, roster, structured }) {
  const id = assignment.id;
  const type = assignment.type;
  const byStudent = new Map(roster.map((s) => [s.id, { ...s, status: structured ? (type === "Speaking" ? "not-viewed" : "not-started") : "no-content", at: null, startedAt: null, score: null, band: null, bandPublished: false, open: false }]));
  const out = { rows: [], questions: [], total: null };
  if (!structured) { out.rows = [...byStudent.values()]; return out; }

  if (type === "Speaking") {
    const { data: sv } = await supabase.from("speaking_views").select("student_id, first_viewed_at").eq("assignment_id", id);
    for (const v of sv || []) {
      const r = byStudent.get(v.student_id); if (!r) continue;
      r.status = "viewed"; r.at = v.first_viewed_at;
    }
    out.rows = [...byStudent.values()];
    return out;
  }

  const { data: fb } = await supabase.from("assignment_feedback").select("student_id, band, released_at").eq("assignment_id", id);
  const feedback = new Map((fb || []).map((f) => [f.student_id, f]));

  if (type === "Writing") {
    const { data: wr } = await supabase.from("writing_responses").select("student_id, created_at, submitted_at").eq("assignment_id", id);
    for (const w of wr || []) {
      const r = byStudent.get(w.student_id); if (!r) continue;
      if (w.submitted_at) {
        if (!r.at || new Date(w.submitted_at) > new Date(r.at)) r.at = w.submitted_at;
      } else if (!r.startedAt || new Date(w.created_at) < new Date(r.startedAt)) r.startedAt = w.created_at;
    }
    for (const r of byStudent.values()) {
      const f = feedback.get(r.id);
      if (r.at) {
        r.open = true;
        r.bandPublished = Boolean(f?.released_at);
        r.band = f?.band ?? null;
        r.status = r.bandPublished ? "published" : "to-mark";
      } else if (r.startedAt) r.status = "in-progress";
    }
    out.rows = [...byStudent.values()];
    return out;
  }

  // Reading / Listening: the paper's questions, in the paper's order and
  // with its numbers (a multi-answer question takes several numbers).
  const { data: secs } = await supabase.from("exam_sections").select("id, order_index").eq("assignment_id", id);
  const secIds = (secs || []).map((s) => s.id);
  const { data: groups } = secIds.length
    ? await supabase.from("question_groups").select("id, section_id, order_index").in("section_id", secIds)
    : { data: [] };
  const gIds = (groups || []).map((g) => g.id);
  const { data: links } = gIds.length
    ? await supabase.from("assignment_questions").select("group_id, order_index, question_id, questions(id, type, prompt, points, options)").in("group_id", gIds)
    : { data: [] };
  const secOrder = new Map((secs || []).map((s) => [s.id, s.order_index ?? 0]));
  const orderedGroups = [...(groups || [])].sort((a, b) => (secOrder.get(a.section_id) - secOrder.get(b.section_id)) || ((a.order_index ?? 0) - (b.order_index ?? 0)));
  const questions = [];
  let next = 1;
  for (const g of orderedGroups) {
    const qs = (links || []).filter((l) => l.group_id === g.id && l.questions).sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0)).map((l) => l.questions);
    const { numbers, nextStart } = numberQuestions(qs, next);
    qs.forEach((q, i) => questions.push({ ...q, number: numbers[i], correct: 0 }));
    next = nextStart;
  }
  const total = questions.reduce((s, q) => s + (q.points || 1), 0);
  out.total = total || null;

  const [{ data: sa }, { data: att }] = await Promise.all([
    supabase.from("student_answers").select("student_id, question_id, is_correct, points_earned, answered_at").eq("assignment_id", id),
    supabase.from("exam_attempts").select("student_id, started_at, submitted_at").eq("assignment_id", id),
  ]);
  const earned = new Map();
  const lastAnswer = new Map();
  const qById = new Map(questions.map((q) => [q.id, q]));
  for (const a of sa || []) {
    if (!byStudent.has(a.student_id)) continue;
    earned.set(a.student_id, (earned.get(a.student_id) || 0) + Number(a.points_earned ?? (a.is_correct ? 1 : 0)));
    if (a.answered_at && (!lastAnswer.get(a.student_id) || new Date(a.answered_at) > new Date(lastAnswer.get(a.student_id)))) lastAnswer.set(a.student_id, a.answered_at);
    if (a.is_correct && qById.has(a.question_id)) qById.get(a.question_id).correct += 1;
  }
  const attempts = new Map((att || []).map((t) => [t.student_id, t]));
  const skill = type === "Listening" ? "listening" : "reading";
  for (const r of byStudent.values()) {
    const t = attempts.get(r.id);
    const handed = earned.has(r.id) || Boolean(t?.submitted_at);
    if (handed) {
      r.status = "handed-in";
      r.open = true;
      r.at = t?.submitted_at || lastAnswer.get(r.id) || null;
      r.score = { earned: earned.get(r.id) || 0, total: total || null };
      const f = feedback.get(r.id);
      r.band = f?.band ?? computeIeltsBand(r.score.earned, total, skill, assignment.reading_test_type);
      r.bandPublished = Boolean(assignment.auto_release_score || f?.released_at);
    } else if (t?.started_at) {
      r.status = "in-progress";
      r.startedAt = t.started_at;
    }
  }
  out.rows = [...byStudent.values()];
  out.questions = questions;
  return out;
}

// The figures at the top of the page.
export function assignmentStats(type, work) {
  const rows = work.rows;
  const n = rows.length;
  const handed = rows.filter((r) => r.open);
  const inProgress = rows.filter((r) => r.status === "in-progress").length;
  if (type === "Speaking") {
    const viewed = rows.filter((r) => r.status === "viewed").length;
    return { kind: "speaking", viewed, notYet: n - viewed, students: n };
  }
  if (type === "Writing") {
    const toMark = rows.filter((r) => r.status === "to-mark");
    const oldest = toMark.reduce((o, r) => (!o || new Date(r.at) < new Date(o) ? r.at : o), null);
    const bands = handed.map((r) => Number(r.band)).filter((b) => Number.isFinite(b) && b > 0);
    return { kind: "writing", handed: handed.length, students: n, toMark: toMark.length, oldest, avgBand: bands.length ? roundHalf(bands.reduce((a, b) => a + b, 0) / bands.length) : null, marked: bands.length, inProgress };
  }
  const bands = handed.map((r) => Number(r.band)).filter((b) => Number.isFinite(b) && b > 0);
  const avgScore = handed.length ? handed.reduce((s, r) => s + (r.score?.earned || 0), 0) / handed.length : null;
  let hardest = null;
  if (handed.length) {
    for (const q of work.questions) if (!hardest || q.correct < hardest.correct) hardest = q;
  }
  return {
    kind: "paper", handed: handed.length, students: n, inProgress,
    avgBand: bands.length ? roundHalf(bands.reduce((a, b) => a + b, 0) / bands.length) : null,
    avgScore: avgScore === null ? null : Math.round(avgScore * 10) / 10, total: work.total,
    hardest: hardest ? { number: hardest.number, correct: hardest.correct, of: handed.length } : null,
  };
}

// Order of the students table: what needs the teacher first.
const RANK = { "to-mark": 0, "handed-in": 1, published: 1, viewed: 1, "in-progress": 2, "not-started": 3, "not-viewed": 3, "no-content": 3 };
export function sortRows(rows) {
  return [...rows].sort((a, b) => {
    const d = RANK[a.status] - RANK[b.status];
    if (d) return d;
    if (a.status === "to-mark") return new Date(a.at) - new Date(b.at);          // oldest copy first
    if (a.at && b.at) return new Date(b.at) - new Date(a.at);                     // newest first
    return String(a.name).localeCompare(String(b.name));
  });
}

export function plainPrompt(p) {
  const t = String(p || "").replace(/<[^>]*>/g, " ").replace(/\{\{[^}]*\}\}|_{3,}/g, "____").replace(/\s+/g, " ").trim();
  return t.length > 90 ? `${t.slice(0, 88)}…` : t;
}
