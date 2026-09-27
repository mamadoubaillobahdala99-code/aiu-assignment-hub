
import React, { useState, useEffect, useRef } from "react";
import { User, ArrowLeft } from "lucide-react";
import { supabase } from "../../supabaseClient";
import { fmtDate } from "../../lib/utils";
import { PageHeader, CenterSpinner } from "../../components/shared";
import { PasswordField, passwordProblem, PASSWORD_RULE_TEXT } from "../../components/PasswordField";

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

  // Livraison 61: a student can ask for teacher access. The database
  // decides everything (one request at a time, 7 days after a refusal).
  const isStudent = profile?.role === "student";
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

  return (
    <div className="page page-wide">
      <button className="back-link" onClick={() => setScreen({ name: "home" })}><ArrowLeft size={14} /> Back</button>
      <PageHeader eyebrow={profile?.role === "teacher" ? "Teacher" : "Student"} title="Profile" />

      <div className="feedback-panel" style={{ maxWidth: 460, marginBottom: 20 }}>
        <div className="avatar" style={{ marginBottom: 14 }}>{(profile?.name || "?").slice(0, 1).toUpperCase()}</div>

        <label className="field-label">Name</label>
        <input className="field-input" value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} />
        <button className="btn-primary" style={{ marginTop: 10 }} disabled={savingName || !nameDraft.trim() || nameDraft.trim() === profile?.name} onClick={saveName}>
          {savingName ? "Saving…" : "Save name"}
        </button>

        <label className="field-label" style={{ marginTop: 18 }}>Role</label>
        <p style={{ margin: "4px 0 0" }}>{profile?.role === "teacher" ? "Teacher" : "Student"}</p>

        <label className="field-label" style={{ marginTop: 14 }}>Email</label>
        <p style={{ margin: "4px 0 0" }}>{email || "—"}</p>

        <label className="field-label" style={{ marginTop: 14 }}>Member since</label>
        <p style={{ margin: "4px 0 0" }}>{createdAt ? fmtDate(createdAt) : "—"}</p>
      </div>

      <div className="feedback-panel" style={{ maxWidth: 460 }}>
        <div className="field-label" style={{ marginBottom: 10 }}>Change password</div>
        <label className="field-label">New password</label>
        <PasswordField placeholder="8+ characters, a letter, a number" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
        <label className="field-label" style={{ marginTop: 12 }}>Confirm new password</label>
        <PasswordField autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
        {passwordError && <div className="field-error">{passwordError}</div>}
        <button className="btn-primary" style={{ marginTop: 12 }} disabled={savingPassword || !newPassword || !confirmPassword} onClick={savePassword}>
          {savingPassword ? "Saving…" : "Update password"}
        </button>
      </div>

      {isStudent && teacherReq && (() => {
        const again = teacherReq.again_at ? new Date(teacherReq.again_at) : null;
        const tooSoon = teacherReq.status === "declined" && again && again > new Date();
        return (
          <div className="feedback-panel" style={{ maxWidth: 460 }}>
            <div className="field-label" style={{ marginBottom: 8 }}>Teacher access</div>
            {teacherReq.status === "pending" ? (
              <p style={{ margin: 0 }}>
                <span style={{ display: "inline-block", background: "var(--amber-soft)", color: "var(--amber)", fontWeight: 600, fontSize: 13, padding: "6px 12px", borderRadius: 999 }}>
                  Request sent — waiting for approval
                </span>
              </p>
            ) : tooSoon ? (
              <p style={{ margin: 0, fontSize: 14 }}>
                Your request was declined on {fmtDate(teacherReq.decided_at)}. You can ask again from {fmtDate(teacherReq.again_at)}.
              </p>
            ) : (
              <>
                <p style={{ margin: "0 0 10px", fontSize: 14, color: "var(--ink-soft)" }}>
                  Are you a teacher? Ask the administrator for teacher access.
                </p>
                <button className="btn-ghost" disabled={askingTeacher} onClick={askTeacherAccess}>
                  {askingTeacher ? "Sending…" : "Request teacher access"}
                </button>
              </>
            )}
          </div>
        );
      })()}
    </div>
  );
}
