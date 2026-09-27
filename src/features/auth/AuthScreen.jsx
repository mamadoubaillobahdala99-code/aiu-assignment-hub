import React, { useState } from "react";
import { BookOpen, Users, Plus, Check, Clock, AlertTriangle, LogOut, GraduationCap, FileText, ChevronRight, X, Copy, CheckCircle2, Headphones, PenLine, Mic, ListChecks, ArrowLeft, Loader2, Timer, Highlighter } from "lucide-react";
import { supabase } from "../../supabaseClient";
import { PasswordField, passwordProblem, PASSWORD_RULE_TEXT } from "../../components/PasswordField";

export function AuthScreen({ showToast }) {
  const [mode, setMode] = useState("signup"); // signup | login
  const [name, setName] = useState("");
  // Livraison 61: only a REQUEST — the account is always created as a
  // student, and the administrator approves teacher access.
  const [teacherRequest, setTeacherRequest] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit() {
    setErr("");
    setBusy(true);
    if (mode === "signup") {
      if (!name.trim() || !email.trim() || !password) {
        setErr("Fill in every field.");
        setBusy(false);
        return;
      }
      // The new password rule (livraison 59) — for NEW passwords only.
      const problem = passwordProblem(password);
      if (problem) {
        setErr(problem + " " + PASSWORD_RULE_TEXT);
        setBusy(false);
        return;
      }
      const { error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        // Every new account is a student (livraison 58): the database ignores
        // any role sent from here. The administrator gives teacher access.
        options: { data: teacherRequest ? { name: name.trim(), teacher_request: true } : { name: name.trim() } },
      });
      if (error) setErr(error.message);
      else showToast(teacherRequest ? "Account created — teacher access requested" : "Account created");
    } else {
      // No password rule at login: an older, shorter password must still
      // work. When Supabase finds it weaker than the new rule it still logs
      // in and only adds a "weakPassword" note to the answer (not an error),
      // which is deliberately ignored here.
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) setErr(error.message);
    }
    setBusy(false);
  }

  return (
    <div className="auth-split">
      <div className="auth-brand-panel">
        <svg className="auth-brand-pattern" aria-hidden="true" viewBox="0 0 400 400" preserveAspectRatio="xMidYMid slice">
          <defs>
            <pattern id="auth-dots" width="28" height="28" patternUnits="userSpaceOnUse">
              <circle cx="2" cy="2" r="1.6" fill="currentColor" />
            </pattern>
          </defs>
          <rect width="400" height="400" fill="url(#auth-dots)" />
        </svg>
        <div className="auth-brand-content">
          <div className="auth-eyebrow">ALBUKHARY INTERNATIONAL UNIVERSITY</div>
          <h1 className="auth-title">Assignment Hub</h1>
          <p className="auth-sub">One place for IELTS prep coursework — no more chasing links across WhatsApp, Drive, and Classroom.</p>
        </div>
      </div>

      <div className="auth-form-panel">
        <div className="auth-card">
          <div className="auth-eyebrow auth-eyebrow-compact">ALBUKHARY INTERNATIONAL UNIVERSITY</div>
          <h2 className="auth-form-title">{mode === "signup" ? "Create your account" : "Welcome back"}</h2>

          <div className="auth-tabs">
            <button className={`auth-tab ${mode === "signup" ? "active" : ""}`} onClick={() => setMode("signup")}>Create account</button>
            <button className={`auth-tab ${mode === "login" ? "active" : ""}`} onClick={() => setMode("login")}>Log in</button>
          </div>

          {mode === "signup" && (
            <>
              <label className="field-label">Your name</label>
              <input className="field-input" placeholder="e.g. Mamadou Bailo" value={name} onChange={(e) => setName(e.target.value)} />
              <label className="auth-teacher-request" style={{
                display: "flex", gap: 10, alignItems: "flex-start", marginTop: 14, padding: "11px 12px",
                border: `1px solid ${teacherRequest ? "var(--teal)" : "var(--line)"}`, borderRadius: 10,
                background: teacherRequest ? "var(--teal-soft)" : "#fff", cursor: "pointer", fontSize: 13.5,
              }}>
                <input type="checkbox" checked={teacherRequest} onChange={(e) => setTeacherRequest(e.target.checked)}
                       style={{ marginTop: 2, width: 16, height: 16, accentColor: "var(--teal)" }} />
                <span>
                  <strong>I'm a teacher — request teacher access</strong>
                  <span style={{ display: "block", color: "var(--ink-soft)", fontSize: 12, marginTop: 3 }}>
                    You start as a student. The administrator approves teacher access.
                  </span>
                </span>
              </label>
            </>
          )}

          <label className="field-label" style={{ marginTop: 14 }}>Email</label>
          <input className="field-input" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />

          <label className="field-label" style={{ marginTop: 14 }}>Password</label>
          <PasswordField
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={mode === "signup" ? "8+ characters, a letter, a number" : "Your password"}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
          />

          {err && <div className="field-error">{err}</div>}

          <button className="btn-primary auth-submit" disabled={busy} onClick={submit}>
            {busy ? "Please wait…" : mode === "signup" ? "Create account" : "Log in"} <ChevronRight size={16} />
          </button>
          {mode === "signup" && (
            <p className="auth-note">A confirmation email may be sent depending on your project settings — check your inbox if login doesn't work right away.</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------- Shell ----------
