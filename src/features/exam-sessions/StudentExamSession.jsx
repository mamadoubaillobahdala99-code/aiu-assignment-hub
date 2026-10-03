import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  ShieldCheck, Lock, CheckCircle2, Play, Headphones, FileText,
  ArrowLeft, Flag, Hourglass, MinusCircle, Smartphone, Laptop, ChevronRight,
} from "lucide-react";
import { supabase } from "../../supabaseClient";
import { CenterSpinner } from "../../components/shared";
import { Breadcrumb } from "../../components/DropMenu";
import { CodeBoxes } from "../../components/CodeBoxes";
import { TYPES, fmtDate } from "../../lib/utils";
import { examStage, fmtBand } from "./examWork";
import { loadMyExamBands } from "./studentExamWork";
import { AssignmentOpenBridge } from "../question-engine/AssignmentOpenBridge";
import { isPhoneScreen } from "../question-engine/useInvigilation";

// The candidate's screen for an exam session.
//
//   join with the code → the papers in order → one paper at a time →
//   "Exam finished, you may leave".
//
// The order is NOT enforced here. The database decides: exam_session_status
// returns, for every paper, whether it is readable right now, and a locked
// paper has neither content nor timer. This screen only draws what the
// server says, so a candidate who tampers with it gains nothing.
//
// Livraison 79 — « Everyone together » (script 46): when the teacher starts
// each paper for the whole room, this list shows the waiting room, « Waiting
// for the teacher to start … », the time left for a late candidate, and a
// paper missed. It still only draws what the server says; the paper's own
// screen is unchanged.
//
// Livraison 80 — the code in 6 boxes, « My past exams » with the overall
// band once the results are published, and a past exam opened from that
// list is kept in the address (#/student-exam?exam=…): Back returns to the
// list, F5 stays on it. The exam a candidate is SITTING still opens by
// itself, never through the address, and its papers open exactly as before.
// Nothing here writes to the database except join_exam (unchanged).
//
// A paper opens INSIDE this screen (the same bridge the classes use), so
// finishing one brings the candidate straight back to the list without
// ever passing through the normal app — which is what an exam room needs.
// A paper that opens full screen from the click that opens it, so the
// start screen is already full screen (Start keeps it). Only the papers
// that are watched; never a phone, never a device without full screen.
// A refusal changes nothing: the paper opens and Start asks again.
// Full screen also comes with the click on "Enter the exam" (livraison
// 49): the candidate walks into the exam room already in full screen.
// The click on a paper still asks too — for the candidate who was
// already in the exam (no code to type) or who left full screen on the
// list, where nothing is watched.
const FULLSCREEN_TYPES = ["Reading", "Listening", "Writing"];
const CODE_LEN = 6;   // an exam code: 6 characters (create_exam_session, duplicate_exam_session)
// Returns true when THIS call is the one that asked for full screen.
function requestEnterFullscreen(onPhone) {
  const el = document.documentElement;
  if (onPhone || !el.requestFullscreen || document.fullscreenElement) return false;
  el.requestFullscreen().catch(() => {});
  return true;
}
function requestExamFullscreen(type, onPhone) {
  if (onPhone || !FULLSCREEN_TYPES.includes(type)) return;
  const el = document.documentElement;
  if (!el.requestFullscreen || document.fullscreenElement) return;
  el.requestFullscreen().catch(() => {});
}

