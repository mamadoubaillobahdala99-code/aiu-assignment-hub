// =====================================================================
// The exam page (teacher) — the papers, « Ready to open? », the settings
// and the teachers.
// Livraison 98 — moved out of ExamSessionDetail.jsx without any change:
// the same markup, the same buttons, the same calls. ExamSessionDetail
// keeps every read, write and timer, and passes what is shown here in
// one object (v). These are plain functions called while the page
// renders (not components), so React sees exactly the same page.
// =====================================================================
import React from "react";
import { Plus, FileText, Headphones, ChevronUp, ChevronDown, Trash2, ChevronRight, Check, Lock, UserPlus, X } from "lucide-react";
import { EmptyState } from "../../components/shared";
import { TYPES } from "../../lib/utils";
import { fmtWhen } from "../question-engine/ResultParts";

// The papers, in order.
export function renderPapersPanel(v) {
  const { act, busy, free, hm, move, notStarted, openPaper, progress, removeItem, replayIds, roster, session, setAddOpen, sorted, stage, together, withContent } = v;
  return (
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
}

// « Ready to open? »
export function renderReadyPanel(v) {
  const { plural, replayIds, session, sorted, together, withContent } = v;
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
  return (
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
}

// The settings.
export function renderSettingsPanel(v) {
  const { examOpen, session, setSetting } = v;
  return (
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
}

// The teachers of the exam.
export function renderTeachersPanel(v) {
  const { isOwner, openStaff, removeStaff, staff } = v;
  return (
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
