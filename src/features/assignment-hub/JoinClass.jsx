import React, { useState, useEffect, useCallback } from "react";
import { BookOpen, Users, Plus, Check, Clock, AlertTriangle, LogOut, GraduationCap, FileText, ChevronRight, X, Copy, CheckCircle2, Headphones, PenLine, Mic, ListChecks, ArrowLeft, Loader2, Timer, Highlighter } from "lucide-react";
import { supabase } from "../../supabaseClient";
import { uid, makeCode, TYPES, fmtDate, daysUntil, wordCount, isPdfUrl } from "../../lib/utils";
import { AttachmentPreview, PageHeader, EmptyState, CenterSpinner, Modal, StatusBadge } from "../../components/shared";

export function JoinClass({ userId, setScreen, showToast }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function join() {
    setErr("");
    if (!code.trim()) return;
    setBusy(true);
    const { data: match } = await supabase.from("classes").select("*").ilike("code", code.trim()).maybeSingle();
    if (!match) {
      setErr("No class found with that code. Double-check with your teacher.");
      setBusy(false);
      return;
    }
    const { error } = await supabase.from("roster").insert({ class_id: match.id, student_id: userId });
    setBusy(false);
    if (error && !error.message.includes("duplicate")) {
      setErr("Could not join this class.");
      return;
    }
    showToast(`Joined ${match.name}`);
    setScreen({ name: "home" });
  }

  return (
    <div className="page narrow">
      <PageHeader eyebrow="Student" title="Join a class" />
      <p className="muted-p">Ask your teacher for the class code, then enter it below.</p>
      <label className="field-label">Class code</label>
      <input className="field-input code-input" placeholder="e.g. A2K9Q" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={5} />
      {err && <div className="field-error">{err}</div>}
      <button className="btn-primary" style={{ marginTop: 16 }} disabled={!code.trim() || busy} onClick={join}>
        {busy ? "Joining…" : "Join class"}
      </button>
    </div>
  );
}

// ---------- Student: home ----------
