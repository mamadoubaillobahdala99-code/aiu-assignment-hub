import { supabase } from "../../supabaseClient";
import { dueInfo } from "../../lib/due";

// Livraison 72 — what the teacher's Dashboard and "My classes" cards show,
// read the same way for both.
//
// The figures (handed in, to mark, oldest copy waiting, students, recent
// activity) come from ONE read-only database function, teacher_overview
// (script 45): same "handed in" rules as the class page (script 44), only
// this teacher's classes, never an exam's private box.
// If that read fails, the pages still work: the classes and assignments
// are shown, and the figures read "—".
export async function loadTeacherWork(userId) {
  const [ov, cls] = await Promise.all([
    supabase.rpc("teacher_overview"),
    supabase.from("classes").select("id, name, code, created_at").eq("teacher_id", userId).eq("kind", "class").order("created_at", { ascending: false }),
  ]);
  // Livraison 95d: the classes and assignments themselves must be read —
  // a failure is never « No classes yet » (this throws; the page says so).
  // Only the figures may be missing (« — »), as before.
  if (cls.error) throw new Error("Could not load");
  const overview = ov.error ? null : ov.data || null;
  const classes = cls.data || [];
  const ids = classes.map((c) => c.id);
  const { data: assignments, error: aErr } = ids.length
    ? await supabase.from("assignments").select("id, class_id, title, type, due_date, due_time, time_limit_minutes").in("class_id", ids)
    : { data: [], error: null };
  if (aErr) throw new Error("Could not load");

  const figC = new Map((overview?.classes || []).map((c) => [c.id, c]));
  const figA = new Map((overview?.assignments || []).map((a) => [a.id, a]));
  const byId = new Map(classes.map((c) => [c.id, c]));
  const list = (assignments || []).map((a) => ({
    ...a,
    className: byId.get(a.class_id)?.name || "Class",
    handedIn: figA.has(a.id) ? figA.get(a.id).handed_in : null,
    toMark: figA.has(a.id) ? figA.get(a.id).to_mark : null,
    oldest: figA.get(a.id)?.oldest || null,
    students: figC.has(a.class_id) ? figC.get(a.class_id).students : null,
    due: dueInfo(a.due_date, a.due_time),
  }));
  return {
    ok: Boolean(overview),
    classes: classes.map((c) => ({
      ...c,
      students: figC.has(c.id) ? figC.get(c.id).students : null,
      assignments: list.filter((a) => a.class_id === c.id).length,
      toMark: figC.has(c.id) ? figC.get(c.id).to_mark : null,
    })),
    assignments: list,
    students: overview ? overview.students : null,
    handedIn7d: overview ? overview.handed_in_7d : null,
    recent: overview?.recent || [],
  };
}

// The exams this teacher runs or was invited to (the database decides),
// with their number of candidates — the same reads as the Exams page.
export async function loadTeacherExams() {
  const { data, error } = await supabase
    .from("exam_sessions")
    .select("id, name, code, opened_at, closed_at, opens_at, closes_at, results_released_at, created_at, container_class_id")
    .order("created_at", { ascending: false });
  if (error) throw new Error("Could not load");   // livraison 95d
  const rows = data || [];
  const boxes = rows.map((r) => r.container_class_id).filter(Boolean);
  const { data: roster, error: rErr } = boxes.length ? await supabase.from("roster").select("class_id").in("class_id", boxes) : { data: [], error: null };
  if (rErr) throw new Error("Could not load");
  const people = new Map();
  for (const r of roster || []) people.set(r.class_id, (people.get(r.class_id) || 0) + 1);
  return rows.map((r) => ({ ...r, candidates: people.get(r.container_class_id) || 0 }));
}

// "2 days", "today", "3 h" — how long ago, short.
export function ago(iso, now = new Date()) {
  if (!iso) return "";
  const ms = now - new Date(iso);
  const min = Math.floor(ms / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return "yesterday";
  if (d < 30) return `${d} days ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}
