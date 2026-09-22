import React, { useState, useEffect, useCallback } from "react";
import { Plus, ShieldCheck, ChevronRight, Users, Clock } from "lucide-react";
import { supabase } from "../../supabaseClient";
import { PageHeader, EmptyState, CenterSpinner, Modal } from "../../components/shared";
import { fmtDate } from "../../lib/utils";

// An exam session chains several papers in one sitting, behind its own
// code. It is not a class: it owns a private container the students
// never see as a class, so its papers cannot show up in anyone's
// assignment list before the day.
export function ExamSessionsHome({ userId, setScreen, showToast }) {
  const [sessions, setSessions] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    // A teacher sees the sessions they created and those they were
    // invited to — the database decides, not this query.
    const { data } = await supabase
      .from("exam_sessions")
      .select("id, name, code, created_by, opened_at, closed_at, opens_at, closes_at, results_released_at, created_at, container_class_id")
      .order("created_at", { ascending: false });
    const rows = data || [];

    // How many papers and how many candidates, per session.
    const ids = rows.map((r) => r.id);
    const classIds = rows.map((r) => r.container_class_id);
    const [items, roster] = await Promise.all([
      ids.length ? supabase.from("exam_session_items").select("session_id").in("session_id", ids) : { data: [] },
      classIds.length ? supabase.from("roster").select("class_id").in("class_id", classIds) : { data: [] },
    ]);
    const papers = new Map();
    for (const it of items.data || []) papers.set(it.session_id, (papers.get(it.session_id) || 0) + 1);
    const people = new Map();
    for (const r of roster.data || []) people.set(r.class_id, (people.get(r.class_id) || 0) + 1);

    setSessions(rows.map((r) => ({ ...r, papers: papers.get(r.id) || 0, candidates: people.get(r.container_class_id) || 0 })));
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  async function create() {
    if (!name.trim()) return;
    setErr(""); setBusy(true);
    const { data, error } = await supabase.rpc("create_exam_session", { p_name: name.trim() });
    setBusy(false);
    if (error) {
      setErr(/Only a teacher/i.test(error.message || "") ? "Only a teacher can create an exam." : "Could not create this exam. Check your connection and try again.");
      return;
    }
    setShowCreate(false);
    setName("");
    showToast?.("Exam created");
    setScreen({ name: "exam-session", sessionId: data.session_id });
  }

  if (sessions === null) return <CenterSpinner />;

  return (
    <div className="page page-wide">
      <PageHeader
        eyebrow="Teacher"
        title="Exams"
        action={<button className="btn-primary" onClick={() => setShowCreate(true)}><Plus size={16} /> New exam</button>}
      />
      <p className="muted-p" style={{ marginTop: -8 }}>
        An exam runs several papers one after another, in one sitting. Students join with the
        exam code — the papers never appear in their class.
      </p>

      {sessions.length === 0 ? (
        <EmptyState icon={<ShieldCheck size={26} />} title="No exam yet" body="Create one, build its papers inside it, then give the code to your students on the day." />
      ) : (
        <div className="ex-list">
          {sessions.map((s) => (
            <div key={s.id} className="ex-row" onClick={() => setScreen({ name: "exam-session", sessionId: s.id })}>
              <div className="ex-row-main">
                <div className="ex-row-title">{s.name}</div>
                <div className="ex-row-sub">
                  <span className="ex-code">{s.code}</span>
                  <span><Clock size={12} /> {s.papers} paper{s.papers === 1 ? "" : "s"}</span>
                  <span><Users size={12} /> {s.candidates} candidate{s.candidates === 1 ? "" : "s"}</span>
                  <span>Created {fmtDate(s.created_at)}</span>
                </div>
              </div>
              <ExamStateBadge session={s} />
              <ChevronRight size={15} className="chev" />
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <Modal title="New exam" onClose={() => setShowCreate(false)}>
          <label className="field-label">Name</label>
          <input
            className="field-input"
            placeholder="e.g. IELTS Mock — October"
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && name.trim() && !busy) create(); }}
          />
          <p className="field-hint">You will add the papers, in order, on the next screen.</p>
          {err && <div className="field-error">{err}</div>}
          <button className="btn-primary" style={{ marginTop: 16 }} disabled={!name.trim() || busy} onClick={create}>
            {busy ? "Creating…" : "Create exam"}
          </button>
        </Modal>
      )}
    </div>
  );
}

export function ExamStateBadge({ session }) {
  if (session.results_released_at) return <span className="ex-badge ex-badge-done">Results published</span>;
  if (session.closed_at) return <span className="ex-badge ex-badge-closed">Closed</span>;
  const scheduled = session.opens_at && new Date(session.opens_at) <= new Date();
  if (session.opened_at || scheduled) return <span className="ex-badge ex-badge-live">Open now</span>;
  return <span className="ex-badge ex-badge-draft">Not open</span>;
}
