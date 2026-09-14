
import React, { useState, useEffect } from "react";
import { User, ArrowLeft } from "lucide-react";
import { supabase } from "../../supabaseClient";
import { fmtDate } from "../../lib/utils";
import { PageHeader, CenterSpinner } from "../../components/shared";

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
    if (newPassword.length < 6) {
      setPasswordError("Password must be at least 6 characters.");
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
        <input type="password" className="field-input" placeholder="At least 6 characters" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
        <label className="field-label" style={{ marginTop: 12 }}>Confirm new password</label>
        <input type="password" className="field-input" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
        {passwordError && <div className="field-error">{passwordError}</div>}
        <button className="btn-primary" style={{ marginTop: 12 }} disabled={savingPassword || !newPassword || !confirmPassword} onClick={savePassword}>
          {savingPassword ? "Saving…" : "Update password"}
        </button>
      </div>
    </div>
  );
}
