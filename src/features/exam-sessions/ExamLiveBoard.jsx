// =====================================================================
// The exam page (teacher), while the exam runs — the suspended
// candidates, the room (« Everyone together ») and the candidates' table.
// Livraison 98 — moved out of ExamSessionDetail.jsx without any change:
// the same markup, the same buttons, the same calls. ExamSessionDetail
// keeps every read, write and timer, and passes what is shown here in
// one object (v). These are plain functions called while the page
// renders (not components), so React sees exactly the same page.
// =====================================================================
import React from "react";
import { Play, ShieldAlert, Unlock, RotateCcw, Lock, Clock } from "lucide-react";
import { fmtDate } from "../../lib/utils";
import { left } from "./examWork";

// Suspended candidates first: they wait in front of a dead screen.
export function renderInvigilation(v) {
  const { allowResume, frozen, resetAudio, resuming, sorted } = v;
  return frozen.length > 0 && (
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
}

// Livraison 79 — the room, in « Everyone together » mode.
export function renderRoomBanner(v) {
  const { att, busy, free, hm, letContinue, now, plural, roster, session, sorted, stage, startForEveryone, timed, together } = v;
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
  return stage === 1 && together && (
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
}

// During the exam: where each candidate is.
export function renderCandidatesTab(v) {
  const { att, cellOf, extras, filter, free, frozenIds, hm, now, plural, roster, session, setExtraFor, setFilter, sorted, timed, together, watched } = v;
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
      // Livraison 98b: « time over », not « time over left ».
      return { kind: "work", text: `${type.toLowerCase()} · ${end ? (end > now ? `${left(end - now)} left` : "time over") : "in progress"}`, extra,
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
  return roster.length === 0 ? (
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
        <table className="dt exd-matrix exd-cards">
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
                <td className="exd-name"><span className="exd-person"><span className="avatar small">{st.name.slice(0, 1).toUpperCase()}</span><b>{st.name}</b></span></td>
                {together && (() => {
                  const first = timed.find((it) => it.room_started_at);
                  const late = first && st.joined_at && new Date(st.joined_at) > new Date(first.room_started_at);
                  return <td data-label="Arrived" className={`exd-c ${late ? "exd-late" : ""}`}>{st.joined_at ? hm(st.joined_at) : "—"}{late ? " · late" : ""}</td>;
                })()}
                {sorted.map((it, i) => {
                  const c = liveCell(st, it, i);
                  return (
                    <td key={it.id} data-label={`${i + 1} · ${it.assignment?.type || "Paper"}`} className={`exd-c exd-${c.kind}`}>
                      {c.kind === "lock" ? <Lock size={13} aria-label="locked" /> : c.text}
                      {c.extra > 0 && <span className="exd-extra" title="Extra minutes given">+{c.extra} min</span>}
                      {c.canExtend && (
                        <button type="button" className="exd-plus" title={`Give ${st.name} extra minutes`}
                                onClick={() => setExtraFor({ st, it, minutes: 5 })}>+ min</button>
                      )}
                    </td>
                  );
                })}
                <td data-label="Status" className="exd-c"><span className={`pill ${STATUS[status][1]}`}>{STATUS[status][0]}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