export function StudentExamSession({ userId, screen, setScreen, showToast }) {
  const [sessions, setSessions] = useState(null);   // the exams I am a candidate of
  const [activeId, setActiveId] = useState(null);
  const [status, setStatus] = useState(null);       // exam_session_status(activeId)
  const [openPaper, setOpenPaper] = useState(null); // { assignmentId } while a paper is being taken
  // THE PAPER IN THE ADDRESS (#/student-exam?paper=…).
  // The open paper is kept in the address so that after F5 the candidate
  // lands straight back in it instead of on the list. The address is only
  // a MIRROR of openPaper: writing it never opens or closes anything, so
  // it can never reopen the paper's screen by itself (a reopened screen
  // is a new screen number, which freezes — livraison 47).
  // It is READ once, when the page loads; then only if the paper is an
  // open paper of MY current exam, not handed in, not out of time.
  // Anything else: the list, and the address is cleaned.
  const pendingPaperRef = useRef(screen?.paper || null);
  const [resolvingAddress, setResolvingAddress] = useState(Boolean(screen?.paper));
  const urlPaper = screen?.paper || null;
  // Livraison 80: a PAST exam opened from « My past exams ». Only a valid
  // session id is read; anything else is ignored.
  const urlExam = /^[0-9a-f-]{36}$/i.test(screen?.exam || "") ? screen.exam : null;
  const urlExamRef = useRef(urlExam);
  urlExamRef.current = urlExam;
  // Every screen this page writes keeps the past exam in the address.
  const here = useCallback((extra = {}) => ({ name: "student-exam", ...(urlExamRef.current ? { exam: urlExamRef.current } : {}), ...extra }), []);
  const [code, setCode] = useState(() => Array(CODE_LEN).fill(""));
  const [joining, setJoining] = useState(false);
  const [err, setErr] = useState("");
  // A real exam is not sat on a phone: no fullscreen at all on iPhone,
  // a keyboard over half the screen, a notification every few minutes —
  // and the invigilation cannot do its job. Re-measured on rotation so
  // turning the phone sideways changes nothing.
  const [onPhone, setOnPhone] = useState(() => isPhoneScreen());
  useEffect(() => {
    const check = () => setOnPhone(isPhoneScreen());
    window.addEventListener("resize", check);
    window.addEventListener("orientationchange", check);
    return () => {
      window.removeEventListener("resize", check);
      window.removeEventListener("orientationchange", check);
    };
  }, []);

  // ---------- which exams am I in? ----------
  const loadSessions = useCallback(async () => {
    // The database returns only the sessions this student has joined.
    const { data } = await supabase
      .from("exam_sessions")
      .select("id, name, code, container_class_id, opened_at, closed_at, opens_at, closes_at, results_released_at, created_at")
      .order("created_at", { ascending: false });
    const rows = data || [];
    setSessions(rows);
    // Sitting an exam right now? Go straight in — no extra click in the
    // room. A FINISHED exam never opens by itself, though: it used to,
    // whenever it was the only one, and that shut the door. The screen
    // opened on last week's finished paper, and the way back out was
    // hidden too (see the bottom of this file), so a student who had sat
    // exactly one exam could never reach the code box again — there was
    // no way left to enter a new exam at all.
    setActiveId((cur) => {
      if (cur && rows.some((r) => r.id === cur)) return cur;
      // Livraison 80: a past exam in the address (F5 on it) comes first.
      const asked = urlExamRef.current;
      if (asked && rows.some((r) => r.id === asked)) return asked;
      const live = rows.find((r) => !r.closed_at && !r.results_released_at);
      return live ? live.id : null;
    });
  }, []);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  // ---------- the state of the exam I am sitting ----------
  // An answer for an exam that is no longer the one on screen is dropped
  // (livraison 80: going from one exam to another quickly).
  const activeRef = useRef(activeId);
  activeRef.current = activeId;
  const loadStatus = useCallback(async () => {
    if (!activeId) { setStatus(null); return; }
    const { data, error } = await supabase.rpc("exam_session_status", { p_session_id: activeId });
    if (activeRef.current !== activeId) return;
    if (error) { setStatus(false); return; }
    setStatus(data);
  }, [activeId]);

  useEffect(() => { setStatus(null); loadStatus(); }, [loadStatus]);

  // ---------- livraison 80: a past exam in the address ----------
  // Opening one from the list writes it in the address; Back (or the
  // « Exam » link) takes it out and returns to where the list was shown.
  const pastFromRef = useRef(undefined);   // what was on screen before the past exam (undefined = opened by F5 / a link)
  const prevUrlExamRef = useRef(urlExam);
  useEffect(() => {
    const prev = prevUrlExamRef.current;
    prevUrlExamRef.current = urlExam;
    if (sessions === null) return;
    if (urlExam) {
      if (sessions.some((x) => x.id === urlExam)) setActiveId(urlExam);
      else setScreen({ name: "student-exam" });          // not one of my exams: the list
      return;
    }
    if (prev) {
      const back = pastFromRef.current;
      pastFromRef.current = undefined;
      if (back !== undefined) { setActiveId(back); return; }
      const live = sessions.find((r) => !r.closed_at && !r.results_released_at);
      setActiveId(live ? live.id : null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlExam, sessions]);
  function openPast(id) {
    pastFromRef.current = activeId;
    setScreen({ name: "student-exam", exam: id });
  }

  // ---------- livraison 80: my published bands ----------
  // Only for the exams whose results are published; read with my own rights.
  const [bands, setBands] = useState(() => new Map());
  const releasedKey = (sessions || []).filter((x) => x.results_released_at).map((x) => x.id).join(",");
  useEffect(() => {
    if (!releasedKey) { setBands(new Map()); return; }
    let cancelled = false;
    loadMyExamBands(userId, releasedKey.split(",")).then((m) => { if (!cancelled) setBands(m); }).catch(() => {});
    return () => { cancelled = true; };
  }, [releasedKey, userId]);

  // ---------- livraison 80: when I handed each paper in ----------
  // Read again only when a paper is handed in (not at every refresh).
  const [handedAt, setHandedAt] = useState({});
  const doneKey = status && status.items ? status.items.filter((i) => i.submitted).map((i) => i.assignment_id).join(",") : "";
  useEffect(() => {
    if (!doneKey) { setHandedAt({}); return; }
    let cancelled = false;
    supabase.from("exam_attempts").select("assignment_id, submitted_at").eq("student_id", userId).in("assignment_id", doneKey.split(","))
      .then(({ data }) => {
        if (cancelled) return;
        const m = {};
        for (const r of data || []) if (r.submitted_at) m[r.assignment_id] = r.submitted_at;
        setHandedAt(m);
      });
    return () => { cancelled = true; };
  }, [doneKey, userId]);

  const openPaperScreen = useCallback((assignmentId) => {
    setOpenPaper({ assignmentId });
    setScreen(here({ paper: assignmentId }));
  }, [setScreen, here]);
  const closePaperScreen = useCallback(() => {
    setOpenPaper(null);
    setScreen(here());
  }, [setScreen, here]);

  // The page has just loaded with a paper in the address (F5). Decide once.
  useEffect(() => {
    const pending = pendingPaperRef.current;
    if (!pending || sessions === null) return;
    const live = sessions.find((x) => x.id === activeId) || null;
    if (live && status === null) return;               // still reading the exam
    pendingPaperRef.current = null;                    // decided only once
    const it = live && status && status.items ? status.items.find((i) => i.assignment_id === pending) : null;
    const waitingForRoom = Boolean(it && status.listening_start === "grouped" && it.type === "Listening" && !it.audio_started_at);
    let ok = Boolean(it && it.readable && !it.submitted && !status.results_released_at && !status.closed_at && !onPhone && !waitingForRoom);
    (async () => {
      // Out of time? Read the start time in exam_attempts — NEVER the clock
      // function (exam_timer_status), which belongs to the paper's screen
      // only. A wrong computer clock can only lead to the list: harmless.
      if (ok && it.started && it.minutes) {
        const { data } = await supabase
          .from("exam_attempts")
          .select("started_at")
          .eq("assignment_id", pending)
          .eq("student_id", userId)
          .maybeSingle();
        if (data?.started_at && Date.now() > new Date(data.started_at).getTime() + it.minutes * 60000) ok = false;
      }
      if (ok) setOpenPaper({ assignmentId: pending });
      else setScreen(here());
      setResolvingAddress(false);
    })();
  }, [sessions, activeId, status, onPhone, userId, setScreen]);

  // Back / Forward in the browser. The paper leaving the address (Back) closes it,
  // exactly as before — reopening it is then a new screen, which freezes.
  // A paper appearing in the address (Forward, typed by hand) never opens
  // anything: the address is simply cleaned.
  // Watches the screen itself, not just the paper: Forward raises popstate
  // AND hashchange, and the second one writes the paper back into the
  // screen after it was cleaned — same paper, new object, so this runs
  // again and cleans it for good.
  useEffect(() => {
    if (pendingPaperRef.current || resolvingAddress) return;
    if (openPaper && !urlPaper) { setOpenPaper(null); loadStatus(); return; }
    if (!openPaper && urlPaper) setScreen(here());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen]);

  // While the list is showing, ask the server again every 10 seconds:
  // the teacher may have opened the exam, started the recording for the
  // whole room, closed it, or published the results. Never while a paper
  // is open — nothing must disturb a candidate who is writing.
  const statusRef = useRef(loadStatus);
  statusRef.current = loadStatus;
  // Livraison 79: every 5 seconds while the room waits for the teacher's
  // Start, so the Start button appears quickly for everyone.
  const waitingRoom = Boolean(status && status.start_mode === "together" && !status.free_from && !status.closed_at && !status.results_released_at
    && (status.items || []).some((i) => i.type !== "Speaking" && !i.room_started_at && !i.submitted && !i.missed));
  // (Livraison 80: not for an exam whose results are published — nothing
  // changes there any more.)
  const publishedNow = Boolean(status && status.results_released_at);
  useEffect(() => {
    if (!activeId || openPaper || publishedNow) return;
    const t = setInterval(() => statusRef.current(), waitingRoom ? 5000 : 10000);
    return () => clearInterval(t);
  }, [activeId, openPaper, waitingRoom, publishedNow]);

  const codeText = code.join("");
  const codeFull = code.every((c) => c);
  const joiningRef = useRef(false);   // a second Enter / click before the re-render
  async function join() {
    const c = codeText;
    if (!codeFull || joiningRef.current) return;
    joiningRef.current = true;
    // Asked inside the click (or the Enter key), before anything is
    // awaited: a browser only grants full screen to a gesture.
    const askedFs = requestEnterFullscreen(onPhone);
    setErr(""); setJoining(true);
    const { data, error } = await supabase.rpc("join_exam", { p_code: c });
    joiningRef.current = false;
    setJoining(false);
    if (error) {
      // Wrong code: back out of the full screen this click opened.
      if (askedFs && document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
      const m = error.message || "";
      setErr(
        /No exam found/i.test(m) ? "No exam with that code. Check it with your teacher."
        : /not open yet/i.test(m) ? "This exam is not open yet. Wait for your teacher."
        : /Invalid code/i.test(m) ? "That code does not look right."
        : "Could not join. Check your connection and try again."
      );
      return;
    }
    setCode(Array(CODE_LEN).fill(""));
    showToast?.(`You are in: ${data?.name || "the exam"}`);
    await loadSessions();
    setActiveId(data?.session_id || null);
  }

  // ---------- a paper is open ----------
  // The runner and the results screens only know how to go "home". Here
  // home is the exam itself, so their exits are caught and turned into a
  // return to the list, with a fresh reading of what is now unlocked.
  if (openPaper) {
    const session = sessions?.find((s) => s.id === activeId);
    return (
      <AssignmentOpenBridge
        userId={userId}
        classId={session?.container_class_id}
        assignmentId={openPaper.assignmentId}
        showToast={showToast}
        // Handed in: straight back to the list of papers, with a fresh
        // reading of what is unlocked now. No "waiting for feedback"
        // screen in between — that belongs to a class assignment, not to
        // an exam room where the next paper is waiting.
        onSubmitted={() => { closePaperScreen(); loadStatus(); }}
        setScreen={(next) => {
          if (next?.name === "assignment-student" && next.assignmentId) {
            openPaperScreen(next.assignmentId);
            return;
          }
          closePaperScreen();
          loadStatus();
        }}
      />
    );
  }

  if (sessions === null || resolvingAddress) return <CenterSpinner />;

  const session = sessions.find((s) => s.id === activeId) || null;
  const hm = (iso) => new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

  // Leaving an exam for the code page (« Exam » link, « Enter another exam »).
  function leave() {
    if (urlExam) { pastFromRef.current = null; setScreen({ name: "student-exam" }); }
    else setActiveId(null);
  }

  // ---------- not in an exam yet: the code ----------
  if (!session) {
    return (
      <div className="page page-wide">
        <div className={`exc-grid ${sessions.length ? "" : "solo"}`}>
          <div className="exc-card">
            <div className="eyebrow">Exam</div>
            <h1 className="ph-title exc-title">Enter the exam code</h1>
            <p className="exc-sub">
              Your teacher gives it when everyone is seated. It is not a class code — it opens the exam, and only on the day.
            </p>
            <CodeBoxes
              length={CODE_LEN}
              value={code}
              onChange={(v) => { setCode(v); setErr(""); }}
              onEnter={join}
              disabled={joining}
              bad={Boolean(err)}
              label="Exam code"
              autoFocus={!onPhone}
            />
            {err && <div className="field-error jc-err" role="alert">{err}</div>}
            <button className="btn-primary jc-go" disabled={!codeFull || joining} onClick={join}>
              {joining ? "Entering…" : "Enter the exam"}
            </button>
            <p className="exc-note"><Laptop size={14} /> A computer is needed — an exam cannot be sat on a phone.</p>
          </div>

          {sessions.length > 0 && (
            <div className="exc-past">
              <div className="exc-past-h">My past exams</div>
              {sessions.map((s) => {
                const st = examStage(s);
                const b = bands.get(s.id);
                const pill = st === 3 ? ["Results published", "teal"] : st === 2 ? ["Waiting for results", "wait"] : st === 1 ? ["Open now", "open"] : ["Not open yet", "wait"];
                const skills = st === 3 && b ? [...b.papers.values()].filter((p) => p.type !== "Speaking") : [];
                return (
                  <button key={s.id} type="button" className="exc-past-row" onClick={() => openPast(s.id)}>
                    <span className="exc-past-main">
                      <span className="exc-past-name">{s.name}</span>
                      <span className="exc-past-meta">
                        <span className={`exc-pill exc-pill-${pill[1]}`}>{pill[0]}</span>
                        <span>{fmtDate(s.opened_at || s.created_at)}</span>
                      </span>
                      {skills.length > 0 && (
                        <span className="exc-skills">
                          {skills.map((p, k) => <span key={k}>{p.type} {fmtBand(p.band)}</span>)}
                        </span>
                      )}
                    </span>
                    <span className="exc-past-band">{st === 3 ? (b && b.overall !== null ? `Band ${fmtBand(b.overall)}` : "—") : ""}</span>
                    <span className="exc-see">See <ChevronRight size={14} /></span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (status === null) return <CenterSpinner />;
  if (status === false) {
    return (
      <div className="page narrow">
        <Breadcrumb items={[{ label: "Exam", onClick: leave }, { label: session.name }]} />
        <h1 className="ph-title">{session.name}</h1>
        <p className="empty-inline">This exam is not available right now. Ask your teacher.</p>
        <button className="back-link" onClick={leave}><ArrowLeft size={14} /> Another exam</button>
      </div>
    );
  }

  const items = status.items || [];
  // Livraison 79 — « Everyone together ».
  const together = status.start_mode === "together";
  const roomFree = Boolean(status.free_from);
  const offsetMs = status.server_now ? new Date(status.server_now).getTime() - Date.now() : 0;
  const serverNow = Date.now() + offsetMs;
  const waitsForTeacher = (it) => together && !roomFree && it.type !== "Speaking" && !it.room_started_at && !it.submitted && !it.missed;
  const firstTimed = items.find((i) => i.type !== "Speaking");
  const noneStarted = together && !roomFree && firstTimed && !items.some((i) => i.room_started_at);
  const released = Boolean(status.results_released_at);
  const closed = Boolean(status.closed_at);
  const allDone = items.length > 0 && items.every((i) => i.submitted);
  // The next paper to sit: the first unlocked one that is not handed in.
  const nextId = released ? null : (items.find((i) => i.readable && !i.submitted) || {}).assignment_id;
  // Livraison 80.
  // A Speaking paper is consulted, never handed in: it is not counted.
  const toHand = items.filter((i) => i.type !== "Speaking");
  const handedCount = toHand.filter((i) => i.submitted).length;
  const canLeave = closed || released || allDone;
  const myBands = released ? bands.get(session.id) : null;
  const openUntil = !released && !closed && status.closes_at ? ` · open until ${hm(status.closes_at)}` : "";
  // A locked paper waits for an earlier one: which.
  const waitsFor = (idx) => {
    for (let k = 0; k < idx; k++) {
      const p = items[k];
      if (p.type !== "Speaking" && !p.submitted && !p.missed) return k + 1;
    }
    return null;
  };

  return (
    <div className="page page-wide">
      <Breadcrumb items={[{ label: "Exam", onClick: canLeave ? leave : undefined }, { label: session.name }]} />
      <div className="ph">
        <div className="ph-main">
          <div>
            <div className="eyebrow">Exam{openUntil}</div>
            <h1 className="ph-title">{session.name}</h1>
          </div>
        </div>
        <div className="ph-actions">
          {released && myBands && myBands.overall !== null
            ? <span className="pill pill-teal exc-overall">Overall band {fmtBand(myBands.overall)}</span>
            : toHand.length > 0 && <span className="pill pill-teal">{handedCount} of {toHand.length} handed in</span>}
        </div>
      </div>

      {/* ---------- the banner that says where we are ---------- */}
      {released ? (
        <div className="exs-banner exs-banner-done">
          <CheckCircle2 size={18} />
          <div>
            <strong>Results published.</strong>
            <em>
              You can open each paper again to see your marks and your corrected answers.
              {myBands && myBands.overall === null ? " Your overall band appears once every Listening, Reading and Writing paper has its band." : ""}
            </em>
          </div>
        </div>
      ) : allDone || closed ? (
        <div className="exs-banner exs-banner-end">
          <Flag size={18} />
          <div>
            <strong>Exam finished — you may leave the room.</strong>
            <em>
              {allDone
                ? "Every paper has been handed in. Nothing can be opened again."
                : "Your teacher has closed the exam."}{" "}
              Your results will appear here once your teacher publishes them.
            </em>
          </div>
        </div>
      ) : noneStarted ? (
        <div className="exs-wait" role="status">
          <span className="exs-wait-ic"><Hourglass size={26} /></span>
          <strong>Please wait — your teacher will start {firstTimed.type}</strong>
          <em>Everyone starts at the same time. The Start button appears here by itself; you don't need to refresh the page.</em>
          <span className="exs-wait-pills">
            <span className="pill">{firstTimed.title}{firstTimed.minutes ? ` · ${firstTimed.minutes} min` : ""}</span>
            {status.candidates > 0 && <span className="pill">{status.candidates} candidate{status.candidates === 1 ? "" : "s"} in the room</span>}
          </span>
          <span className="exs-live"><span className="exs-live-dot" aria-hidden="true" /> This page updates by itself</span>
        </div>
      ) : together && !roomFree ? (
        <div className="exs-banner">
          <Hourglass size={18} />
          <div>
            <strong>Everyone together: your teacher starts each paper.</strong>
            <em>
              Same start and same end for everyone. When you hand a paper in, wait here: the next one
              opens when your teacher starts it. This page updates by itself.
            </em>
          </div>
        </div>
      ) : (
        <div className="exs-banner">
          <Hourglass size={18} />
          <div>
            <strong>One paper at a time, in order.</strong>
            <em>
              When you hand a paper in, it closes for good and the next one unlocks.
              Take your break, then press Start when you are ready — nothing starts by itself.
            </em>
          </div>
        </div>
      )}

      {/* ---------- the papers ---------- */}
      {onPhone && !released && !closed && (
        <div className="exs-banner exs-banner-phone" style={{ marginTop: 16 }}>
          <Smartphone size={18} />
          <div>
            <strong>An exam cannot be sat on a phone.</strong>
            <em>
              Use a computer or a tablet. On a phone the screen cannot be locked to the exam,
              the keyboard hides your answers, and a notification would suspend you. You can
              stay on this page to follow the exam.
            </em>
          </div>
        </div>
      )}

      <div className="section-title" style={{ marginTop: 26 }}>
        Papers {toHand.length > 0 && <span className="ex-count">({handedCount}/{toHand.length} handed in)</span>}
      </div>

      {items.length === 0 ? (
        <p className="empty-inline">Your teacher has not put any paper in this exam yet.</p>
      ) : (
        <div className="ex-items">
          {items.map((it, i) => {
            const meta = TYPES[it.type] || {};
            const Icon = meta.icon || FileText;
            // A grouped Listening waits for the teacher's play button.
            const waitingForRoom =
              status.listening_start === "grouped" && it.type === "Listening" &&
              !it.audio_started_at && !it.submitted && !released;
            const isNext = it.assignment_id === nextId && !waitingForRoom;
            const myBand = myBands ? myBands.papers.get(it.assignment_id) : null;
            const after = waitsFor(i);

            return (
              <div key={it.item_id} className={`ex-item exs-item ${isNext ? "is-next" : ""} ${it.submitted && !released ? "is-done" : ""}`}>
                <div className="ex-item-order">{i + 1}</div>
                <Icon size={17} className="ex-item-icon" />
                <div className="ex-item-main">
                  <div className="ex-item-title">{it.title}</div>
                  <div className="ex-item-sub">
                    {it.type}
                    {it.minutes ? ` · ${it.minutes} minutes` : ""}
                    {it.submitted && handedAt[it.assignment_id] ? ` · handed in ${hm(handedAt[it.assignment_id])}` : ""}
                    {/* Livraison 79: a paper started for the room that I have not
                        started yet — when it ends, and how much time is left. */}
                    {together && it.room_started_at && !it.started && !it.submitted && !it.missed && it.minutes && it.readable && !released && !closed && (() => {
                      const startAt = new Date(it.start_if_now || it.room_started_at).getTime();
                      const end = startAt + it.minutes * 60000;
                      const leftMin = Math.max(0, Math.floor((end - serverNow) / 60000));
                      return <span className="exs-late"> · started at {hm(it.room_started_at)} — ends at {hm(new Date(end).toISOString())} · {leftMin} min left</span>;
                    })()}
                    {it.extra_minutes > 0 && <span className="exs-late"> · +{it.extra_minutes} min from your teacher</span>}
                  </div>
                </div>

                {/* A paper that was never handed in has no result to show
                    and nothing to open — the exam is over. Offering it
                    would put the candidate back inside the paper. */}
                {(released || closed) && it.type === "Speaking" ? (
                  <span className="exs-state">Speaking — nothing to hand in</span>
                ) : (released || closed) && !it.submitted ? (
                  <span className="exs-state"><MinusCircle size={14} /> Not handed in</span>
                ) : released ? (
                  <span className="exs-result">
                    {myBand && myBand.band !== null && myBand.band !== undefined
                      ? <span className="exs-band">Band {fmtBand(myBand.band)}</span>
                      : it.type === "Writing" ? <span className="exs-state">Not marked yet</span> : null}
                    <button className="btn-ghost" onClick={() => openPaperScreen(it.assignment_id)}>
                      See my result
                    </button>
                  </span>
                ) : it.submitted ? (
                  <span className="exs-state exs-state-done"><CheckCircle2 size={14} /> Handed in</span>
                ) : it.missed ? (
                  <span className="exs-state"><MinusCircle size={14} /> Missed — ended at {hm(new Date(new Date(it.room_started_at).getTime() + (it.minutes || 0) * 60000).toISOString())}</span>
                ) : waitsForTeacher(it) ? (
                  <span className="exs-state exs-state-wait"><Hourglass size={14} /> Waiting for the teacher to start {it.type}</span>
                ) : waitingForRoom ? (
                  <span className="exs-state"><Headphones size={14} /> Your teacher starts the recording</span>
                ) : it.readable && onPhone ? (
                  <span className="exs-state exs-state-phone"><Smartphone size={14} /> Computer or tablet only</span>
                ) : it.readable ? (
                  <button
                    className={isNext ? "btn-primary" : "btn-ghost"}
                    onClick={() => {
                      // Inside the click, or the browser refuses full screen.
                      requestExamFullscreen(it.type, onPhone);
                      openPaperScreen(it.assignment_id);
                    }}
                  >
                    <Play size={14} /> {it.started ? "Continue" : "Start"} paper {i + 1}
                  </button>
                ) : (
                  <span className="exs-state exs-state-lock"><Lock size={14} /> {after ? `After paper ${after}` : "Locked"}</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!released && !allDone && !closed && (
        <p className="muted-p" style={{ marginTop: 18, fontSize: 12.5 }}>
          <ShieldCheck size={13} style={{ verticalAlign: "-2px", marginRight: 5 }} />
          A locked paper is empty until its turn comes — not hidden, empty. There is
          nothing to find before your teacher's exam reaches it.
          {status.strict_mode && !onPhone ? " Full screen starts with each Reading, Listening and Writing paper; leaving it pauses your exam until a teacher lets you back in." : ""}
        </p>
      )}

      {/* Always offered once the exam is over — it used to appear only
          for a student who had more than one exam, which is precisely
          the student who did not need it. The one with a single finished
          exam was the one with no way out. It leads back to the code
          box, so it is also how the next exam is entered.
          Also once every paper is handed in, even before the teacher
          closes the exam: such an exam still opens by itself, and without
          this link the candidate could never reach the code box of the
          next one (livraison 49). */}
      {canLeave && (
        <button className="back-link" style={{ marginTop: 22 }} onClick={leave}>
          <ArrowLeft size={14} /> Enter another exam
        </button>
      )}
    </div>
  );
}
