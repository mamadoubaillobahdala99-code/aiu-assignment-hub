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

// Livraison 82 — the pages keep what they last read IN MEMORY (this tab
// only, this account only): coming back to a page shows it at once, then
// the fresh reading replaces it a moment later. Nothing is kept on disk.
const memory = new Map();
const memoryKey = (userId, classId) => `${userId}|${classId || ""}`;
export function rememberedStudentWork(userId, { classId } = {}) {
  return memory.get(memoryKey(userId, classId)) || null;
}
export function forgetStudentWork() { memory.clear(); }

// Livraison 95c: a read that FAILS (network) is never turned into « no
// class », « nothing done » or « Start » on a paper already handed in:
// loadStudentWork throws, the page says « Could not load — Retry », and a
// failed reading is never kept in memory.
export class StudentWorkLoadError extends Error {}
const failed = (...answers) => answers.some((x) => x && x.error);

export async function loadStudentWork(userId, opts = {}) {
  const out = await readStudentWork(userId, opts);
  memory.set(memoryKey(userId, opts.classId), out);
  return out;
}

// Livraison 82: 2 waits instead of 5 — the classes come WITH their
// assignments and the assignments' parts (one request, each table still
// filtered by its own row security), then everything else at once.
async function readStudentWork(userId, { classId } = {}) {
  // « !exam_sections_assignment_id_fkey » names the link to follow: the
  // database has two ways from a paper to its parts (the parts themselves,
  // and the Listening play counts), and without the name it refuses
  // (tested on a local PostgREST 12, the server Supabase uses).
  let q = supabase
    .from("roster")
    .select("class_id, joined_at, classes(id, name, kind, profiles(name), assignments(*, exam_sections!exam_sections_assignment_id_fkey(id, assignment_id)))")
    .eq("student_id", userId);
  if (classId) q = q.eq("class_id", classId);
  const { data: joined, error: joinedErr } = await q;
  // Safety net: if this combined reading is ever refused, the reading used
  // until livraison 81 (one table at a time) is used instead.
  if (joinedErr) return readStudentWorkStepByStep(userId, { classId });   // throws if that fails too
  // An exam's private box is not a class and never shows as one.
  const rows = (joined || []).filter((r) => r.classes && r.classes.kind !== "exam");
  const classes = rows.map((r) => ({ id: r.class_id, name: r.classes.name || "Class", teacher: r.classes.profiles?.name || "", joinedAt: r.joined_at }));
  if (classes.length === 0) return { classes, items: [] };

  // Same order as before (the database's own order), so that ties in the
  // lists stay where they were.
  const all = rows.flatMap((r) => (r.classes.assignments || []).map(({ exam_sections: _secs, ...a }) => a));
  const secs = rows.flatMap((r) => (r.classes.assignments || []).flatMap((a) => a.exam_sections || []));
  const ids = all.map((a) => a.id);
  if (ids.length === 0) return { classes, items: [] };

  const structured = new Set(secs.map((s) => s.assignment_id));
  const sIds = [...structured];
  const typed = (t) => all.filter((a) => a.type === t && structured.has(a.id)).map((a) => a.id);
  const writingIds = typed("Writing");
  const speakingIds = typed("Speaking");
  // The parts that can hold scored questions (for the totals below).
  const rl = new Set([...typed("Reading"), ...typed("Listening")]);
  const rlSecIds = secs.filter((s) => rl.has(s.assignment_id)).map((s) => s.id);

  const [att, wr, sv, fb, sa, aq] = await Promise.all([
    sIds.length ? supabase.from("exam_attempts").select("assignment_id, started_at, submitted_at").eq("student_id", userId).in("assignment_id", sIds) : { data: [] },
    writingIds.length ? supabase.from("writing_responses").select("assignment_id, submitted_at").eq("student_id", userId).in("assignment_id", writingIds) : { data: [] },
    speakingIds.length ? supabase.from("speaking_views").select("assignment_id, first_viewed_at").eq("student_id", userId).in("assignment_id", speakingIds) : { data: [] },
    sIds.length ? supabase.from("assignment_feedback").select("assignment_id, band, released_at").eq("student_id", userId).in("assignment_id", sIds) : { data: [] },
    // Only published results come back (row security).
    sIds.length ? supabase.from("student_answers").select("assignment_id, points_earned, is_correct").eq("student_id", userId).in("assignment_id", sIds) : { data: [] },
    // Points of the questions this student can read (only papers with results use them).
    rlSecIds.length ? supabase.from("assignment_questions").select("section_id, questions(points)").in("section_id", rlSecIds) : { data: [] },
  ]);
  if (failed(att, wr, sv, fb, sa, aq)) throw new StudentWorkLoadError("Could not load");

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
  const secToA = new Map(secs.map((x) => [x.id, x.assignment_id]));
  for (const l of aq.data || []) {
    const a = secToA.get(l.section_id);
    if (!earned.has(a)) continue;
    total.set(a, (total.get(a) || 0) + Number(l.questions?.points || 1));
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

// The reading used until livraison 81, kept as the safety net above.
async function readStudentWorkStepByStep(userId, { classId } = {}) {
  let q = supabase.from("roster").select("class_id, joined_at, classes(id, name, kind, profiles(name))").eq("student_id", userId);
  if (classId) q = q.eq("class_id", classId);
  const { data: joined, error: joinedErr } = await q;
  if (joinedErr) throw new StudentWorkLoadError("Could not load");
  // An exam's private box is not a class and never shows as one.
  const classes = (joined || [])
    .filter((r) => r.classes && r.classes.kind !== "exam")
    .map((r) => ({ id: r.class_id, name: r.classes.name || "Class", teacher: r.classes.profiles?.name || "", joinedAt: r.joined_at }));
  const classIds = classes.map((c) => c.id);
  if (classIds.length === 0) return { classes, items: [] };

  const { data: assignments, error: aErr } = await supabase.from("assignments").select("*").in("class_id", classIds);
  if (aErr) throw new StudentWorkLoadError("Could not load");
  const all = assignments || [];
  const ids = all.map((a) => a.id);
  if (ids.length === 0) return { classes, items: [] };

  const { data: secs, error: sErr } = await supabase.from("exam_sections").select("id, assignment_id").in("assignment_id", ids);
  if (sErr) throw new StudentWorkLoadError("Could not load");
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
  if (failed(att, wr, sv, fb, sa)) throw new StudentWorkLoadError("Could not load");

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
    const { data: links, error: lErr } = secIds.length
      ? await supabase.from("assignment_questions").select("section_id, questions(points)").in("section_id", secIds)
      : { data: [], error: null };
    if (lErr) throw new StudentWorkLoadError("Could not load");
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
