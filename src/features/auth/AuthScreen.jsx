import React, { useState } from "react";
import { BookOpen, Users, Plus, Check, Clock, AlertTriangle, LogOut, GraduationCap, FileText, ChevronRight, X, Copy, CheckCircle2, Headphones, PenLine, Mic, ListChecks, ArrowLeft, Loader2, Timer, Highlighter } from "lucide-react";
import { supabase } from "../../supabaseClient";

export function AuthScreen({ showToast }) {
  const [mode, setMode] = useState("signup"); // signup | login
  const [name, setName] = useState("");
  const [role, setRole] = useState(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit() {
    setErr("");
    setBusy(true);
    if (mode === "signup") {
      if (!name.trim() || !role || !email.trim() || password.length < 6) {
        setErr("Fill in every field. Password must be at least 6 characters.");
        setBusy(false);
        return;
      }
      const { error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { name: name.trim(), role } },
      });
      if (error) setErr(error.message);
      else showToast("Account created");
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) setErr(error.message);
    }
    setBusy(false);
  }

  return (
    <div className="auth">
      <div className="auth-card">
        <div className="auth-eyebrow">ALBUKHARY INTERNATIONAL UNIVERSITY</div>
        <h1 className="auth-title">Assignment Hub</h1>
        <p className="auth-sub">One place for IELTS prep coursework — no more chasing links across WhatsApp, Drive, and Classroom.</p>

        <div className="auth-tabs">
          <button className={`auth-tab ${mode === "signup" ? "active" : ""}`} onClick={() => setMode("signup")}>Create account</button>
          <button className={`auth-tab ${mode === "login" ? "active" : ""}`} onClick={() => setMode("login")}>Log in</button>
        </div>

        {mode === "signup" && (
          <>
            <label className="field-label">Your name</label>
            <input className="field-input" placeholder="e.g. Mamadou Bailo" value={name} onChange={(e) => setName(e.target.value)} />

            <label className="field-label" style={{ marginTop: 14 }}>I am a…</label>
            <div className="role-row">
              <button className={`role-btn ${role === "teacher" ? "active" : ""}`} onClick={() => setRole("teacher")}>
                <GraduationCap size={20} /><span>Teacher</span>
              </button>
              <button className={`role-btn ${role === "student" ? "active" : ""}`} onClick={() => setRole("student")}>
                <Users size={20} /><span>Student</span>
              </button>
            </div>
          </>
        )}

        <label className="field-label" style={{ marginTop: 14 }}>Email</label>
        <input className="field-input" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />

        <label className="field-label" style={{ marginTop: 14 }}>Password</label>
        <input className="field-input" type="password" placeholder="At least 6 characters" value={password} onChange={(e) => setPassword(e.target.value)} />

        {err && <div className="field-error">{err}</div>}

        <button className="btn-primary auth-submit" disabled={busy} onClick={submit}>
          {busy ? "Please wait…" : mode === "signup" ? "Create account" : "Log in"} <ChevronRight size={16} />
        </button>
        {mode === "signup" && (
          <p className="auth-note">A confirmation email may be sent depending on your project settings — check your inbox if login doesn't work right away.</p>
        )}
      </div>
    </div>
  );
}

// ---------- Shell ----------
