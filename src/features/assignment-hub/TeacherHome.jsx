import React, { useState, useEffect, useCallback } from "react";
import { BookOpen, Plus, Copy, Check, Users, FileText } from "lucide-react";
import { supabase } from "../../supabaseClient";
import { makeCode } from "../../lib/utils";
import { EmptyState, CenterSpinner, Modal, LoadFailed } from "../../components/shared";
import { loadTeacherWork } from "./teacherWork";

// Livraison 72 — the teacher's classes as cards: join code (copy button),
// students, assignments, copies to mark. A card opens the class; the last
// card creates a new one.

// The "Create a class" window, shared by My classes and the Dashboard.
export function CreateClassModal({ userId, onClose, onCreated, showToast }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  async function createClass() {
    if (!name.trim() || busy) return;
    setBusy(true);
    const { error } = await supabase.from("classes").insert({ name: name.trim(), teacher_id: userId, code: makeCode() });
    setBusy(false);
    if (error) { showToast?.("Could not create class"); return; }
    showToast?.("Class created");
    onCreated?.();
  }
  return (
    <Modal onClose={onClose} title="Create a class">
      <label className="field-label">Class name</label>
      <input className="field-input" placeholder="e.g. IELTS Foundation — Batch 3" value={name} autoFocus
             onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") createClass(); }} />
      <button className="btn-primary" style={{ marginTop: 16 }} disabled={!name.trim() || busy} onClick={createClass}>
        {busy ? "Creating…" : "Create class"}
      </button>
    </Modal>
  );
}

export function CodePill({ code }) {
  const [copied, setCopied] = useState(false);
  function copy(e) {
    e.stopPropagation();
    navigator.clipboard?.writeText(code)?.catch?.(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <button type="button" className="pill pill-teal code-pill" onClick={copy} onKeyDown={(e) => e.stopPropagation()}
            title="Copy the join code" aria-label={`Copy the join code ${code}`}>
      {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Copied" : code}
    </button>
  );
}

export function TeacherHome({ userId, setScreen, showToast }) {
  const [data, setData] = useState(null);
  const [showCreate, setShowCreate] = useState(false);

  // Livraison 95d: a failed read is never « No classes yet ».
  const [loadFailed, setLoadFailed] = useState(false);
  const load = useCallback(async () => {
    try { setData(await loadTeacherWork(userId)); setLoadFailed(false); }
    catch { setLoadFailed(true); }
  }, [userId]);
  useEffect(() => { load(); }, [load]);

  if (loadFailed) return <div className="page page-wide"><LoadFailed what="your classes" onRetry={() => { setLoadFailed(false); load(); }} /></div>;
  if (data === null) return <CenterSpinner />;
  const openClass = (c) => setScreen({ name: "class", classId: c.id });
  const n = (v) => (v === null || v === undefined ? "—" : v);

  return (
    <div className="page page-wide">
      <div className="ph">
        <div className="ph-main"><div><div className="eyebrow">Teacher</div><h1 className="ph-title">My classes</h1></div></div>
        <div className="ph-actions">
          <button className="btn-teal" onClick={() => setShowCreate(true)}><Plus size={16} /> New class</button>
        </div>
      </div>

      {data.classes.length === 0 ? (
        <EmptyState icon={<BookOpen size={26} />} title="No classes yet" body="Create a class and share the join code with your students to get started." />
      ) : (
        <div className="card-grid">
          {data.classes.map((c) => (
            <div key={c.id} className="c-card" role="link" tabIndex={0} aria-label={`Open ${c.name}`}
                 onClick={() => openClass(c)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openClass(c); } }}>
              <div className="c-card-name">{c.name}</div>
              <div><CodePill code={c.code} /></div>
              <div className="c-card-line">
                <Users size={14} /> <b className="c-card-num">{n(c.students)}</b> student{c.students === 1 ? "" : "s"}
                <span className="c-card-dot">·</span>
                <FileText size={14} /> <b className="c-card-num">{c.assignments}</b> assignment{c.assignments === 1 ? "" : "s"}
              </div>
              <div className="c-card-foot">
                {c.toMark === null ? <span className="dt-muted">—</span>
                  : c.toMark > 0 ? <span className="pill pill-amber">{c.toMark} to mark</span>
                  : <span className="c-card-quiet">Nothing to mark</span>}
                <span className="c-card-open">Open →</span>
              </div>
            </div>
          ))}
          <button type="button" className="c-card c-card-new" onClick={() => setShowCreate(true)}>
            <Plus size={18} /> New class
          </button>
        </div>
      )}

      {showCreate && (
        <CreateClassModal userId={userId} showToast={showToast} onClose={() => setShowCreate(false)}
                          onCreated={() => { setShowCreate(false); load(); }} />
      )}
    </div>
  );
}
