import { supabase } from "../../supabaseClient";
import { computeIeltsBand } from "../question-engine/bandConversion";
import { overallBand } from "./examWork";

// Livraison 80 — the candidate's own bands, for the exams whose results
// are PUBLISHED. Read with the candidate's own rights only (row security):
//   - Listening / Reading: the marked answers come back only once the
//     results are published (the exam's « Publish » turns the automatic
//     score on). Band = the teacher's published band, otherwise the IELTS
//     estimate from the score — exactly what the paper's own result page
//     shows (StudentQuestionEngineFeedback).
//   - Writing: the teacher's band, once the correction is published.
//   - Speaking: no band.
// The overall band follows the teacher's rule (examWork.overallBand): the
// average of the Listening / Reading / Writing bands, rounded like IELTS,
// only when every one of them has a band.
// Nothing here writes to the database.
const SCORED = ["Listening", "Reading", "Writing"];

export async function loadMyExamBands(userId, sessionIds) {
  const out = new Map();   // sessionId -> { overall, papers: Map(assignmentId -> { type, band, handed }) }
  if (!userId || !sessionIds.length) return out;

  const { data: items } = await supabase
    .from("exam_session_items")
    .select("session_id, assignment_id, order_index, assignments(id, type, reading_test_type)")
    .in("session_id", sessionIds);
  const list = (items || []).filter((it) => it.assignments);
  const scoredIds = list.filter((it) => SCORED.includes(it.assignments.type)).map((it) => it.assignment_id);

  let answers = [], feedback = [], attempts = [], secs = [], links = [];
  if (scoredIds.length) {
    const [sa, fb, att, sc] = await Promise.all([
      supabase.from("student_answers").select("assignment_id, points_earned, is_correct").eq("student_id", userId).in("assignment_id", scoredIds),
      supabase.from("assignment_feedback").select("assignment_id, band, released_at").eq("student_id", userId).in("assignment_id", scoredIds),
      supabase.from("exam_attempts").select("assignment_id, submitted_at").eq("student_id", userId).in("assignment_id", scoredIds),
      supabase.from("exam_sections").select("id, assignment_id").in("assignment_id", scoredIds),
    ]);
    answers = sa.data || []; feedback = fb.data || []; attempts = att.data || []; secs = sc.data || [];
    const secIds = secs.map((s) => s.id);
    if (secIds.length) {
      const { data } = await supabase.from("assignment_questions").select("section_id, questions(points)").in("section_id", secIds);
      links = data || [];
    }
  }

  const earned = new Map();
  for (const r of answers) earned.set(r.assignment_id, (earned.get(r.assignment_id) || 0) + Number(r.points_earned ?? (r.is_correct ? 1 : 0)));
  const secToA = new Map(secs.map((s) => [s.id, s.assignment_id]));
  const total = new Map();
  for (const l of links) {
    const a = secToA.get(l.section_id);
    if (a) total.set(a, (total.get(a) || 0) + Number(l.questions?.points || 1));
  }
  const released = new Map(feedback.filter((f) => f.released_at).map((f) => [f.assignment_id, f]));
  const handedIn = new Set(attempts.filter((t) => t.submitted_at).map((t) => t.assignment_id));

  for (const sid of sessionIds) {
    const papers = list.filter((it) => it.session_id === sid).sort((a, b) => a.order_index - b.order_index);
    const bands = new Map();
    for (const it of papers) {
      const type = it.assignments.type;
      let band = null;
      const handed = handedIn.has(it.assignment_id) || earned.has(it.assignment_id);
      if (type === "Writing") band = released.get(it.assignment_id)?.band ?? null;
      else if (type === "Listening" || type === "Reading") {
        if (handed) {
          band = released.get(it.assignment_id)?.band
            || computeIeltsBand(earned.get(it.assignment_id) || 0, total.get(it.assignment_id) || 0, type === "Listening" ? "listening" : "reading", it.assignments.reading_test_type);
        }
      }
      bands.set(it.assignment_id, { type, band: band === undefined ? null : band, handed });
    }
    const overall = overallBand(papers.map((it) => ({ id: it.assignment_id, assignment: { type: it.assignments.type } })), (p) => bands.get(p.id));
    out.set(sid, { overall, papers: bands });
  }
  return out;
}
