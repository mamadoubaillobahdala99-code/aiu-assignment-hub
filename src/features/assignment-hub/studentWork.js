import { supabase } from "../../supabaseClient";
import { dueInfo } from "../../lib/due";

// Livraison 71 — everything a student's pages show about their work, read
// ONCE and the same way everywhere (Home, My assignments, a class).
//
// The status rules are exactly those the student pages used before:
//   - Speaking (consult only): "viewed" once opened, else "to-view";
//   - Writing: a submitted text = "submitted", a saved draft = "in-progress";
//   - Reading / Listening: the attempt row decides ("submitted" /
//     "in-progress"); a submitted paper whose results are published is
//     "graded";
//   - a paper with no Part yet: "pending".
// RESULTS are only what the database lets the student read: their marked
// answers and their feedback come back only once the teacher has
// published them (row security). Nothing here can show a mark earlier.

const DONE = new Set(["submitted", "graded", "viewed"]);
export const isDone = (it) => DONE.has(it.status);

export async function loadStudentWork(userId, { classId } = {}) {
  let q = supabase.from("roster").select("class_id, joined_at, classes(id, name, kind, profiles(name))").eq("student_id", userId);
  if (classId) q = q.eq("class_id", classId);
  const { data: joined } = await q;
  // An exam's private box is not a class and never shows as one.
  const classes = (joined || [])
    .filter((r) => r.classes && r.classes.kind !== "exam")
    .map((r) => ({ id: r.class_id, name: r.classes.name || "Class", teacher: r.classes.profiles?.name || "", joinedAt: r.joined_at }));
  const classIds = classes.map((c) => c.id);
  if (classIds.length === 0) return { classes, items: [] };

  const { data: assignments } = await supabase.from("assignments").select("*").in("class_id", classIds);
  const all = assignments || [];
  const ids = all.map((a) => a.id);
  if (ids.length === 0) return { classes, items: [] };

  const { data: secs } = await supabase.from("exam_sections").select("id, assignment_id").in("assignment_id", ids);
  const structured = new Set((secs || []).map((s) => s.assignment_id));
  const sIds = [...structured];
  const typed = (t) => all.filter((a) => a.type === t && structured.has(a.id)).map((a) => a.id);
  const writingIds = typed("Writing");
  const speakingIds = typed("Speaking");

  const [att, wr, sv, fb, sa] = await Promise.all([
    sIds.length ? supabase.from("exam_attempts").select("assignment_id, started_at, submitted_at").eq("student_id", userId).in("assignment_id", sIds) : { data: [] },
    writingIds.length ? supabase.from("writing_responses").select("assignment_id, submitted_at").eq("student_id", userId).in("assignment_id", writingIds) : { data: [] },
    speakingIds.length ? supabase.from("speaking_views").select("assignment_id, first_viewed_at").eq("student_id", userId).in("assignment_id", speakingIds) : { data: [] },
    sIds.length ? supabase.from("assignment_feedback").select("assignment_id, band, released_at").eq("student_id", userId).in("assignment_id", sIds) : { data: [] },
    // Only published results come back (row security).
    sIds.length ? supabase.from("student_answers").select("assignment_id, points_earned, is_correct").eq("student_id", userId).in("assignment_id", sIds) : { data: [] },
  ]);

  const attempted = new Set(), submitted = new Map();
  for (const r of att.data || []) {
    attempted.add(r.assignment_id);
    if (r.submitted_at) submitted.set(r.assignment_id, r.submitted_at);
  }
  for (const w of wr.data || []) {
    if (w.submitted_at) {
      const prev = submitted.get(w.assignment_id);
      if (!prev || new Date(w.submitted_at) > new Date(prev)) submitted.set(w.assignment_id, w.submitted_at);
    } else attempted.add(w.assignment_id);
  }
  const viewed = new Map((sv.data || []).map((r) => [r.assignment_id, r.first_viewed_at]));
  const released = new Map((fb.data || []).filter((f) => f.released_at).map((f) => [f.assignment_id, f]));

  // Earned points, from the published answers only.
  const earned = new Map();
  for (const r of sa.data || []) {
    earned.set(r.assignment_id, (earned.get(r.assignment_id) || 0) + Number(r.points_earned ?? (r.is_correct ? 1 : 0)));
  }
  // Total points of those papers (questions the student can already read).
  const total = new Map();
  const scored = [...earned.keys()];
  if (scored.length) {
    const secIds = (secs || []).filter((s) => earned.has(s.assignment_id)).map((s) => s.id);
    const secToA = new Map((secs || []).map((s) => [s.id, s.assignment_id]));
    const { data: links } = secIds.length
      ? await supabase.from("assignment_questions").select("section_id, questions(points)").in("section_id", secIds)
      : { data: [] };
    for (const l of links || []) {
      const a = secToA.get(l.section_id);
      total.set(a, (total.get(a) || 0) + Number(l.questions?.points || 1));
    }
  }

  const byClass = new Map(classes.map((c) => [c.id, c]));
  const items = all.map((a) => {
    const cls = byClass.get(a.class_id);
    let status;
    let doneAt = null;
    if (structured.has(a.id) && a.type === "Speaking") {
      status = viewed.has(a.id) ? "viewed" : "to-view";
      doneAt = viewed.get(a.id) || null;
    } else if (structured.has(a.id)) {
      if (submitted.has(a.id)) {
        // A Writing text is marked by the teacher: only a published
        // feedback makes it "graded" (the automatic score setting is for
        // Reading and Listening answers).
        const pub = a.type === "Writing" ? released.has(a.id) : a.auto_release_score || released.has(a.id);
        status = pub ? "graded" : "submitted";
        doneAt = submitted.get(a.id);
      } else if (attempted.has(a.id)) status = "in-progress";
      else status = "pending";
    } else status = "pending";

    // What the student may see as a result — published only.
    let result = null;
    if (status === "graded") {
      if (a.type === "Writing") {
        const band = released.get(a.id)?.band;
        result = band ? { kind: "band", value: band } : null;
      } else if (earned.has(a.id)) {
        result = { kind: "score", earned: earned.get(a.id), total: total.get(a.id) || null };
      } else if (released.get(a.id)?.band) {
        result = { kind: "band", value: released.get(a.id).band };
      }
    }
    return {
      ...a,
      skill: String(a.type || "").startsWith("Writing") ? "Writing" : a.type,
      className: cls?.name || "Class",
      teacher: cls?.teacher || "",
      status,
      doneAt,
      result,
      due: dueInfo(a.due_date, a.due_time),
    };
  });
  return { classes, items };
}

// To do: the most urgent first (late and due today on top), then by due
// date, then the ones with no date.
export function sortTodo(list) {
  return [...list].sort((x, y) => {
    const ex = x.due.end ? x.due.end.getTime() : Infinity;
    const ey = y.due.end ? y.due.end.getTime() : Infinity;
    return ex - ey;
  });
}
export function sortDone(list) {
  return [...list].sort((x, y) => new Date(y.doneAt || 0) - new Date(x.doneAt || 0));
}
export function actionLabel(it) {
  if (it.status === "to-view") return "Open";
  if (it.status === "in-progress") return "Continue";
  return "Start";
}
export function resultLabel(it) {
  if (it.status === "viewed") return { text: "Viewed", tone: "plain" };
  if (it.result?.kind === "band") return { text: `Band ${it.result.value}`, tone: "teal" };
  if (it.result?.kind === "score") return { text: it.result.total ? `${fmtNum(it.result.earned)}/${fmtNum(it.result.total)}` : `${fmtNum(it.result.earned)} points`, tone: "teal" };
  if (it.status === "graded") return { text: "Result published", tone: "teal" };
  return { text: "Waiting for the teacher", tone: "plain" };
}
function fmtNum(n) { return Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10); }
