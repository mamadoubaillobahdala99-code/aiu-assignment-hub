import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  ShieldCheck, Lock, CheckCircle2, Play, Headphones, FileText,
  ArrowLeft, Flag, Hourglass, MinusCircle, Smartphone,
} from "lucide-react";
import { supabase } from "../../supabaseClient";
import { PageHeader, CenterSpinner } from "../../components/shared";
import { TYPES } from "../../lib/utils";
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
  const [code, setCode] = useState("");
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
      const live = rows.find((r) => !r.closed_at && !r.results_released_at);
      return live ? live.id : null;
    });
  }, []);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  // ---------- the state of the exam I am sitting ----------
  const loadStatus = useCallback(async () => {
    if (!activeId) { setStatus(null); return; }
    const { data, error } = await supabase.rpc("exam_session_status", { p_session_id: activeId });
    if (error) { setStatus(false); return; }
    setStatus(data);
  }, [activeId]);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  const openPaperScreen = useCallback((assignmentId) => {
    setOpenPaper({ assignmentId });
    setScreen({ name: "student-exam", paper: assignmentId });
  }, [setScreen]);
  const closePaperScreen = useCallback(() => {
    setOpenPaper(null);
    setScreen({ name: "student-exam" });
  }, [setScreen]);

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
      else setScreen({ name: "student-exam" });
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
    if (!openPaper && urlPaper) setScreen({ name: "student-exam" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen]);

  // While the list is showing, ask the server again every 10 seconds:
  // the teacher may have opened the exam, started the recording for the
  // whole room, closed it, or published the results. Never while a paper
  // is open — nothing must disturb a candidate who is writing.
  const statusRef = useRef(loadStatus);
  statusRef.current = loadStatus;
  useEffect(() => {
    if (!activeId || openPaper) return;
    const t = setInterval(() => statusRef.current(), 10000);
    return () => clearInterval(t);
  }, [activeId, openPaper]);

  async function join() {
    const c = code.trim();
    if (!c) return;
    // Asked inside the click (or the Enter key), before anything is
    // awaited: a browser only grants full screen to a gesture.
    const askedFs = requestEnterFullscreen(onPhone);
    setErr(""); setJoining(true);
    const { data, error } = await supabase.rpc("join_exam", { p_code: c });
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
    setCode("");
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

  // ---------- not in an exam yet: the code ----------
  if (!session) {
    return (
      <div className="page narrow">
        <PageHeader eyebrow="Student" title="Exam" />
        <p className="muted-p">
          Your teacher gives you the exam code when everyone is seated. It is not
          a class code — it opens the exam, and only on the day.
        </p>
        <label className="field-label">Exam code</label>
        <input
          className="field-input code-input"
          placeholder="e.g. EX7K2M"
          value={code}
          onChange={(e) => { setCode(e.target.value.toUpperCase()); setErr(""); }}
          onKeyDown={(e) => { if (e.key === "Enter" && code.trim() && !joining) join(); }}
          maxLength={12}
        />
        {err && <div className="field-error">{err}</div>}
        <button className="btn-primary" style={{ marginTop: 16 }} disabled={!code.trim() || joining} onClick={join}>
          {joining ? "Entering…" : "Enter the exam"}
        </button>

        {sessions.length > 0 && (
          <>
            <div className="section-title" style={{ marginTop: 30 }}>My past exams</div>
            <div className="ex-list">
              {sessions.map((s) => (
                <div key={s.id} className="ex-row" onClick={() => setActiveId(s.id)}>
                  <div className="ex-row-main">
                    <div className="ex-row-title">{s.name}</div>
                    <div className="ex-row-sub">
                      <span>{s.results_released_at ? "Results published" : s.closed_at ? "Finished" : "Open"}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    );
  }

  if (status === null) return <CenterSpinner />;
  if (status === false) {
    return (
      <div className="page narrow">
        <PageHeader eyebrow="Student" title={session.name} />
        <p className="empty-inline">This exam is not available right now. Ask your teacher.</p>
        <button className="back-link" onClick={() => setActiveId(null)}><ArrowLeft size={14} /> Another exam</button>
      </div>
    );
  }

  const items = status.items || [];
  const released = Boolean(status.results_released_at);
  const closed = Boolean(status.closed_at);
  const allDone = items.length > 0 && items.every((i) => i.submitted);
  // The next paper to sit: the first unlocked one that is not handed in.
  const nextId = released ? null : (items.find((i) => i.readable && !i.submitted) || {}).assignment_id;

  return (
    <div className="page page-wide">
      <PageHeader eyebrow="Exam" title={session.name} />

      {/* ---------- the banner that says where we are ---------- */}
      {released ? (
        <div className="exs-banner exs-banner-done">
          <CheckCircle2 size={18} />
          <div>
            <strong>Results published.</strong>
            <em>You can open each paper again to see your marks and your corrected answers.</em>
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
        Papers <span className="ex-count">({items.filter((i) => i.submitted).length}/{items.length} handed in)</span>
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

            return (
              <div key={it.item_id} className={`ex-item exs-item ${isNext ? "is-next" : ""} ${it.submitted && !released ? "is-done" : ""}`}>
                <div className="ex-item-order">{i + 1}</div>
                <Icon size={17} className="ex-item-icon" />
                <div className="ex-item-main">
                  <div className="ex-item-title">{it.title}</div>
                  <div className="ex-item-sub">
                    {it.type}
                    {it.minutes ? ` · ${it.minutes} minutes` : ""}
                  </div>
                </div>

                {/* A paper that was never handed in has no result to show
                    and nothing to open — the exam is over. Offering it
                    would put the candidate back inside the paper. */}
                {(released || closed) && !it.submitted ? (
                  <span className="exs-state"><MinusCircle size={14} /> Not handed in</span>
                ) : released ? (
                  <button className="btn-ghost" onClick={() => openPaperScreen(it.assignment_id)}>
                    See my result
                  </button>
                ) : it.submitted ? (
                  <span className="exs-state exs-state-done"><CheckCircle2 size={14} /> Handed in</span>
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
                    <Play size={14} /> {it.started ? "Continue" : "Start"}
                  </button>
                ) : (
                  <span className="exs-state"><Lock size={14} /> Locked</span>
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
      {(closed || released || allDone) && (
        <button className="back-link" style={{ marginTop: 22 }} onClick={() => setActiveId(null)}>
          <ArrowLeft size={14} /> Enter another exam
        </button>
      )}
    </div>
  );
}
