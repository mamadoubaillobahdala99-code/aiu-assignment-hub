import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  ArrowLeft, Copy, CheckCircle2, Plus, Users, Play, Square,
  Send, Trash2, ShieldCheck, Pencil, Files, ShieldAlert, Download, Clock,
} from "lucide-react";
import { supabase } from "../../supabaseClient";
import { CenterSpinner, LoadFailed } from "../../components/shared";
import { ExamStateBadge } from "./ExamSessionsHome";
import { confirmDialog } from "../../lib/confirmDialog";
import { DropMenu, DropMenuItem, DropMenuSeparator, Breadcrumb } from "../../components/DropMenu";
import { Stepper } from "../question-engine/BuilderLayout";
import { fmtWhen } from "../question-engine/ResultParts";
import { examStage, STAGE_NAMES, loadExamGrid, resultsCsv, downloadText, left } from "./examWork";
import { renderPapersPanel, renderReadyPanel, renderSettingsPanel, renderTeachersPanel } from "./ExamPrepare";
import { renderInvigilation, renderRoomBanner, renderCandidatesTab } from "./ExamLiveBoard";
import { renderResultsTab } from "./ExamResults";
import { renderDialogs } from "./ExamDialogs";

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
  const [exportOpen, setExportOpen] = useState(false);   // livraison 91: Excel export
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
  // Livraison 95d: a failed read is never « 0 candidates », « Papers (0) »
  // or « This exam no longer exists ». First load: « Could not load —
  // Retry ». A later refresh that fails keeps what is on screen and says
  // so (never blanks the board during an exam). The results grid: never
  // shown (nor exported) from a failed read.
  const [readFailed, setReadFailed] = useState(false);
  const [gridFailed, setGridFailed] = useState(false);
  const loadIdRef = useRef(0);   // a late answer of an older reading is ignored
  const gridIdRef = useRef(0);
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
    const myId = ++loadIdRef.current;
    const stale = () => myId !== loadIdRef.current;
    const itemsQuery = () => supabase
      .from("exam_session_items")
      .select("id, assignment_id, order_index, audio_started_at, room_started_at")
      .eq("session_id", sessionId)
      .order("order_index");
    const firstReads = await Promise.all([
      supabase.from("exam_sessions").select("*").eq("id", sessionId).maybeSingle(),
      itemsQuery(),
      supabase.from("exam_session_staff").select("teacher_id, role, profiles(name)").eq("session_id", sessionId),
      supabase.from("exam_extra_time").select("assignment_id, student_id, minutes").eq("session_id", sessionId),
    ]);
    if (stale()) return;
    if (firstReads.some((x) => x.error)) { setReadFailed(true); return; }
    const [{ data: s }, { data: firstRows }, { data: st }, { data: xt }] = firstReads;
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
      : Promise.resolve([{ data: [], error: null }, { data: [], error: null }]);

    // Papers built inside this exam. Anything sitting in the private
    // container that is not yet a paper of this exam has just been
    // built — adopt it, in the order it was created.
    let [containerRead, rosterRead, paperReads] = await Promise.all([
      supabase
        .from("assignments")
        .select("id, title, type, time_limit_minutes, created_at, listening_audio_url, listening_exam_mode")
        .eq("class_id", s.container_class_id)
        .order("created_at"),
      supabase.from("roster").select("student_id, joined_at, profiles(name)").eq("class_id", s.container_class_id),
      perPaper(rows.map((x) => x.assignment_id)),
    ]);
    if (stale()) return;
    if (containerRead.error || rosterRead.error || paperReads.some((x) => x.error)) { setSession(s); setReadFailed(true); return; }
    const inContainer = containerRead.data;
    const r = rosterRead.data;

    const known = new Set(rows.map((x) => x.assignment_id));
    const orphans = (inContainer || []).filter((a) => !known.has(a.id));
    if (orphans.length > 0) {
      let next = rows.reduce((m, x) => Math.max(m, x.order_index), 0);
      const toAdd = orphans.map((a) => ({ session_id: sessionId, assignment_id: a.id, order_index: ++next }));
      await supabase.from("exam_session_items").insert(toAdd);
      const { data: again, error: againErr } = await itemsQuery();
      if (stale()) return;
      if (againErr) { setSession(s); setReadFailed(true); return; }
      rows = again || [];
      paperReads = await perPaper(rows.map((x) => x.assignment_id));
      if (stale()) return;
      if (paperReads.some((x) => x.error)) { setSession(s); setReadFailed(true); return; }
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
    setReadFailed(false);

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
    const myId = ++gridIdRef.current;
    try {
      const g = await loadExamGrid(list, roster);
      if (myId === gridIdRef.current) { setGrid(g); setGridFailed(false); }
    } catch {
      if (myId === gridIdRef.current) setGridFailed(true);
    }   // keep the last good grid (or none): never an empty one
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

  if (readFailed && !loaded) {
    return (
      <div className="page page-dash">
        <Breadcrumb items={[{ label: "Exams", onClick: () => setScreen({ name: "exams" }) }, { label: "Exam" }]} />
        <LoadFailed what="this exam" onRetry={() => { setReadFailed(false); load(); }} />
      </div>
    );
  }
  if (session === null) return <CenterSpinner />;
  // Livraison 95d: until everything is read, a spinner — never « 0
  // candidates » / « Papers (0) » for a moment.
  if (session !== false && !loaded) return <CenterSpinner />;
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


  function exportCsv() {
    if (gridFailed || grid === null) { showToast?.("The results could not be loaded — try again before exporting."); return; }
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
        <DropMenu label={<><Download size={15} /> Export ▾</>} className="btn-ghost" title="Export the results" disabled={grid === null || roster.length === 0}>
          <DropMenuItem title="Excel (.xlsx)…" hint="Colours, Speaking to fill in, IELTS average." onClick={() => { if (gridFailed || grid === null) { showToast?.("The results could not be loaded — try again before exporting."); return; } setExportOpen(true); }} />
          <DropMenuItem title="CSV" hint="Plain table, as before." onClick={exportCsv} />
        </DropMenu>
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
  // Livraison 98 — what the panels, tabs and windows show (see
  // ExamPrepare, ExamLiveBoard, ExamResults, ExamDialogs). Only names: the
  // values, the buttons and the calls are the ones of this page.
  const v = {
    act, addOpen, addStaff, allowResume, att, attempts, build, busy, cellOf, closeAsk, delOpen, delTyped,
    doDelete, doDuplicate, doRename, dupOpen, examOpen, exportOpen, extraFor, extras, filter, free, frozen,
    frozenIds, giveExtra, giving, grid, gridFailed, hm, isOwner, letContinue, loadGrid, manageBusy, move,
    notStarted, now, openAsk, openCopy, openPaper, openStaff, plural, progress, removeItem, removeStaff,
    renaming, replayIds, resetAudio, resuming, roster, session, setAddOpen, setCloseAsk, setDelOpen,
    setDelTyped, setDupOpen, setExportOpen, setExtraFor, setFilter, setGridFailed, setOpenAsk, setRenaming,
    setSetting, setStaffOpen, showToast, sorted, staff, staffOpen, stage, startForEveryone, teachers, timed,
    together, watched, withContent,
  };

  return (
    <div className="page page-dash">
      <Breadcrumb items={[{ label: "Exams", onClick: () => setScreen({ name: "exams" }) }, { label: session.name }]} />

      {(readFailed || (gridFailed && grid !== null)) && (
        <div className="cd-del-warning" role="alert" style={{ marginBottom: 12 }}>
          <span>
            Could not refresh this page — what you see may be out of date. Check your internet connection and{" "}
            <button type="button" className="panel-link" onClick={() => { setReadFailed(false); load(); loadGrid(); }}>try again</button>.
          </span>
        </div>
      )}

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
      {renderInvigilation(v)}
      {renderRoomBanner(v)}

      {stage === 0 ? (
        <div className="exd-grid">
          <div>{renderPapersPanel(v)}{renderReadyPanel(v)}</div>
          <div>{renderSettingsPanel(v)}{renderTeachersPanel(v)}</div>
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
          {shownTab === "candidates" && renderCandidatesTab(v)}
          {shownTab === "results" && renderResultsTab(v)}
          {shownTab === "papers" && renderPapersPanel(v)}
          {shownTab === "settings" && renderSettingsPanel(v)}
          {shownTab === "teachers" && renderTeachersPanel(v)}
        </>
      )}

      {renderDialogs(v)}
    </div>
  );
}

