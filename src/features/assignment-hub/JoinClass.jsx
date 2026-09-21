import React, { useState, useEffect, useCallback } from "react";
import { BookOpen, Users, Plus, Check, Clock, AlertTriangle, LogOut, GraduationCap, FileText, ChevronRight, X, Copy, CheckCircle2, Headphones, PenLine, Mic, ListChecks, ArrowLeft, Loader2, Timer, Highlighter } from "lucide-react";
import { supabase } from "../../supabaseClient";
import { uid, makeCode, TYPES, fmtDate, daysUntil, wordCount, isPdfUrl } from "../../lib/utils";
import { AttachmentPreview, PageHeader, EmptyState, CenterSpinner, Modal, StatusBadge } from "../../components/shared";

export function JoinClass({ userId, setScreen, showToast }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // Joining goes through the database function join_class, which is the
  // only way in now. The class list itself is private — a student can
  // only see the classes they belong to — so looking the code up from
  // the browser is no longer possible, and no longer needed: the code
  // is checked by the server, which enrols the student in the same
  // step. Running it twice is harmless.
  async function join() {
    setErr("");
    if (!code.trim()) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("join_class", { p_code: code.trim() });
    setBusy(false);
    if (error) {
      setErr(
        /No class found/i.test(error.message || "")
          ? "No class found with that code. Double-check with your teacher."
          : "Could not join this class. Check your connection and try again."
      );
      return;
    }
    showToast(`Joined ${data?.name || "the class"}`);
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
