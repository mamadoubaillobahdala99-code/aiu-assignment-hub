import React, { useState, useEffect, useCallback } from "react";
import { BookOpen, Users, Plus, Check, Clock, AlertTriangle, LogOut, GraduationCap, FileText, ChevronRight, X, Copy, CheckCircle2, Headphones, PenLine, Mic, ListChecks, ArrowLeft, Loader2, Timer, Highlighter } from "lucide-react";
import { supabase } from "../../supabaseClient";
import { uid, makeCode, TYPES, fmtDate, daysUntil, wordCount, isPdfUrl } from "../../lib/utils";
import { AttachmentPreview, PageHeader, EmptyState, CenterSpinner, Modal, StatusBadge } from "../../components/shared";

export function TeacherHome({ userId, setScreen, showToast }) {
  const [classes, setClasses] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from("classes").select("*").eq("teacher_id", userId).order("created_at", { ascending: false });
    setClasses(data || []);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  async function createClass() {
    if (!name.trim()) return;
    setBusy(true);
    const { error } = await supabase.from("classes").insert({ name: name.trim(), teacher_id: userId, code: makeCode() });
    setBusy(false);
    if (error) { showToast("Could not create class"); return; }
    setShowCreate(false);
    setName("");
    showToast("Class created");
    load();
  }

  if (classes === null) return <CenterSpinner />;

  return (
    <div className="page">
      <PageHeader eyebrow="Teacher" title="My classes" action={
        <button className="btn-primary" onClick={() => setShowCreate(true)}><Plus size={16} /> New class</button>
      } />

      {classes.length === 0 ? (
        <EmptyState icon={<BookOpen size={26} />} title="No classes yet" body="Create a class and share the join code with your students to get started." />
      ) : (
        <div className="grid">
          {classes.map((c) => (
            <button key={c.id} className="class-card" onClick={() => setScreen({ name: "class", classId: c.id })}>
              <div className="class-card-top">
                <div className="class-card-name">{c.name}</div>
                <ChevronRight size={16} className="chev" />
              </div>
              <div className="class-card-code">CODE <span>{c.code}</span></div>
            </button>
          ))}
        </div>
      )}

      {showCreate && (
        <Modal onClose={() => setShowCreate(false)} title="Create a class">
          <label className="field-label">Class name</label>
          <input className="field-input" placeholder="e.g. IELTS Foundation — Batch 3" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          <button className="btn-primary" style={{ marginTop: 16 }} disabled={!name.trim() || busy} onClick={createClass}>
            {busy ? "Creating…" : "Create class"}
          </button>
        </Modal>
      )}
    </div>
  );
}

// ---------- Teacher: class detail ----------
