import React, { useState, useEffect, useCallback } from "react";
import {
  ArrowLeft, Copy, CheckCircle2, Plus, FileText, Users, Play, Square,
  Send, Trash2, ChevronUp, ChevronDown, UserPlus, X, Headphones, ShieldCheck,
} from "lucide-react";
import { supabase } from "../../supabaseClient";
import { PageHeader, CenterSpinner, EmptyState, Modal } from "../../components/shared";
import { TYPES, fmtDate } from "../../lib/utils";
import { ExamStateBadge } from "./ExamSessionsHome";

// The teacher's screen for one exam session: its code, its papers in
// order, its settings, the other teachers, and the buttons that run the
// exam on the day.
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

  const load = useCallback(async () => {
    const { data: s } = await supabase.from("exam_sessions").select("*").eq("id", sessionId).maybeSingle();
    if (!s) { setSession(false); return; }
    setSession(s);

    // Papers built inside this exam. Anything sitting in the private
    // container that is not yet a paper of this exam has just been
    // built — adopt it, in the order it was created.
    const { data: inContainer } = await supabase
      .from("assignments")
      .select("id, title, type, time_limit_minutes, created_at")
      .eq("class_id", s.container_class_id)
      .order("created_at");
    const { data: rows } = await supabase
      .from("exam_session_items")
      .select("id, assignment_id, order_index, audio_started_at")
      .eq("session_id", sessionId)
      .order("order_index");

    const known = new Set((rows || []).map((r) => r.assignment_id));
    const orphans = (inContainer || []).filter((a) => !known.has(a.id));
    if (orphans.length > 0) {
      let next = (rows || []).reduce((m, r) => Math.max(m, r.order_index), 0);
      const toAdd = orphans.map((a) => ({ session_id: sessionId, assignment_id: a.id, order_index: ++next }));
      await supabase.from("exam_session_items").insert(toAdd);
      const { data: again } = await supabase
        .from("exam_session_items").select("id, assignment_id, order_index, audio_started_at")
        .eq("session_id", sessionId).order("order_index");
      rows.splice(0, rows.length, ...(again || []));
    }

    const byId = new Map((inContainer || []).map((a) => [a.id, a]));
    setItems((rows || []).map((r) => ({ ...r, assignment: byId.get(r.assignment_id) || null })));

    const [{ data: r }, { data: st }] = await Promise.all([
      supabase.from("roster").select("student_id, joined_at, profiles(name)").eq("class_id", s.container_class_id),
      supabase.from("exam_session_staff").select("teacher_id, role, profiles(name)").eq("session_id", sessionId),
    ]);
    setRoster((r || []).map((x) => ({ id: x.student_id, name: x.profiles?.name || "Student", joined_at: x.joined_at })));
    setStaff((st || []).map((x) => ({ id: x.teacher_id, role: x.role, name: x.profiles?.name || "Teacher" })));
  }, [sessionId]);

  useEffect(() => { load(); }, [load]);

  async function act(action, itemId) {
    setBusy(action);
    const { error } = await supabase.rpc("exam_session_action", { p_session_id: sessionId, p_action: action, p_item_id: itemId || null });
    setBusy("");
    if (error) { showToast?.("Could not do that: " + error.message); return; }
    await load();
    if (action === "open") showToast?.("Exam open — give the code to your students");
    if (action === "close") showToast?.("Exam closed");
    if (action === "release") showToast?.("Results published");
    if (action === "start_audio") showToast?.("Recording started for everyone");
  }

  async function setSetting(patch) {
    const { error } = await supabase.from("exam_sessions").update(patch).eq("id", sessionId);
    if (error) { showToast?.("Could not save that setting"); return; }
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
    if (!window.confirm(`Remove "${item.assignment?.title || "this paper"}" from the exam? The paper itself is deleted — it only existed inside this exam.`)) return;
    await supabase.from("exam_session_items").delete().eq("id", item.id);
    await supabase.from("assignments").delete().eq("id", item.assignment_id);
    load();
  }

  async function openStaff() {
    const { data } = await supabase.from("profiles").select("id, name").eq("role", "teacher").order("name");
    setTeachers(data || []);
    setStaffOpen(true);
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
      <div className="page">
        <button className="back-link" onClick={() => setScreen({ name: "exams" })}><ArrowLeft size={14} /> All exams</button>
        <p className="empty-inline">This exam no longer exists.</p>
      </div>
    );
  }

  const isOwner = session.created_by === userId;
  const isLive = Boolean(session.opened_at) && !session.closed_at;
  const sorted = [...items].sort((a, b) => a.order_index - b.order_index);

  return (
    <div className="page page-wide">
      <button className="back-link" onClick={() => setScreen({ name: "exams" })}><ArrowLeft size={14} /> All exams</button>

      <PageHeader
        eyebrow="Exam"
        title={session.name}
        action={<button className="btn-ghost" onClick={copyCode}>{copied ? <CheckCircle2 size={15} /> : <Copy size={15} />} Code: {session.code}</button>}
      />

      <div className="ex-statusline">
        <ExamStateBadge session={session} />
        <span className="ex-status-note">
          {session.results_released_at
            ? "Students can see their results."
            : session.closed_at
            ? "Nobody can join or start a paper."
            : isLive
            ? "Students can join with the code and start the first paper."
            : "Students cannot join yet. Press Open when everyone is seated."}
        </span>
      </div>

      <div className="ex-actions">
        {!isLive && !session.closed_at && (
          <button className="btn-primary" disabled={busy === "open" || sorted.length === 0} onClick={() => act("open")}>
            <Play size={15} /> {busy === "open" ? "Opening…" : "Open now"}
          </button>
        )}
        {isLive && (
          <button className="btn-ghost" disabled={busy === "close"} onClick={() => act("close")}>
            <Square size={14} /> {busy === "close" ? "Closing…" : "Close the exam"}
          </button>
        )}
        {!session.results_released_at && (session.closed_at || isLive) && (
          <button className="btn-ghost" disabled={busy === "release"} onClick={() => {
            if (window.confirm("Publish the results to every candidate? They will see their marks and their corrected papers.")) act("release");
          }}>
            <Send size={14} /> {busy === "release" ? "Publishing…" : "Publish the results"}
          </button>
        )}
      </div>

      {/* ---------- the papers, in order ---------- */}
      <div className="section-title" style={{ marginTop: 28 }}>Papers, in order</div>
      {sorted.length === 0 ? (
        <EmptyState icon={<FileText size={24} />} title="No paper yet" body="Build the papers inside this exam. They will never appear in a class." />
      ) : (
        <div className="ex-items">
          {sorted.map((it, i) => {
            const meta = TYPES[it.assignment?.type] || {};
            const Icon = meta.icon || FileText;
            return (
              <div key={it.id} className="ex-item">
                <div className="ex-item-order">{i + 1}</div>
                <Icon size={17} className="ex-item-icon" />
                <div className="ex-item-main">
                  <div className="ex-item-title">{it.assignment?.title || "(paper deleted)"}</div>
                  <div className="ex-item-sub">
                    {it.assignment?.type}
                    {it.assignment?.time_limit_minutes ? ` · ${it.assignment.time_limit_minutes} min` : " · no time limit"}
                  </div>
                </div>

                {session.listening_start === "grouped" && it.assignment?.type === "Listening" && isLive && (
                  <button
                    className={`btn-ghost ex-audio-btn ${it.audio_started_at ? "is-done" : ""}`}
                    disabled={Boolean(it.audio_started_at) || busy === "start_audio"}
                    onClick={() => act("start_audio", it.id)}
                  >
                    <Headphones size={14} /> {it.audio_started_at ? "Recording started" : "Start the recording"}
                  </button>
                )}

                {!isLive && !session.closed_at && (
                  <div className="ex-item-tools">
                    <button className="ex-icon-btn" title="Move up" disabled={i === 0} onClick={() => move(it, -1)}><ChevronUp size={15} /></button>
                    <button className="ex-icon-btn" title="Move down" disabled={i === sorted.length - 1} onClick={() => move(it, 1)}><ChevronDown size={15} /></button>
                    <button className="ex-icon-btn ex-icon-danger" title="Remove" onClick={() => removeItem(it)}><Trash2 size={14} /></button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!isLive && !session.closed_at && (
        <button className="btn-ghost" style={{ marginTop: 12 }} onClick={() => setAddOpen(true)}>
          <Plus size={15} /> Add a paper
        </button>
      )}

      {/* ---------- settings ---------- */}
      <div className="section-title" style={{ marginTop: 30 }}>Settings</div>
      <div className="ex-settings">
        <label className="ex-setting">
          <input type="checkbox" checked={session.strict_mode} disabled={isLive}
                 onChange={(e) => setSetting({ strict_mode: e.target.checked })} />
          <span>
            <strong>Strict — a teacher must authorise a restart</strong>
            <em>If a candidate leaves the exam, it freezes until a teacher lets them back in. Turn this off for practice at home.</em>
          </span>
        </label>
        <div className="ex-setting ex-setting-radio">
          <span><strong>The Listening recording starts…</strong></span>
          <label><input type="radio" name="ls" checked={session.listening_start === "individual"} disabled={isLive}
                        onChange={() => setSetting({ listening_start: "individual" })} /> individually — each candidate with headphones</label>
          <label><input type="radio" name="ls" checked={session.listening_start === "grouped"} disabled={isLive}
                        onChange={() => setSetting({ listening_start: "grouped" })} /> together — you press play for the whole room</label>
        </div>
        <div className="ex-setting ex-setting-times">
          <span><strong>Window (optional)</strong>
            <em>A safety net around the Open button: outside it, nobody can join or start.</em></span>
          <div className="ex-time-row">
            <label className="field-label">Opens</label>
            <input type="datetime-local" className="field-input" disabled={isLive}
                   value={toLocal(session.opens_at)} onChange={(e) => setSetting({ opens_at: fromLocal(e.target.value) })} />
            <label className="field-label">Closes</label>
            <input type="datetime-local" className="field-input"
                   value={toLocal(session.closes_at)} onChange={(e) => setSetting({ closes_at: fromLocal(e.target.value) })} />
          </div>
        </div>
      </div>

      {/* ---------- teachers ---------- */}
      <div className="section-title" style={{ marginTop: 30 }}>Teachers <span className="ex-count">({staff.length})</span></div>
      <div className="ex-people">
        {staff.map((t) => (
          <div key={t.id} className="ex-person">
            <div className="avatar small">{t.name.slice(0, 1).toUpperCase()}</div>
            <span>{t.name}</span>
            {t.role === "owner" ? <span className="ex-owner">creator</span> : isOwner && (
              <button className="ex-icon-btn ex-icon-danger" title="Remove" onClick={() => removeStaff(t.id)}><X size={13} /></button>
            )}
          </div>
        ))}
        {isOwner && <button className="btn-ghost" onClick={openStaff}><UserPlus size={14} /> Invite a teacher</button>}
      </div>

      {/* ---------- candidates ---------- */}
      <div className="section-title" style={{ marginTop: 30 }}>Candidates <span className="ex-count">({roster.length})</span></div>
      {roster.length === 0 ? (
        <p className="empty-inline">Nobody has joined yet. They join with the code once the exam is open.</p>
      ) : (
        <div className="ex-people">
          {roster.map((s) => (
            <div key={s.id} className="ex-person">
              <div className="avatar small">{s.name.slice(0, 1).toUpperCase()}</div>
              <span>{s.name}</span>
              <span className="ex-joined">joined {fmtDate(s.joined_at)}</span>
            </div>
          ))}
        </div>
      )}

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

      {staffOpen && (
        <Modal title="Invite a teacher" onClose={() => setStaffOpen(false)}>
          <p className="muted-p" style={{ marginTop: 0 }}>
            An invited teacher can watch the exam, let a candidate back in, and mark the papers.
            Only you can delete the exam.
          </p>
          {teachers.filter((t) => !staff.some((s) => s.id === t.id)).length === 0 ? (
            <p className="empty-inline">No other teacher to invite.</p>
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
