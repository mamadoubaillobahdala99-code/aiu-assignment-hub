
import React, { useState, useEffect, useRef } from "react";
import { ChevronRight, ShieldCheck } from "lucide-react";
import { supabase } from "../../supabaseClient";
import { fmtDate } from "../../lib/utils";
import { CenterSpinner } from "../../components/shared";
import { PasswordField, passwordProblem, PASSWORD_RULE_TEXT } from "../../components/PasswordField";
import { loadTeacherWork, loadTeacherExams } from "./teacherWork";
import { loadStudentWork, isDone } from "./studentWork";

// Livraison 77 — the Profile, for teachers and students: who you are and
// your password on the left; on the right, a short summary of your
// activity (each line opens the matching page), the teacher-access request
// (students) and the way into the administration (administrator only).
// Every write is the same as before: profiles.name, the password,
// request_teacher_access.
export function Profile({ profile, userId, setProfile, setScreen, showToast }) {
  const [email, setEmail] = useState("");
  const [createdAt, setCreatedAt] = useState(null);
  const [loading, setLoading] = useState(true);

  const [nameDraft, setNameDraft] = useState(profile?.name || "");
  const [savingName, setSavingName] = useState(false);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  // Livraison 66: the way into the administrator's screen lives here, in
  // the administrator's own Profile, instead of in the menu. A convenience
  // only: the database refuses the admin screen's content to everyone else.
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    let cancelled = false;
    supabase.rpc("is_app_admin").then(({ data, error }) => {
      if (!cancelled) setIsAdmin(!error && data === true);
    });
    return () => { cancelled = true; };
  }, [userId]);

  // Livraison 61: a student can ask for teacher access. The database
  // decides everything (one request at a time, 7 days after a refusal).
  const isStudent = profile?.role === "student";
  const isTeacher = profile?.role === "teacher";
  const [teacherReq, setTeacherReq] = useState(null);   // null = not loaded / not available
  const [askingTeacher, setAskingTeacher] = useState(false);
  useEffect(() => {
    if (!isStudent) return;
    let cancelled = false;
    supabase.rpc("my_teacher_request").then(({ data, error }) => {
      if (!cancelled && !error && data) setTeacherReq(data);
    });
    return () => { cancelled = true; };
  }, [isStudent, userId]);

  // Livraison 77: "My activity" — read with the account's own rights, with
  // the same readers as the Dashboard / Home. If it fails, the card says so
  // and the rest of the page works.
  const [activity, setActivity] = useState(undefined);   // undefined = loading, null = failed
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (isTeacher) {
          const [w, exams] = await Promise.all([loadTeacherWork(userId), loadTeacherExams()]);
          if (cancelled) return;
          setActivity([
            { label: "Classes", value: w.classes.length, go: { name: "home" } },
            { label: "Assignments", value: w.assignments.length, go: { name: "home" } },
            { label: "Students", value: w.students ?? "—", go: { name: "dashboard" } },
            { label: "Exams", value: exams.length, go: { name: "exams" } },
          ]);
        } else {
          const w = await loadStudentWork(userId);
          if (cancelled) return;
          const done = w.items.filter(isDone).length;
          setActivity([
            { label: "Classes", value: w.classes.length, go: { name: "student-classes" } },
            { label: "Assignments to do", value: w.items.length - done, go: { name: "student-assignments" } },
            { label: "Assignments done", value: done, go: { name: "student-assignments" } },
          ]);
        }
      } catch {
        if (!cancelled) setActivity(null);
      }
    })();
    return () => { cancelled = true; };
  }, [isTeacher, userId]);

  const askingRef = useRef(false);   // a second click before the re-render
  async function askTeacherAccess() {
    if (askingRef.current) return;
    askingRef.current = true;
    setAskingTeacher(true);
    const { data, error } = await supabase.rpc("request_teacher_access");
    askingRef.current = false;
    setAskingTeacher(false);
    if (error) { showToast?.("Could not send the request: " + error.message); return; }
    setTeacherReq(data);
    if (data?.status === "pending") showToast?.("Request sent");
  }

  useEffect(() => {
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      setEmail(userData?.user?.email || "");
      const { data: p } = await supabase.from("profiles").select("created_at").eq("id", userId).single();
      setCreatedAt(p?.created_at || null);
      setLoading(false);
    })();
  }, [userId]);

  async function saveName() {
    if (!nameDraft.trim()) return;
    setSavingName(true);
    const { error } = await supabase.from("profiles").update({ name: nameDraft.trim() }).eq("id", userId);
    setSavingName(false);
    if (error) {
      showToast?.("Could not update name");
      return;
    }
    setProfile?.((prev) => (prev ? { ...prev, name: nameDraft.trim() } : prev));
    showToast?.("Name updated");
  }

  async function savePassword() {
    setPasswordError("");
    // The new password rule (livraison 59).
    const problem = passwordProblem(newPassword);
    if (problem) {
      setPasswordError(problem + " " + PASSWORD_RULE_TEXT);
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("Passwords don't match.");
      return;
    }
    setSavingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSavingPassword(false);
    if (error) {
      setPasswordError(error.message);
      return;
    }
    setNewPassword("");
    setConfirmPassword("");
    showToast?.("Password updated");
  }

  if (loading) return <CenterSpinner />;

  const nameChanged = nameDraft.trim() && nameDraft.trim() !== profile?.name;
  const roleLabel = isTeacher ? "Teacher" : "Student";

  return (
    <div className="page page-dash">
      <div className="ph">
        <div className="ph-main">
          <div>
            <div className="eyebrow">Account</div>
            <h1 className="ph-title">Profile</h1>
          </div>
        </div>
      </div>

      <div className="pf-grid">
        <div>
          <section className="panel">
            <div className="pf-who">
              <div className="avatar pf-avatar">{(profile?.name || "?").slice(0, 1).toUpperCase()}</div>
              <div className="pf-who-main">
                <b>{profile?.name}</b>
                <span className="dt-sub">{roleLabel}{isAdmin ? " · Administrator" : ""}{createdAt ? ` · member since ${fmtDate(createdAt)}` : ""}</span>
              </div>
            </div>

            <label className="field-label" htmlFor="pf-name">Name</label>
            <div className="pf-inline">
              <input id="pf-name" className="field-input" value={nameDraft} onChange={(e) => setNameDraft(e.target.value)}
                     onKeyDown={(e) => { if (e.key === "Enter" && nameChanged && !savingName) saveName(); }} />
              <button className="btn-ghost" disabled={savingName || !nameChanged} onClick={saveName}>
                {savingName ? "Saving…" : "Save name"}
              </button>
            </div>
            <p className="field-hint" style={{ marginTop: 6 }}>The name your {isTeacher ? "students" : "teachers"} see.</p>

            <label className="field-label" style={{ marginTop: 14 }}>Email</label>
            <div className="pf-readonly">{email || "—"}</div>
            <p className="field-hint" style={{ marginTop: 6 }}>Your sign-in email. It cannot be changed here.</p>
          </section>

          <section className="panel">
            <div className="panel-h"><h2>Change password</h2></div>
            <label className="field-label">New password</label>
            <PasswordField placeholder="8+ characters, a letter, a number" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            <label className="field-label" style={{ marginTop: 12 }}>Confirm new password</label>
            <PasswordField autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
            {passwordError && <div className="field-error">{passwordError}</div>}
            <button className="btn-primary" style={{ marginTop: 14 }} disabled={savingPassword || !newPassword || !confirmPassword} onClick={savePassword}>
              {savingPassword ? "Saving…" : "Update password"}
            </button>
          </section>
        </div>

        <div>
          <section className="panel">
            <div className="panel-h"><h2>My activity</h2></div>
            {activity === undefined ? (
              <p className="empty-inline">Loading…</p>
            ) : activity === null ? (
              <p className="empty-inline">The figures could not be read. Check your connection.</p>
            ) : (
              <div className="pf-acts">
                {activity.map((a) => (
                  <button key={a.label} type="button" className="pf-act" onClick={() => setScreen(a.go)}>
                    <span>{a.label}</span>
                    <b>{a.value}</b>
                    <ChevronRight size={15} className="pf-act-go" aria-hidden="true" />
                  </button>
                ))}
              </div>
            )}
          </section>

          {isStudent && teacherReq && (() => {
            const again = teacherReq.again_at ? new Date(teacherReq.again_at) : null;
            const tooSoon = teacherReq.status === "declined" && again && again > new Date();
            return (
              <section className="panel">
                <div className="panel-h"><h2>Teacher access</h2></div>
                {teacherReq.status === "pending" ? (
                  <p style={{ margin: 0 }}><span className="pill pill-amber">Request sent — waiting for approval</span></p>
                ) : tooSoon ? (
                  <p className="panel-text" style={{ margin: 0 }}>
                    Your request was declined on {fmtDate(teacherReq.decided_at)}. You can ask again from {fmtDate(teacherReq.again_at)}.
                  </p>
                ) : (
                  <>
                    <p className="panel-text">Are you a teacher? Ask the administrator for teacher access.</p>
                    <button className="btn-ghost" disabled={askingTeacher} onClick={askTeacherAccess}>
                      {askingTeacher ? "Sending…" : "Request teacher access"}
                    </button>
                  </>
                )}
              </section>
            );
          })()}

          {isAdmin && (
            <section className="panel pf-admin">
              <div className="panel-h"><h2><ShieldCheck size={16} /> Administration</h2></div>
              <p className="panel-text">Teachers, students, teacher access requests.</p>
              <button className="btn-ghost" onClick={() => setScreen({ name: "admin" })}>Open the admin page →</button>
              <p className="panel-note" style={{ margin: "8px 0 0" }}>Shown only to the administrator.</p>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
