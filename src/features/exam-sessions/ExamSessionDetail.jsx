import React, { useState, useEffect, useCallback } from "react";
import {
  ArrowLeft, Copy, CheckCircle2, Plus, FileText, Users, Play, Square,
  Send, Trash2, ChevronUp, ChevronDown, UserPlus, X, Headphones, ShieldCheck,
  ChevronRight, Pencil, Files, ShieldAlert, Unlock, RotateCcw, Download, Lock, Clock, Check,
} from "lucide-react";
import { supabase } from "../../supabaseClient";
import { CenterSpinner, EmptyState, Modal } from "../../components/shared";
import { TYPES, fmtDate } from "../../lib/utils";
import { ExamStateBadge } from "./ExamSessionsHome";
import { confirmDialog } from "../../lib/confirmDialog";
import { DropMenu, DropMenuItem, DropMenuSeparator, Breadcrumb } from "../../components/DropMenu";
import { Stepper } from "../question-engine/BuilderLayout";
import { fmtWhen } from "../question-engine/ResultParts";
import { examStage, STAGE_NAMES, loadExamGrid, overallBand, average, fmtBand, resultsCsv, downloadText, left } from "./examWork";

// The teacher's screen for one exam session: its code, its papers in
// order, its settings, the other teachers, and the buttons that run the
// exam on the day.
//
// Livraison 78: the page follows the exam's four steps (Prepared → Open →
// Closed → Results published). Before: papers + « Ready to open? » +
// settings + teachers. During: a table candidate × paper (who is where,
// minutes left, who is suspended). After: the results with their bands,
// the overall band, and « Export (CSV) ». Every action calls the database
// exactly as before (same functions, same writes).
//
// Livraison 79 — « Everyone together » (script 46): a setting of the exam.
// In that mode « Open » opens the waiting room and the teacher starts each
// paper for everyone (exam_session_action 'start_item'), can let the room
// continue on its own ('free'), and can give a candidate extra minutes
// (exam_give_extra_time). The database checks every rule.
export function ExamSessionDetail({ sessionId, userId, setScreen, showToast }) {
  const [session, setSession] = useState(null);
  const [items, setItems] = useState([]);
  const [roster, setRoster] = useState([]);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [staff, setStaff] = useState([]);
  const [staffOpen, setStaffOpen] = useState(false);
  const [teachers, setTeachers] = useState([]);
  // Closing is irreversible for the candidates, so it now goes through
  // a confirmation that first counts who is still writing.
  const [closeAsk, setCloseAsk] = useState(null); // null | "counting" | { working, names }
  // Manage the exam itself: rename, duplicate for another class, delete.
  const [renaming, setRenaming] = useState(null);   // null | the draft name
  const [dupOpen, setDupOpen] = useState(null);     // null | the draft name
  const [delOpen, setDelOpen] = useState(false);
  const [delTyped, setDelTyped] = useState("");
  const [manageBusy, setManageBusy] = useState("");
  // Who has handed in what, so the room's progress is visible at a glance.
  const [progress, setProgress] = useState({});     // student_id -> Set(assignment_id)
  // Invigilation: who has left the exam screen, and who is frozen.
  const [board, setBoard] = useState([]);
  // Papers the server should have handed in but could not yet (livraison 57).
  const [uncollected, setUncollected] = useState(0);
  const [resuming, setResuming] = useState("");
  // Listening papers on which candidates could pause / replay the sound
  // (practice settings). Shown with a badge, and asked about before Open.
  const [replayIds, setReplayIds] = useState(new Set());
  const [openAsk, setOpenAsk] = useState(false);
  // Livraison 60: "Close" waits until the papers and candidates are loaded.
  // Clicked earlier, its count said "Nobody is writing right now" even
  // while candidates were writing.
  const [loaded, setLoaded] = useState(false);
  // Livraison 78: each candidate's attempts (start / hand-in, per paper),
  // the papers that have content, the results grid, the tab shown, and a
  // clock for the « minutes left ».
  const [attempts, setAttempts] = useState([]);
  const [withContent, setWithContent] = useState(null);   // Set(assignment_id) | null = unknown
  const [grid, setGrid] = useState(null);                 // see examWork.loadExamGrid
  const [tab, setTab] = useState(null);                   // null = the stage's default
  const [now, setNow] = useState(Date.now());
  const [filter, setFilter] = useState("all");
  // Livraison 79: minutes given to candidates, and the « extra time » window.
  const [extras, setExtras] = useState([]);
  const [extraFor, setExtraFor] = useState(null);   // null | { st, it, minutes }
  const [giving, setGiving] = useState(false);

  // Livraison 82: the page's reads are asked in 3 rounds instead of one
  // after the other (up to 11). Same reads, same rights, same results;
  // the only write (adopting a paper just built) is unchanged.
  const load = useCallback(async () => {
    const itemsQuery = () => supabase
      .from("exam_session_items")
      .select("id, assignment_id, order_index, audio_started_at, room_started_at")
      .eq("session_id", sessionId)
      .order("order_index");
    const [{ data: s }, { data: firstRows }, { data: st }, { data: xt }] = await Promise.all([
      supabase.from("exam_sessions").select("*").eq("id", sessionId).maybeSingle(),
      itemsQuery(),
      supabase.from("exam_session_staff").select("teacher_id, role, profiles(name)").eq("session_id", sessionId),
      supabase.from("exam_extra_time").select("assignment_id, student_id, minutes").eq("session_id", sessionId),
    ]);
    if (!s) { setSession(false); return; }
    setSession(s);
    let rows = firstRows || [];

    // Who has handed in what (one query for the whole room) and which
    // papers have content — asked with the papers and the candidates.
    const perPaper = (ids) => ids.length > 0
      ? Promise.all([
          supabase.from("exam_attempts").select("student_id, assignment_id, started_at, submitted_at").in("assignment_id", ids),
          supabase.from("exam_sections").select("assignment_id, audio_url, max_plays").in("assignment_id", ids),
        ])
      : Promise.resolve([{ data: [] }, { data: [] }]);

    // Papers built inside this exam. Anything sitting in the private
    // container that is not yet a paper of this exam has just been
    // built — adopt it, in the order it was created.
    let [{ data: inContainer }, { data: r }, paperReads] = await Promise.all([
      supabase
        .from("assignments")
        .select("id, title, type, time_limit_minutes, created_at, listening_audio_url, listening_exam_mode")
        .eq("class_id", s.container_class_id)
        .order("created_at"),
      supabase.from("roster").select("student_id, joined_at, profiles(name)").eq("class_id", s.container_class_id),
      perPaper(rows.map((x) => x.assignment_id)),
    ]);

    const known = new Set(rows.map((x) => x.assignment_id));
    const orphans = (inContainer || []).filter((a) => !known.has(a.id));
    if (orphans.length > 0) {
      let next = rows.reduce((m, x) => Math.max(m, x.order_index), 0);
      const toAdd = orphans.map((a) => ({ session_id: sessionId, assignment_id: a.id, order_index: ++next }));
      await supabase.from("exam_session_items").insert(toAdd);
      const { data: again } = await itemsQuery();
      rows = again || [];
      paperReads = await perPaper(rows.map((x) => x.assignment_id));
    }
    const [{ data: att }, { data: secs }] = paperReads;

    const byId = new Map((inContainer || []).map((a) => [a.id, a]));

    // A Listening lets candidates replay when its single recording is not
    // in exam mode, or when one of its parts has audio with no play limit.
    const listening = (inContainer || []).filter((a) => a.type === "Listening");
    const replay = new Set(listening.filter((a) => a.listening_audio_url && !a.listening_exam_mode).map((a) => a.id));
    const perPart = new Set(listening.filter((a) => !a.listening_audio_url).map((a) => a.id));
    for (const sec of secs || []) if (perPart.has(sec.assignment_id) && sec.audio_url && !sec.max_plays) replay.add(sec.assignment_id);
    setReplayIds(replay);
    setItems(rows.map((x) => ({ ...x, assignment: byId.get(x.assignment_id) || null })));

    setRoster((r || []).map((x) => ({ id: x.student_id, name: x.profiles?.name || "Student", joined_at: x.joined_at })));
    setStaff((st || []).map((x) => ({ id: x.teacher_id, role: x.role, name: x.profiles?.name || "Teacher" })));
    setLoaded(true);

    if (rows.length > 0) {
      setAttempts(att || []);
      setExtras(xt || []);
      setWithContent(new Set((secs || []).map((x) => x.assignment_id)));
      const done = {};
      for (const a of att || []) {
        if (!a.submitted_at) continue;
        (done[a.student_id] = done[a.student_id] || new Set()).add(a.assignment_id);
      }
      setProgress(done);
    } else {
      setProgress({});
      setAttempts([]);
      setWithContent(new Set());
    }
  }, [sessionId]);

  useEffect(() => { load(); }, [load]);

  // The invigilation board, refreshed on its own every 8 seconds while
  // the exam is running — a frozen candidate is waiting in front of a
  // dead screen, so the teacher must see it without reloading.
  const loadBoard = useCallback(async () => {
    const { data, error } = await supabase.rpc("exam_invigilation_board", { p_session_id: sessionId });
    if (!error) setBoard(data || []);
    // The board has just tried to hand in every paper that is due; what
    // is still left is shown to the teacher (livraison 57).
    const left = await supabase.rpc("exam_uncollected_papers", { p_session_id: sessionId });
    if (!left.error) setUncollected(Number(left.data) || 0);
  }, [sessionId]);

  useEffect(() => { loadBoard(); }, [loadBoard]);

  // Livraison 78: the results grid (scores, bands, Writing to mark), read
  // with the class rules once the papers and candidates are known.
  const loadGrid = useCallback(async () => {
    if (!loaded || withContent === null) return;
    const list = items.filter((it) => it.assignment).map((it) => ({ ...it, structured: withContent.has(it.assignment_id) }));
    try { setGrid(await loadExamGrid(list, roster)); } catch { setGrid({}); }
  }, [loaded, items, roster, withContent]);
  useEffect(() => { loadGrid(); }, [loadGrid]);
  // Also keeps refreshing after Close while some papers are still left:
  // every refresh tries to hand them in again.
  // Livraison 78: also when the exam was opened by its opening time.
  const keepRefreshing = (Boolean(session) && examStage(session) === 1) || uncollected > 0;
  useEffect(() => {
    if (!keepRefreshing) return;
    const id = setInterval(loadBoard, 8000);
    return () => clearInterval(id);
  }, [keepRefreshing, loadBoard]);
  // While the exam runs, the candidates' table follows the room (every
  // 20 s), and the « minutes left » follow the clock.
  useEffect(() => {
    if (!keepRefreshing) return;
    const id = setInterval(() => { load(); setNow(Date.now()); }, 20000);
    const tick = setInterval(() => setNow(Date.now()), 30000);
    return () => { clearInterval(id); clearInterval(tick); };
  }, [keepRefreshing, load]);

  async function allowResume(studentId) {
    setResuming(studentId);
    const { error } = await supabase.rpc("exam_allow_resume", { p_session_id: sessionId, p_student_id: studentId });
    setResuming("");
    if (error) { showToast?.("Could not let this candidate back in"); return; }
    showToast?.("Candidate let back in");
    loadBoard();
  }

  async function resetAudio(studentId, assignmentId) {
    const { error } = await supabase.rpc("exam_reset_audio", { p_assignment_id: assignmentId, p_student_id: studentId });
    if (error) { showToast?.("Could not give the recording back"); return; }
    showToast?.("Recording given back — the candidate can play it again");
  }

  async function act(action, itemId) {
    setBusy(action);
    const { data, error } = await supabase.rpc("exam_session_action", { p_session_id: sessionId, p_action: action, p_item_id: itemId || null });
    setBusy("");
    if (error) { showToast?.("Could not do that: " + error.message); return; }
    await load();
    // Closing (or publishing) hands in every paper still being written —
    // the server does it, from the copies it keeps (livraison 56).
    const n = Number(data?.collected || 0);
    const left = Number(data?.uncollected || 0);
    const handed = (n > 0 ? ` — ${n} paper${n > 1 ? "s" : ""} handed in` : "")
      + (left > 0 ? `${n > 0 ? "," : " —"} ${left} could not be collected` : "");
    if (action === "close" || action === "release") setUncollected(left);
    if (action === "open") showToast?.("Exam open — give the code to your students");
    if (action === "close") showToast?.("Exam closed" + handed);
    if (action === "release") showToast?.("Results published" + handed);
    if (action === "start_audio") showToast?.("Recording started for everyone");
    if (action === "start_item") showToast?.("Started for everyone");
    if (action === "free") showToast?.("Candidates now continue on their own");
  }

  // Livraison 79 — « Everyone together ».
  async function startForEveryone(it, roomSize) {
    const lim = it.assignment?.time_limit_minutes;
    const ends = lim ? new Date(Date.now() + lim * 60000) : null;
    const t = (d) => d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    const ok = await confirmDialog({
      title: `Start ${it.assignment?.type || "this paper"} for everyone?`,
      message: `${roomSize} candidate${roomSize === 1 ? " is" : "s are"} in the room. ${it.assignment?.title || "The paper"} starts now`
        + (ends ? ` and ends for everyone at ${t(ends)}.` : ".")
        + " A candidate who arrives later has the time left; you can give extra minutes.",
      confirmLabel: "Start now",
    });
    if (ok) act("start_item", it.id);
  }
  async function letContinue() {
    const ok = await confirmDialog({
      title: "Let candidates continue on their own?",
      message: "From now on, each candidate who hands in a paper can start the next one when ready, with its full time. "
        + "You will no longer press « Start » for the next papers. This cannot be undone for this exam. « Close the exam » still ends everything.",
      confirmLabel: "Let them continue",
    });
    if (ok) act("free");
  }
  async function giveExtra() {
    if (!extraFor || giving) return;
    setGiving(true);
    const { error } = await supabase.rpc("exam_give_extra_time", {
      p_session_id: sessionId, p_student_id: extraFor.st.id, p_assignment_id: extraFor.it.assignment_id, p_minutes: extraFor.minutes,
    });
    setGiving(false);
    if (error) { showToast?.("Could not give extra time: " + error.message); return; }
    showToast?.(`${extraFor.minutes} extra minute${extraFor.minutes === 1 ? "" : "s"} for ${extraFor.st.name}`);
    setExtraFor(null);
    load();
  }

  // Who is still writing right now: a paper started, not yet handed in.
  // Asked just before closing, so the number is the one on the screen.
  async function askToClose() {
    setCloseAsk("counting");
    const ids = items.map((i) => i.assignment_id);
    const { data, error } = ids.length
      ? await supabase.from("exam_attempts").select("student_id, assignment_id, submitted_at").in("assignment_id", ids)
      : { data: [], error: null };
    if (error) {
      // Never block the teacher because a count failed — just say so.
      setCloseAsk({ working: null, names: [] });
      return;
    }
    const busyIds = new Set((data || []).filter((a) => !a.submitted_at).map((a) => a.student_id));
    const names = roster.filter((s) => busyIds.has(s.id)).map((s) => s.name);
    setCloseAsk({ working: busyIds.size, names });
  }

  async function setSetting(patch) {
    const { error } = await supabase.from("exam_sessions").update(patch).eq("id", sessionId);
    if (error) {
      showToast?.(/settings are locked/i.test(error.message || "") ? "The exam is running: its settings are locked" : "Could not save that setting");
      return;
    }
    load();
  }

  // Livraison 62: during the exam the end time can only move LATER, through
  // the database (exam_extend_end). To end earlier, the teacher uses Close.
  const [extending, setExtending] = useState(false);
  async function extendEnd(minutes) {
    if (extending) return;
    setExtending(true);
    const { error } = await supabase.rpc("exam_extend_end", { p_session_id: sessionId, p_minutes: minutes });
    setExtending(false);
    if (error) { showToast?.("Could not extend: " + error.message); return; }
    showToast?.(`End time moved ${minutes} minutes later`);
    load();
  }

  async function move(item, dir) {
    const sorted = [...items].sort((a, b) => a.order_index - b.order_index);
    const i = sorted.findIndex((x) => x.id === item.id);
    const j = i + dir;
    if (j < 0 || j >= sorted.length) return;
    await Promise.all([
      supabase.from("exam_session_items").update({ order_index: sorted[j].order_index }).eq("id", sorted[i].id),
      supabase.from("exam_session_items").update({ order_index: sorted[i].order_index }).eq("id", sorted[j].id),
    ]);
    load();
  }

  async function removeItem(item) {
    if (!(await confirmDialog({ title: "Remove this paper?", message: `Remove "${item.assignment?.title || "this paper"}" from the exam? The paper itself is deleted — it only existed inside this exam.`, confirmLabel: "Remove", danger: true }))) return;
    await supabase.from("exam_session_items").delete().eq("id", item.id);
    await supabase.from("assignments").delete().eq("id", item.assignment_id);
    load();
  }

  // The teacher list cannot be read from profiles: since the security
  // work, a profile is only visible to someone who shares a class with
  // it, so two teachers with their own classes never see each other and
  // this window came up empty. The database hands the list over only to
  // a teacher of this exam, and only for this exam.
  async function openStaff() {
    setStaffOpen(true);
    setTeachers(null);
    const { data, error } = await supabase.rpc("list_invitable_teachers", { p_session_id: sessionId });
    setTeachers(error ? [] : data || []);
  }
  async function addStaff(teacherId) {
    const { error } = await supabase.from("exam_session_staff").insert({ session_id: sessionId, teacher_id: teacherId, role: "co" });
    if (error) { showToast?.("Could not invite this teacher"); return; }
    setStaffOpen(false); load();
  }
  async function removeStaff(teacherId) {
    await supabase.from("exam_session_staff").delete().eq("session_id", sessionId).eq("teacher_id", teacherId);
    load();
  }

  // ---------- managing the exam itself ----------
  async function doRename() {
    const name = (renaming || "").trim();
    if (!name) return;
    setManageBusy("rename");
    const { error } = await supabase.rpc("rename_exam_session", { p_session_id: sessionId, p_name: name });
    setManageBusy("");
    if (error) { showToast?.("Could not rename: " + error.message); return; }
    setRenaming(null);
    load();
  }

  async function doDuplicate() {
    const name = (dupOpen || "").trim();
    setManageBusy("dup");
    const { data, error } = await supabase.rpc("duplicate_exam_session", { p_session_id: sessionId, p_name: name || null });
    setManageBusy("");
    if (error) { showToast?.("Could not duplicate: " + error.message); return; }
    setDupOpen(null);
    showToast?.(`Copied — ${data?.papers || 0} paper${data?.papers === 1 ? "" : "s"}, new code ${data?.code}`);
    setScreen({ name: "exam-session", sessionId: data.session_id });
  }

  async function doDelete() {
    setManageBusy("del");
    const { error } = await supabase.rpc("delete_exam_session", { p_session_id: sessionId });
    setManageBusy("");
    if (error) { showToast?.("Could not delete: " + error.message); return; }
    showToast?.("Exam deleted");
    setScreen({ name: "exams" });
  }

  // Opening a paper: the teacher's own assignment screen, which already
  // knows how to preview, edit, duplicate and delete it. Back returns
  // here, not into the exam's private container.
  function openPaper(it) {
    setScreen({
      name: "assignment-teacher",
      classId: session.container_class_id,
      assignmentId: it.assignment_id,
      returnTo: { name: "exam-session", sessionId },
      examLocked: Boolean(session.opened_at) && !session.closed_at,
    });
  }

  function copyCode() {
    navigator.clipboard?.writeText(session.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function build(screenName) {
    setAddOpen(false);
    setScreen({
      name: screenName,
      classId: session.container_class_id,
      skill: screenName === "test-importer" ? "reading" : undefined,
      returnTo: { name: "exam-session", sessionId },
    });
  }

  if (session === null) return <CenterSpinner />;
  if (session === false) {
    return (
      <div className="page page-dash">
        <Breadcrumb items={[{ label: "Exams", onClick: () => setScreen({ name: "exams" }) }, { label: "Not found" }]} />
        <p className="empty-inline">This exam no longer exists.</p>
        <button className="btn-ghost" style={{ marginTop: 12 }} onClick={() => setScreen({ name: "exams" })}><ArrowLeft size={14} /> All exams</button>
      </div>
    );
  }

  // Suspended candidates first: they are sitting in front of a dead
  // screen waiting for this button.
  const frozen = board.filter((c) => c.frozen);
  const frozenIds = new Set(frozen.map((c) => c.student_id));
  const watched = board.reduce((n, c) => n + (c.incidents || 0), 0);
  const isOwner = session.created_by === userId;
  // Livraison 62 — the same rules as the database:
  //   examOpen   = the exam is running (Open button, or its opening time has come);
  //   notStarted = never opened, not closed, not published, opening time not reached.
  // Papers can only be added, removed or reordered before the start, and the
  // settings are locked while the exam is running.
  const nowMs = Date.now();
  const opensMs = session.opens_at ? new Date(session.opens_at).getTime() : null;
  const closesMs = session.closes_at ? new Date(session.closes_at).getTime() : null;
  const examOpen = !session.closed_at && (closesMs === null || nowMs < closesMs)
    && (Boolean(session.opened_at) || (opensMs !== null && nowMs >= opensMs));
  const notStarted = !session.opened_at && !session.closed_at && !session.results_released_at
    && (opensMs === null || nowMs < opensMs);
  const sorted = [...items].sort((a, b) => a.order_index - b.order_index);

  // Livraison 78 — the step, and what each step shows.
  const stage = examStage(session, nowMs);
  // Livraison 79.
  const together = session.start_mode === "together";
  const free = Boolean(session.free_from);
  const tabsOf = stage === 1 ? ["candidates", "papers", "settings", "teachers"] : ["results", "papers", "settings", "teachers"];
  const shownTab = tab && tabsOf.includes(tab) ? tab : tabsOf[0];
  const att = new Map(attempts.map((a) => [`${a.student_id}|${a.assignment_id}`, a]));
  const cellOf = (studentId, it) => grid?.[`${studentId}|${it.assignment_id}`];
  const timed = sorted.filter((it) => it.assignment && it.assignment.type !== "Speaking");
  const hm = (iso) => new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
  const toMarkCount = grid ? Object.values(grid).filter((c) => c.status === "to-mark").length : 0;

  function openCopy(student, it) {
    setScreen({ name: "assignment-teacher", classId: session.container_class_id, assignmentId: it.assignment_id, studentId: student.id, returnTo: { name: "exam-session", sessionId } });
  }

  // During the exam: where each candidate is.
  function liveCell(st, it, idx) {
    const type = it.assignment?.type || "";
    if (type === "Speaking") {
      return cellOf(st.id, it)?.status === "viewed" ? { kind: "done", text: "✓ viewed" } : { kind: "none", text: "—" };
    }
    const t = att.get(`${st.id}|${it.assignment_id}`);
    const extra = extraOf(st.id, it.assignment_id);
    if (t?.submitted_at) return { kind: "done", text: `✓ ${hm(t.submitted_at)}`, extra };
    if (t?.started_at) {
      const lim = it.assignment?.time_limit_minutes;
      const end = lim ? new Date(t.started_at).getTime() + lim * 60000 : null;
      return { kind: "work", text: `${type.toLowerCase()} · ${end ? `${left(end - now)} left` : "in progress"}`, extra,
               canExtend: Boolean(end && end > now) };
    }
    // Livraison 79: not started for the room yet, or missed.
    if (together && !free && !it.room_started_at) return { kind: "next", text: "waits for your start" };
    if (together && it.room_started_at && it.assignment?.time_limit_minutes
        && new Date(it.room_started_at).getTime() + it.assignment.time_limit_minutes * 60000 <= now) {
      return { kind: "none", text: "missed" };
    }
    const ready = sorted.slice(0, idx).filter((p) => p.assignment && p.assignment.type !== "Speaking")
      .every((p) => att.get(`${st.id}|${p.assignment_id}`)?.submitted_at);
    return ready ? { kind: "next", text: "not started" } : { kind: "lock" };
  }
  function liveStatus(st) {
    if (frozenIds.has(st.id)) return "suspended";
    const mine = timed.map((it) => att.get(`${st.id}|${it.assignment_id}`));
    if (timed.length > 0 && mine.every((t) => t?.submitted_at)) return "finished";
    if (mine.some((t) => t?.started_at && !t.submitted_at)) return "working";
    return mine.some((t) => t?.submitted_at) ? "working" : "waiting";
  }
  function extraOf(studentId, assignmentId) {
    return extras.filter((x) => x.student_id === studentId && x.assignment_id === assignmentId).reduce((n, x) => n + x.minutes, 0);
  }
  const STATUS = { working: ["Working", "pill-teal"], finished: ["Finished", ""], suspended: ["Suspended", "pill-rose"], waiting: ["Not started", "pill-plain"] };
  const liveRows = roster.map((st) => ({ st, status: liveStatus(st) }));
  const liveCount = (k) => liveRows.filter((r) => r.status === k).length;
  const shownLive = liveRows.filter((r) => filter === "all" || r.status === filter);

  // After the exam: results.
  const scoredPapers = sorted.filter((it) => ["Listening", "Reading", "Writing"].includes(it.assignment?.type));
  const overallOf = (st) => overallBand(sorted.filter((it) => it.assignment), (it) => cellOf(st.id, it));
  const overalls = roster.map(overallOf).filter((b) => b !== null);
  function exportCsv() {
    const csv = resultsCsv(session.name, sorted.filter((it) => it.assignment), roster, (sid, it) => cellOf(sid, it));
    // A plain-ASCII file name: some browsers drop a name with accents or dashes like « — ».
    const safe = session.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9 ._()-]+/g, "-").replace(/\s+/g, " ").trim() || "exam";
    downloadText(`${safe} - results.csv`, csv);
    showToast?.("Results exported (CSV)");
  }

  const copyPill = (
    <button type="button" className="pill pill-btn" onClick={copyCode} title="Copy the code">
      {copied ? <CheckCircle2 size={13} /> : <Copy size={13} />} Code: {session.code}
    </button>
  );
  const windowPill = stage === 0
    ? (session.opens_at ? <span className="pill"><Clock size={13} /> Opens {fmtWhen(session.opens_at)}</span> : null)
    : stage === 1
      ? (session.closes_at ? <span className="pill"><Clock size={13} /> Closes {hm(session.closes_at)} · {left(closesMs - now)} left</span> : null)
      : <span className="pill">{session.closed_at ? `Closed ${fmtWhen(session.closed_at)}` : session.closes_at ? `Window ended ${fmtWhen(session.closes_at)}` : "Closed"}</span>;

  const deleteLocked = examOpen && !session.results_released_at;
  const moreMenu = (
    <DropMenu label="•••" className="btn-ghost btn-dots" title="More actions">
      <DropMenuItem icon={<Pencil size={15} />} title="Rename…" onClick={() => setRenaming(session.name)} />
      <DropMenuItem icon={<Files size={15} />} title="Duplicate for another class…" hint="Same papers, new code, nobody in it." onClick={() => setDupOpen(`${session.name} (copy)`)} />
      {stage === 1 && !session.results_released_at && (
        <DropMenuItem icon={<Send size={15} />} title="Publish the results now…" hint="Every paper still being written is handed in." disabled={busy === "release"} onClick={askRelease} />
      )}
      {isOwner && (
        <>
          <DropMenuSeparator />
          {/* Livraison 64 — the same rule as the database (exam_running): locked while the
              exam runs, whether it was opened by the button or by its opening time. */}
          <DropMenuItem icon={<Trash2 size={15} />} title="Delete this exam…" danger disabled={deleteLocked}
                        hint={deleteLocked ? "Close the exam first" : undefined}
                        onClick={() => { setDelTyped(""); setDelOpen(true); }} />
        </>
      )}
    </DropMenu>
  );
  async function askRelease() {
    const message = "Publish the results to every candidate? They will see their marks and their corrected papers."
      + (stage === 1 ? " The exam is still open: every paper still being written will be handed in now, as it is." : "");
    if (await confirmDialog({ title: "Publish the results?", message, confirmLabel: "Publish" })) act("release");
  }

  const actions = (
    <div className="ph-actions">
      {stage >= 2 && (
        <button className="btn-ghost" disabled={grid === null || roster.length === 0} onClick={exportCsv}><Download size={15} /> Export (CSV)</button>
      )}
      {stage === 1 && examOpen && session.closes_at && (
        <DropMenu label={<><Plus size={14} /> Time ▾</>} className="btn-ghost" title="Need more time?">
          <DropMenuSeparator label="Move the end later" />
          {[5, 15, 30].map((m) => (
            <DropMenuItem key={m} title={`+${m} min`} disabled={extending} onClick={() => extendEnd(m)} />
          ))}
          <DropMenuSeparator label="To end now, use Close" />
        </DropMenu>
      )}
      {moreMenu}
      {stage === 0 && (
        <button className="btn-teal" disabled={busy === "open" || sorted.length === 0}
                title={sorted.length === 0 ? "Add a paper first" : ""}
                onClick={() => (sorted.some((it) => replayIds.has(it.assignment_id)) ? setOpenAsk(true) : act("open"))}>
          <Play size={15} /> {busy === "open" ? "Opening…" : "Open the exam now"}
        </button>
      )}
      {/* Livraison 78: also when the exam was opened by its opening time
          (before, the teacher first had to press Open to get this button). */}
      {stage === 1 && (
        <button className="btn-primary ex-close-btn" disabled={!loaded || busy === "close" || closeAsk === "counting"} onClick={askToClose}>
          <Square size={14} /> {busy === "close" ? "Closing…" : !loaded ? "Loading…" : "Close the exam"}
        </button>
      )}
      {stage === 2 && !session.results_released_at && (
        <button className="btn-teal" disabled={busy === "release"} onClick={askRelease}>
          <Send size={14} /> {busy === "release" ? "Publishing…" : "Publish the results"}
        </button>
      )}
    </div>
  );

  // ---------- panels ----------
  const papersPanel = (
    <section className="panel">
      <div className="panel-h">
        <h2>Papers, in order</h2>
        {notStarted && <button className="panel-link" onClick={() => setAddOpen(true)}><Plus size={14} /> Add a paper</button>}
      </div>
      {sorted.length === 0 ? (
        <EmptyState icon={<FileText size={24} />} title="No paper yet" body="Build the papers inside this exam. They will never appear in a class." />
      ) : (
        <div className="exd-papers">
          {sorted.map((it, i) => {
            const meta = TYPES[it.assignment?.type] || {};
            const Icon = meta.icon || FileText;
            const typeKey = String(it.assignment?.type || "").toLowerCase();
            const empty = withContent && it.assignment && !withContent.has(it.assignment_id);
            return (
              <div key={it.id} className="exd-paper">
                <span className="exd-num">{i + 1}</span>
                <span className={`type-ic ic-${typeKey}`}><Icon size={16} /></span>
                {/* The whole title opens the paper: read it, correct it,
                    see who has handed it in. */}
                <button className="exd-paper-open" onClick={() => openPaper(it)} disabled={!it.assignment} title="Open this paper">
                  <span className="exd-paper-title">{it.assignment?.title || "(paper deleted)"}</span>
                  <span className="dt-sub">
                    {it.assignment?.type}
                    {it.assignment?.time_limit_minutes ? ` · ${it.assignment.time_limit_minutes} min` : " · no time limit"}
                    {roster.length > 0 && it.assignment?.type !== "Speaking" && <> · {roster.filter((s) => progress[s.id]?.has(it.assignment_id)).length}/{roster.length} handed in</>}
                    {empty && <span className="ex-replay-badge exd-bad">No content yet</span>}
                    {replayIds.has(it.assignment_id) && (
                      <span className="ex-replay-badge" title="Practice setting: candidates can pause and replay the recording.">Replay allowed</span>
                    )}
                    {together && it.assignment && it.assignment.type !== "Speaking" && (
                      it.room_started_at ? <span className="ex-replay-badge exd-ok">Started {hm(it.room_started_at)}</span>
                        : free ? <span className="ex-replay-badge exd-free">Each candidate when ready</span>
                        : <span className="ex-replay-badge exd-wait">You start it</span>
                    )}
                  </span>
                </button>
                {session.listening_start === "grouped" && it.assignment?.type === "Listening" && stage === 1 && (
                  <button className={`btn-ghost ex-audio-btn ${it.audio_started_at ? "is-done" : ""}`}
                          disabled={Boolean(it.audio_started_at) || busy === "start_audio"} onClick={() => act("start_audio", it.id)}>
                    <Headphones size={14} /> {it.audio_started_at ? "Recording started" : "Start the recording"}
                  </button>
                )}
                {notStarted ? (
                  <div className="ex-item-tools">
                    <button className="ex-icon-btn" title="Move up" disabled={i === 0} onClick={() => move(it, -1)}><ChevronUp size={15} /></button>
                    <button className="ex-icon-btn" title="Move down" disabled={i === sorted.length - 1} onClick={() => move(it, 1)}><ChevronDown size={15} /></button>
                    <button className="ex-icon-btn ex-icon-danger" title="Remove" onClick={() => removeItem(it)}><Trash2 size={14} /></button>
                  </div>
                ) : <ChevronRight size={15} className="chev" />}
              </div>
            );
          })}
        </div>
      )}
      {!notStarted && sorted.length > 0 && <p className="panel-note" style={{ margin: "10px 0 0" }}>The papers are locked once the exam has started: no paper can be added, removed or moved.</p>}
    </section>
  );

  const listenings = sorted.filter((it) => it.assignment?.type === "Listening");
  const emptyPapers = withContent ? sorted.filter((it) => it.assignment && !withContent.has(it.assignment_id)) : [];
  const readyItems = [
    { ok: sorted.length > 0, text: sorted.length > 0 ? `${plural(sorted.length, "paper")}, in order` : "Add at least one paper" },
    { ok: withContent !== null && emptyPapers.length === 0, bad: emptyPapers.length > 0,
      text: emptyPapers.length > 0 ? `No content yet: ${emptyPapers.map((it) => it.assignment.title).join(", ")}` : "Every paper has its content" },
    ...(listenings.length ? [{ ok: !listenings.some((it) => replayIds.has(it.assignment_id)), warn: listenings.some((it) => replayIds.has(it.assignment_id)),
      text: listenings.some((it) => replayIds.has(it.assignment_id)) ? "A Listening lets candidates replay the recording (practice setting)" : "Listening: one listening only, like the real test" }] : []),
    { ok: true, info: !session.opens_at, text: session.opens_at ? `Opens by itself: ${fmtWhen(session.opens_at)}` : "No opening time — you open it with the button" },
    { ok: true, info: true, text: together
        ? "Everyone together: « Open » opens the waiting room, then you start each paper"
        : "Each candidate starts each paper when ready" },
    { ok: true, info: true, text: `Candidates join with the code ${session.code} once it is open` },
  ];
  const readyPanel = (
    <section className="panel">
      <div className="panel-h"><h2>Ready to open?</h2></div>
      {readyItems.map((r, i) => (
        <div key={i} className={`bl-ck ${r.ok && !r.info ? "ok" : ""}`}>
          <span className={`bl-ck-ic ${r.bad ? "bl-ck-bad" : ""} ${r.warn ? "exd-ck-warn" : ""} ${r.info ? "exd-ck-info" : ""}`}>
            {r.bad ? "!" : r.warn ? "!" : r.info ? "i" : r.ok ? <Check size={11} /> : null}
          </span>
          {r.text}
        </div>
      ))}
    </section>
  );

  const settingsPanel = (
    <section className="panel">
      <div className="panel-h"><h2>Settings</h2>{examOpen && <span className="panel-note"><Lock size={12} /> locked while the exam runs</span>}</div>
      <div className="ex-settings" style={{ marginTop: 4 }}>
        <label className="ex-setting">
          <input type="checkbox" checked={session.strict_mode} disabled={examOpen}
                 onChange={(e) => setSetting({ strict_mode: e.target.checked })} />
          <span>
            <strong>Strict — a teacher must authorise a restart</strong>
            <em>If a candidate leaves the exam, it freezes until a teacher lets them back in. Turn this off for practice at home.</em>
          </span>
        </label>
        <div className="ex-setting ex-setting-radio">
          <span><strong>How candidates start each paper</strong>
            <em>Together: candidates wait in the room and you press « Start » for each paper — same start, same end for everyone.</em></span>
          <label><input type="radio" name="sm" checked={(session.start_mode || "individual") === "individual"} disabled={examOpen}
                        onChange={() => setSetting({ start_mode: "individual" })} /> each candidate starts when ready</label>
          <label><input type="radio" name="sm" checked={session.start_mode === "together"} disabled={examOpen}
                        onChange={() => setSetting({ start_mode: "together" })} /> everyone together — you start each paper</label>
        </div>
        <div className="ex-setting ex-setting-radio">
          <span><strong>The Listening recording starts…</strong></span>
          <label><input type="radio" name="ls" checked={session.listening_start === "individual"} disabled={examOpen}
                        onChange={() => setSetting({ listening_start: "individual" })} /> individually — each candidate with headphones</label>
          <label><input type="radio" name="ls" checked={session.listening_start === "grouped"} disabled={examOpen}
                        onChange={() => setSetting({ listening_start: "grouped" })} /> together — you press play for the whole room</label>
        </div>
        <div className="ex-setting ex-setting-times">
          <span><strong>Window (optional)</strong>
            <em>A safety net around the Open button: outside it, nobody can join or start.</em></span>
          <div className="ex-time-row">
            <label className="field-label">Opens</label>
            <input type="datetime-local" className="field-input" disabled={examOpen}
                   value={toLocal(session.opens_at)} onChange={(e) => setSetting({ opens_at: fromLocal(e.target.value) })} />
            <label className="field-label">Closes</label>
            <input type="datetime-local" className="field-input" disabled={examOpen}
                   value={toLocal(session.closes_at)} onChange={(e) => setSetting({ closes_at: fromLocal(e.target.value) })} />
          </div>
          {examOpen && session.closes_at && (
            <em style={{ fontSize: 12, color: "var(--ink-soft)" }}>Need more time? Use « Time » at the top: the end time can only move later. To end now, use Close.</em>
          )}
        </div>
      </div>
    </section>
  );

  const teachersPanel = (
    <section className="panel">
      <div className="panel-h">
        <h2>Teachers <span className="ex-count">({staff.length})</span></h2>
        {isOwner && <button className="panel-link" onClick={openStaff}><UserPlus size={14} /> Invite a teacher</button>}
      </div>
      {staff.map((t) => (
        <div key={t.id} className="prow">
          <div className="avatar small">{t.name.slice(0, 1).toUpperCase()}</div>
          <div className="prow-main"><b>{t.name}</b><span className="dt-sub">{t.role === "owner" ? "creator" : "invited — watches, lets candidates back in, marks"}</span></div>
          {t.role !== "owner" && isOwner && (
            <button className="ex-icon-btn ex-icon-danger" title="Remove" onClick={() => removeStaff(t.id)}><X size={13} /></button>
          )}
        </div>
      ))}
    </section>
  );

  const invigilation = frozen.length > 0 && (
    <div className="ex-frozen-list" style={{ marginBottom: 16 }}>
      {frozen.map((c) => {
        const listening = sorted.find((it) => it.assignment?.type === "Listening");
        return (
          <div key={c.student_id} className="ex-frozen-row">
            <ShieldAlert size={17} className="ex-frozen-icon" />
            <div className="ex-frozen-main">
              <div className="ex-item-title">{c.name} <span className="pill pill-rose" style={{ marginLeft: 6 }}>Suspended</span></div>
              <div className="ex-item-sub">
                {c.kind === "fullscreen_exit" ? "Left full screen"
                  : c.kind === "page_reload" ? "Refreshed or reopened the page"
                  : "Left the exam screen"}
                {c.since ? ` · ${fmtDate(c.since)}` : ""}
                {c.incidents > 1 ? ` · ${c.incidents} incidents in all` : ""}
              </div>
              {c.reason ? (
                <div className="ex-frozen-reason">“{c.reason}”</div>
              ) : (
                <div className="ex-frozen-reason ex-frozen-nosay">Has not said what happened yet.</div>
              )}
            </div>
            <div className="ex-frozen-tools">
              {listening && (
                <button className="btn-ghost" title="Let this candidate play the recording again"
                        onClick={() => resetAudio(c.student_id, listening.assignment_id)}>
                  <RotateCcw size={13} /> Give the recording back
                </button>
              )}
              <button className="btn-primary" disabled={resuming === c.student_id}
                      onClick={() => allowResume(c.student_id)}>
                <Unlock size={14} /> {resuming === c.student_id ? "Letting in…" : "Let back in"}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );

  // Livraison 79 — the room, in « Everyone together » mode.
  const roomStarted = timed.filter((it) => it.room_started_at);
  const current = roomStarted[roomStarted.length - 1] || null;
  const nextItem = timed.find((it) => !it.room_started_at) || null;
  const endOf = (it) => (it?.room_started_at && it.assignment?.time_limit_minutes
    ? new Date(it.room_started_at).getTime() + it.assignment.time_limit_minutes * 60000 : null);
  const curEnd = endOf(current);
  const allHandedCurrent = current && roster.length > 0 && roster.every((st) => att.get(`${st.id}|${current.assignment_id}`)?.submitted_at);
  const canStartNext = !current || (curEnd !== null && now >= curEnd) || allHandedCurrent;
  const curCount = current ? {
    working: roster.filter((st) => { const t = att.get(`${st.id}|${current.assignment_id}`); return t?.started_at && !t.submitted_at; }).length,
    handed: roster.filter((st) => att.get(`${st.id}|${current.assignment_id}`)?.submitted_at).length,
  } : null;
  const roomBanner = stage === 1 && together && (
    free ? (
      <div className="exd-room exd-room-free" role="status">
        <span className="exd-room-ic">➜</span>
        <div className="exd-room-main">
          <b>Candidates continue on their own</b>
          <span className="dt-sub">Since {hm(session.free_from)}, each candidate who hands in a paper can start the next one when ready, with its full time.</span>
        </div>
      </div>
    ) : !current ? (
      <div className="exd-room exd-room-wait" role="status">
        <span className="exd-room-ic"><Clock size={20} /></span>
        <div className="exd-room-main">
          <b>Waiting room — {plural(roster.length, "candidate")} here</b>
          <span className="dt-sub">Nobody can see a paper yet. Start {nextItem?.assignment?.type || "the first paper"} when the room is ready.</span>
        </div>
        {nextItem && (
          <button className="btn-teal" disabled={busy === "start_item"} onClick={() => startForEveryone(nextItem, roster.length)}>
            <Play size={15} /> Start {nextItem.assignment?.type} for everyone
          </button>
        )}
      </div>
    ) : (
      <div className="exd-room exd-room-run" role="status">
        <span className="exd-num exd-room-num">{sorted.indexOf(current) + 1}</span>
        <div className="exd-room-main">
          <b>{current.assignment?.type} — started {hm(current.room_started_at)}{curEnd ? ` · ends ${hm(new Date(curEnd).toISOString())}` : ""}</b>
          <span className="dt-sub">{curCount.working} working · {curCount.handed} handed in · {roster.length - curCount.working - curCount.handed} not started</span>
        </div>
        {curEnd && <b className="exd-room-left">{curEnd > now ? left(curEnd - now) : "time over"}</b>}
        <button className="btn-ghost" disabled={busy === "free"} onClick={letContinue}>Let candidates continue on their own</button>
        {nextItem && (
          <button className="btn-teal" disabled={!canStartNext || busy === "start_item"}
                  title={canStartNext ? "" : "Available when this paper is over, or when everyone has handed it in"}
                  onClick={() => startForEveryone(nextItem, roster.length)}>
            <Play size={15} /> Start {nextItem.assignment?.type}{!canStartNext && curEnd ? ` · from ${hm(new Date(curEnd).toISOString())}` : ""}
          </button>
        )}
      </div>
    )
  );

  const candidatesTab = roster.length === 0 ? (
    <p className="empty-inline">Nobody has joined yet. Candidates join with the code {session.code}.</p>
  ) : (
    <>
      <div className="dt-toolbar">
        <div className="dt-chips" role="group" aria-label="Show">
          {[["all", "All", roster.length], ["working", "Working", liveCount("working")], ["finished", "Finished", liveCount("finished")],
            ["suspended", "Suspended", liveCount("suspended")], ["waiting", "Not started", liveCount("waiting")]]
            .filter(([k, , n]) => k === "all" || n > 0 || filter === k)
            .map(([k, l, n]) => (
              <button key={k} type="button" className={`dt-chip ${filter === k ? "on" : ""}`} aria-pressed={filter === k} onClick={() => setFilter(k)}>{l} {n}</button>
            ))}
        </div>
        <span className="panel-note">{watched > 0 ? `${plural(watched, "incident")} noted · ` : ""}updated every 20 s</span>
      </div>
      <div className="dt-wrap exd-scroll">
        <table className="dt exd-matrix">
          <thead>
            <tr>
              <th>Candidate</th>
              {together && <th className="exd-c">Arrived</th>}
              {sorted.map((it, i) => <th key={it.id} className="exd-c">{i + 1} · {it.assignment?.type || "Paper"}</th>)}
              <th className="exd-c">Status</th>
            </tr>
          </thead>
          <tbody>
            {shownLive.map(({ st, status }) => (
              <tr key={st.id}>
                <td><span className="exd-person"><span className="avatar small">{st.name.slice(0, 1).toUpperCase()}</span><b>{st.name}</b></span></td>
                {together && (() => {
                  const first = timed.find((it) => it.room_started_at);
                  const late = first && st.joined_at && new Date(st.joined_at) > new Date(first.room_started_at);
                  return <td className={`exd-c ${late ? "exd-late" : ""}`}>{st.joined_at ? hm(st.joined_at) : "—"}{late ? " · late" : ""}</td>;
                })()}
                {sorted.map((it, i) => {
                  const c = liveCell(st, it, i);
                  return (
                    <td key={it.id} className={`exd-c exd-${c.kind}`}>
                      {c.kind === "lock" ? <Lock size={13} aria-label="locked" /> : c.text}
                      {c.extra > 0 && <span className="exd-extra" title="Extra minutes given">+{c.extra} min</span>}
                      {c.canExtend && (
                        <button type="button" className="exd-plus" title={`Give ${st.name} extra minutes`}
                                onClick={() => setExtraFor({ st, it, minutes: 5 })}>+ min</button>
                      )}
                    </td>
                  );
                })}
                <td className="exd-c"><span className={`pill ${STATUS[status][1]}`}>{STATUS[status][0]}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );

  const resultsTab = roster.length === 0 ? (
    <p className="empty-inline">Nobody sat this exam.</p>
  ) : grid === null ? <CenterSpinner /> : (
    <>
      <div className="stat-grid">
        <div className="stat"><div className="stat-l">Average overall</div><div className="stat-v">{fmtBand(average(overalls))}</div>
          <div className="stat-d">{overalls.length ? `band · ${overalls.length} complete of ${roster.length}` : "no complete result yet"}</div></div>
        {scoredPapers.slice(0, 3).map((it) => {
          const cells = roster.map((st) => cellOf(st.id, it)).filter(Boolean);
          const handed = cells.filter((c) => c.open).length;
          const isW = it.assignment.type === "Writing";
          const marked = cells.filter((c) => c.band !== null && c.band !== undefined && c.band !== "").length;
          return (
            <div key={it.id} className="stat">
              <div className="stat-l">{it.assignment.type}</div>
              <div className="stat-v">{fmtBand(average(cells.filter((c) => c.open).map((c) => c.band)))}</div>
              <div className="stat-d">{isW ? `${marked}/${handed} marked` : `average band · ${handed}/${roster.length} handed in`}</div>
            </div>
          );
        })}
      </div>
      <div className="dt-wrap exd-scroll">
        <table className="dt exd-matrix">
          <thead>
            <tr>
              <th>Candidate</th>
              {sorted.map((it) => <th key={it.id} className="exd-c">{it.assignment?.type || "Paper"}</th>)}
              <th className="exd-c">Overall</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {roster.map((st) => {
              const o = overallOf(st);
              const firstToMark = sorted.find((it) => cellOf(st.id, it)?.status === "to-mark" && cellOf(st.id, it)?.band == null);
              const firstOpen = sorted.find((it) => it.assignment?.type !== "Speaking" && cellOf(st.id, it)?.open);
              return (
                <tr key={st.id}>
                  <td><span className="exd-person"><span className="avatar small">{st.name.slice(0, 1).toUpperCase()}</span><b>{st.name}</b></span></td>
                  {sorted.map((it) => {
                    const c = cellOf(st.id, it);
                    const type = it.assignment?.type;
                    let body = <span className="dt-muted">—</span>;
                    if (type === "Speaking") body = c?.status === "viewed" ? "✓ viewed" : body;
                    else if (type === "Writing") {
                      if (c?.open && c.band != null && c.band !== "") {
                        body = <button type="button" className="dt-open" onClick={() => openCopy(st, it)}><b>{fmtBand(c.band)}</b>{!c.bandPublished && <span className="dt-sub" style={{ display: "block" }}>not published</span>}</button>;
                      } else if (c?.open) body = <button type="button" className="pill pill-amber pill-btn" onClick={() => openCopy(st, it)}>To mark</button>;
                      else if (c?.status === "in-progress") body = <span className="dt-muted">not handed in</span>;
                    } else if (c?.score) {
                      body = <button type="button" className="dt-open" onClick={() => openCopy(st, it)}>{c.score.earned}/{c.score.total ?? "?"} · <b>{fmtBand(c.band)}</b></button>;
                    } else if (c?.status === "in-progress") body = <span className="dt-muted">not handed in</span>;
                    return <td key={it.id} className="exd-c">{body}</td>;
                  })}
                  <td className="exd-c"><b>{o === null ? "—" : o.toFixed(1)}</b></td>
                  <td style={{ textAlign: "right" }}>
                    {firstToMark ? <button className="btn-ghost btn-go" onClick={() => openCopy(st, firstToMark)}>Mark →</button>
                      : firstOpen ? <button className="btn-ghost btn-go" onClick={() => openCopy(st, firstOpen)}>Open →</button> : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="panel-note" style={{ marginTop: 10 }}>
        Click a score to open that copy (the same correction screen as in a class). Bands: the teacher's band if given, otherwise the IELTS estimate.
        The overall band is the average of the Listening, Reading and Writing bands, rounded like IELTS.
        {session.results_released_at ? " The candidates can see their results." : " Nothing is visible to candidates before « Publish the results »."}
      </p>
    </>
  );

  return (
    <div className="page page-dash">
      <Breadcrumb items={[{ label: "Exams", onClick: () => setScreen({ name: "exams" }) }, { label: session.name }]} />

      <div className="ph">
        <div className="ph-main">
          <span className="ph-icon type-ic ic-dark"><ShieldCheck size={21} /></span>
          <div>
            <div className="eyebrow">Exam · {["prepared", "running", "closed", "results published"][stage]}</div>
            <h1 className="ph-title">{session.name}</h1>
            <div className="ph-meta">
              <ExamStateBadge session={session} toMark={toMarkCount} />
              {copyPill}
              {windowPill}
              {stage > 0 && <span className="pill"><Users size={13} /> {plural(roster.length, "candidate")}</span>}
            </div>
          </div>
        </div>
        {actions}
      </div>

      <Stepper steps={STAGE_NAMES} current={stage === 3 ? 4 : stage} />

      {uncollected > 0 && (
        <div className="ex-frozen-row" role="alert" style={{ marginBottom: 14 }}>
          <ShieldAlert size={17} className="ex-frozen-icon" />
          <div className="ex-frozen-main">
            <div className="ex-item-title">
              {uncollected} paper{uncollected > 1 ? "s" : ""} could not be collected
            </div>
            <div className="ex-item-sub">
              We try again at every refresh (every 8 seconds). Keep this page open.
            </div>
          </div>
        </div>
      )}
      {invigilation}
      {roomBanner}

      {stage === 0 ? (
        <div className="exd-grid">
          <div>{papersPanel}{readyPanel}</div>
          <div>{settingsPanel}{teachersPanel}</div>
        </div>
      ) : (
        <>
          <div className="tabs" role="tablist">
            {tabsOf.map((k) => (
              <button key={k} role="tab" aria-selected={shownTab === k} className={`tab ${shownTab === k ? "active" : ""}`} onClick={() => setTab(k)}>
                {k === "candidates" ? `Candidates (${roster.length})` : k === "results" ? `Results (${roster.length})` : k === "papers" ? `Papers (${sorted.length})` : k === "teachers" ? `Teachers (${staff.length})` : "Settings"}
              </button>
            ))}
          </div>
          {shownTab === "candidates" && candidatesTab}
          {shownTab === "results" && resultsTab}
          {shownTab === "papers" && papersPanel}
          {shownTab === "settings" && settingsPanel}
          {shownTab === "teachers" && teachersPanel}
        </>
      )}

      {extraFor && (() => {
        const t = attempts.find((a) => a.student_id === extraFor.st.id && a.assignment_id === extraFor.it.assignment_id);
        const lim = extraFor.it.assignment?.time_limit_minutes || 0;
        const end = t?.started_at ? new Date(t.started_at).getTime() + lim * 60000 : null;
        const first = sorted.filter((it) => it.assignment && it.assignment.type !== "Speaking").find((it) => it.room_started_at);
        const delay = first && extraFor.st.joined_at ? Math.round((new Date(extraFor.st.joined_at) - new Date(first.room_started_at)) / 60000) : 0;
        const fmt = (ms) => new Date(ms).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
        const choices = [...new Set([5, 10, 15, ...(delay > 0 && delay <= 60 ? [delay] : [])])].sort((a, b) => a - b);
        return (
          <Modal title={`Extra time for ${extraFor.st.name}`} onClose={() => setExtraFor(null)}>
            <p className="muted-p" style={{ marginTop: 0 }}>
              {extraFor.it.assignment?.type} · {extraFor.it.assignment?.title}
              {delay > 0 ? ` · arrived ${delay} min after the start` : ""}
            </p>
            <div className="dt-chips" role="group" aria-label="Minutes">
              {choices.map((m) => (
                <button key={m} type="button" className={`dt-chip ${extraFor.minutes === m ? "on" : ""}`} aria-pressed={extraFor.minutes === m}
                        onClick={() => setExtraFor({ ...extraFor, minutes: m })}>+ {m} min{m === delay ? " (delay)" : ""}</button>
              ))}
              <label className="exd-other">Other
                <input type="number" min="1" max="60" className="field-input" value={extraFor.minutes}
                       onChange={(e) => setExtraFor({ ...extraFor, minutes: Math.max(1, Math.min(60, Number(e.target.value) || 1)) })} />
              </label>
            </div>
            {end && (
              <div className="set exd-ends"><span>Ends for {extraFor.st.name}</span>
                <b>{fmt(end + extraFor.minutes * 60000)} instead of {fmt(end)}</b></div>
            )}
            <p className="field-hint">Only for this paper and this candidate. « Close the exam » still ends everything, extra time included.</p>
            <div className="ex-actions" style={{ marginTop: 16 }}>
              <button className="btn-ghost" onClick={() => setExtraFor(null)}>Cancel</button>
              <button className="btn-primary" disabled={giving} onClick={giveExtra}>
                {giving ? "Saving…" : `Give ${extraFor.minutes} minute${extraFor.minutes === 1 ? "" : "s"}`}
              </button>
            </div>
          </Modal>
        );
      })()}

      {addOpen && (
        <Modal title="Add a paper to this exam" onClose={() => setAddOpen(false)}>
          <p className="muted-p" style={{ marginTop: 0 }}>
            The paper is built inside this exam. It belongs to no class, so no student can
            find it before the day.
          </p>
          <div className="ex-build-list">
            <button className="ex-build" onClick={() => build("test-importer")}>
              <FileText size={17} />
              <span><strong>Import a test</strong><em>A Word or PDF file — the whole paper at once. Reading and Listening.</em></span>
            </button>
            <button className="ex-build" onClick={() => build("reading-builder")}>
              <ShieldCheck size={17} />
              <span><strong>Reading</strong><em>Build it question by question.</em></span>
            </button>
            <button className="ex-build" onClick={() => build("listening-builder")}>
              <Headphones size={17} />
              <span><strong>Listening</strong><em>With its recording.</em></span>
            </button>
            <button className="ex-build" onClick={() => build("writing-builder")}>
              <FileText size={17} />
              <span><strong>Writing</strong><em>Task 1 and Task 2.</em></span>
            </button>
            <button className="ex-build" onClick={() => build("speaking-builder")}>
              <Users size={17} />
              <span><strong>Speaking</strong><em>Topics and cue cards to consult.</em></span>
            </button>
          </div>
        </Modal>
      )}

      {renaming !== null && (
        <Modal title="Rename this exam" onClose={() => setRenaming(null)}>
          <label className="field-label">Name</label>
          <input className="field-input" value={renaming} autoFocus
                 onChange={(e) => setRenaming(e.target.value)}
                 onKeyDown={(e) => { if (e.key === "Enter" && renaming.trim()) doRename(); }} />
          <button className="btn-primary" style={{ marginTop: 16 }}
                  disabled={!renaming.trim() || manageBusy === "rename"} onClick={doRename}>
            {manageBusy === "rename" ? "Saving…" : "Save"}
          </button>
        </Modal>
      )}

      {dupOpen !== null && (
        <Modal title="Duplicate this exam" onClose={() => setDupOpen(null)}>
          <p className="muted-p" style={{ marginTop: 0 }}>
            The copy gets the same papers, in the same order, with their passages, questions
            and answer keys — and its own code. It starts closed, with nobody in it.
            The candidates, the copies and the results of this exam are not carried over,
            and neither is the opening window: that belongs to a particular day.
          </p>
          <label className="field-label">Name of the copy</label>
          <input className="field-input" value={dupOpen} autoFocus
                 onChange={(e) => setDupOpen(e.target.value)}
                 onKeyDown={(e) => { if (e.key === "Enter" && manageBusy !== "dup") doDuplicate(); }} />
          <button className="btn-primary" style={{ marginTop: 16 }} disabled={manageBusy === "dup"} onClick={doDuplicate}>
            {manageBusy === "dup" ? "Copying…" : "Duplicate"}
          </button>
        </Modal>
      )}

      {delOpen && (
        <Modal title="Delete this exam?" onClose={() => setDelOpen(false)}>
          {roster.length === 0 ? (
            <p className="muted-p" style={{ marginTop: 0 }}>
              Nobody has sat this exam. Its {sorted.length} paper{sorted.length === 1 ? "" : "s"} will be
              deleted with it. This cannot be undone.
            </p>
          ) : (
            <>
              <p className="muted-p" style={{ marginTop: 0 }}>
                <strong>{roster.length} candidate{roster.length > 1 ? "s have" : " has"} sat this exam.</strong>{" "}
                Deleting it removes their papers, their answers and their marks for good.
                Nothing can bring them back.
              </p>
              <label className="field-label">Type the name of the exam to confirm</label>
              <input className="field-input" value={delTyped} autoFocus placeholder={session.name}
                     onChange={(e) => setDelTyped(e.target.value)} />
            </>
          )}
          <div className="ex-actions" style={{ marginTop: 18 }}>
            <button className="btn-ghost" onClick={() => setDelOpen(false)}>Cancel</button>
            <button
              className="btn-primary ex-delete-confirm"
              disabled={manageBusy === "del" || (roster.length > 0 && delTyped.trim() !== session.name)}
              onClick={doDelete}
            >
              <Trash2 size={14} /> {manageBusy === "del" ? "Deleting…" : "Delete the exam"}
            </button>
          </div>
        </Modal>
      )}

      {closeAsk && closeAsk !== "counting" && (
        <Modal title="Close the exam?" onClose={() => setCloseAsk(null)}>
          {closeAsk.working === null ? (
            <p className="muted-p" style={{ marginTop: 0 }}>
              The number of candidates still writing could not be counted.{" "}
              <strong>Every paper still being written will be handed in now, as it is.</strong>{" "}
              This cannot be undone, even if you reopen the exam.
            </p>
          ) : closeAsk.working === 0 ? (
            <p className="muted-p" style={{ marginTop: 0 }}>
              <strong>Nobody is writing right now.</strong> Closing is safe: no candidate
              will be able to open a paper again.
            </p>
          ) : (
            <>
              <p className="muted-p" style={{ marginTop: 0 }}>
                <strong>
                  {closeAsk.working} candidate{closeAsk.working > 1 ? "s are" : " is"} still writing.
                </strong>{" "}
                <strong>Every paper still being written will be handed in now, as it is</strong>{" "}
                — pens down, like at the end of a real exam. Their screens will say so within
                a few seconds, and nobody will be able to open a new paper.
                This cannot be undone, even if you reopen the exam.
              </p>
              {closeAsk.names.length > 0 && (
                <div className="ex-people" style={{ marginTop: 4 }}>
                  {closeAsk.names.map((n) => (
                    <div key={n} className="ex-person">
                      <div className="avatar small">{n.slice(0, 1).toUpperCase()}</div>
                      <span>{n}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
          <div className="ex-actions" style={{ marginTop: 18 }}>
            <button className="btn-ghost" onClick={() => setCloseAsk(null)}>Cancel</button>
            <button className="btn-primary" disabled={busy === "close"} onClick={() => { setCloseAsk(null); act("close"); }}>
              <Square size={14} /> Close the exam
            </button>
          </div>
        </Modal>
      )}

      {openAsk && (
        <Modal title="Open the exam?" onClose={() => setOpenAsk(false)}>
          <p className="muted-p" style={{ marginTop: 0 }}>
            <strong>
              {sorted.filter((it) => replayIds.has(it.assignment_id)).map((it) => it.assignment?.title || "A Listening paper").join(", ")}
            </strong>{" "}
            {sorted.filter((it) => replayIds.has(it.assignment_id)).length > 1 ? "let" : "lets"} candidates pause and
            replay the recording, like a practice test. In the real IELTS the recording is heard once.
          </p>
          <p className="muted-p">
            To change it (one recording for the whole test): cancel, open the paper, choose{" "}
            <em>Edit assignment</em>, tick “Exam mode: one listening only” and use{" "}
            <em>Save title and settings only</em>.
          </p>
          <div className="ex-actions" style={{ marginTop: 18 }}>
            <button className="btn-ghost" onClick={() => setOpenAsk(false)}>Cancel</button>
            <button className="btn-primary" disabled={busy === "open"} onClick={() => { setOpenAsk(false); act("open"); }}>
              <Play size={15} /> Open anyway
            </button>
          </div>
        </Modal>
      )}

      {staffOpen && (
        <Modal title="Invite a teacher" onClose={() => setStaffOpen(false)}>
          <p className="muted-p" style={{ marginTop: 0 }}>
            An invited teacher can watch the exam, let a candidate back in, and mark the papers.
            Only you can delete the exam.
          </p>
          {teachers === null ? (
            <p className="empty-inline">Loading…</p>
          ) : teachers.filter((t) => !staff.some((s) => s.id === t.id)).length === 0 ? (
            <p className="empty-inline">
              Nobody else to invite — every teacher of this school is already on this exam.
            </p>
          ) : (
            <div className="ex-people" style={{ marginTop: 12 }}>
              {teachers.filter((t) => !staff.some((s) => s.id === t.id)).map((t) => (
                <button key={t.id} className="ex-person ex-person-pick" onClick={() => addStaff(t.id)}>
                  <div className="avatar small">{(t.name || "?").slice(0, 1).toUpperCase()}</div>
                  <span>{t.name}</span>
                  <UserPlus size={14} />
                </button>
              ))}
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

// <input type="datetime-local"> speaks local time without a zone;
// the database stores an instant. These two keep them in step.
function toLocal(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocal(v) {
  return v ? new Date(v).toISOString() : null;
}
