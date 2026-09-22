import React, { useState, useEffect, useCallback } from "react";
import {
  ArrowLeft, Copy, CheckCircle2, Plus, FileText, Users, Play, Square,
  Send, Trash2, ChevronUp, ChevronDown, UserPlus, X, Headphones, ShieldCheck,
  ChevronRight, Pencil, Files,
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

    // Who has handed in what. One query for the whole room.
    const paperIds = (rows || []).map((x) => x.assignment_id);
    if (paperIds.length > 0) {
      const { data: att } = await supabase
        .from("exam_attempts")
        .select("student_id, assignment_id, submitted_at")
        .in("assignment_id", paperIds);
      const done = {};
      for (const a of att || []) {
        if (!a.submitted_at) continue;
        (done[a.student_id] = done[a.student_id] || new Set()).add(a.assignment_id);
      }
      setProgress(done);
    } else {
      setProgress({});
    }
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
          <button className="btn-ghost" disabled={busy === "close" || closeAsk === "counting"} onClick={askToClose}>
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

      {/* ---------- managing the exam itself ---------- */}
      <div className="ex-actions ex-manage">
        <button className="btn-ghost" onClick={() => setRenaming(session.name)}>
          <Pencil size={13} /> Rename
        </button>
        <button className="btn-ghost" onClick={() => setDupOpen(`${session.name} (copy)`)}>
          <Files size={13} /> Duplicate for another class
        </button>
        {isOwner && (
          <button className="btn-ghost ex-delete-btn" disabled={isLive} title={isLive ? "Close the exam first" : ""}
                  onClick={() => { setDelTyped(""); setDelOpen(true); }}>
            <Trash2 size={13} /> Delete this exam
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
                {/* The whole row opens the paper: read it, correct it,
                    see who has handed it in. */}
                <button className="ex-item-open" onClick={() => openPaper(it)}
                        disabled={!it.assignment} title="Open this paper">
                  <div>
                    <div className="ex-item-title">{it.assignment?.title || "(paper deleted)"}</div>
                    <div className="ex-item-sub">
                      {it.assignment?.type}
                      {it.assignment?.time_limit_minutes ? ` · ${it.assignment.time_limit_minutes} min` : " · no time limit"}
                      {roster.length > 0 && (
                        <> · {roster.filter((s) => progress[s.id]?.has(it.assignment_id)).length}/{roster.length} handed in</>
                      )}
                    </div>
                  </div>
                  <ChevronRight size={15} className="chev" />
                </button>

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
          {roster.map((s) => {
            // How far this candidate has got — the only way to know,
            // during the exam, whether the room has finished.
            const done = sorted.filter((it) => progress[s.id]?.has(it.assignment_id)).length;
            const all = done === sorted.length && sorted.length > 0;
            return (
              <div key={s.id} className="ex-person">
                <div className="avatar small">{s.name.slice(0, 1).toUpperCase()}</div>
                <span>{s.name}</span>
                {sorted.length > 0 ? (
                  <span className={`ex-progress ${all ? "is-done" : ""}`}>
                    {all && <CheckCircle2 size={12} />} {done}/{sorted.length}
                  </span>
                ) : (
                  <span className="ex-joined">joined {fmtDate(s.joined_at)}</span>
                )}
              </div>
            );
          })}
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
              The number of candidates still writing could not be counted. Close only if
              you are sure the room has finished.
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
                If you close now, {closeAsk.working > 1 ? "they" : "he or she"} can still hand
                in the paper already started — nothing is lost — but nobody will be able to
                open a new one.
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
