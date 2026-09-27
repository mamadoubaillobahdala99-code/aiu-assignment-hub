import React, { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

// The password rule (livraison 59) — the same one Supabase is set to enforce
// (Authentication → Email: minimum 8, "letters and digits"), and the same one
// sql/reinitialiser_mot_de_passe.sql checks. Applied only when a password is
// CREATED or CHANGED, never at login: older 6-character passwords still work.
export const PASSWORD_RULE_TEXT = "At least 8 characters, with at least one letter and one number.";

export function passwordProblem(pw) {
  const value = pw || "";
  if (value.length < 8) return "Password must be at least 8 characters.";
  // bcrypt, used by Supabase, only reads the first 72 bytes.
  if (new TextEncoder().encode(value).length > 72) return "Password must be at most 72 characters.";
  if (!/[A-Za-z]/.test(value)) return "Password must contain at least one letter.";
  if (!/[0-9]/.test(value)) return "Password must contain at least one number.";
  return "";
}

// A password input with a show / hide ("eye") button. The button never
// submits anything: it only switches what the field shows.
export function PasswordField({ value, onChange, placeholder, autoComplete }) {
  const [shown, setShown] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <input
        className="field-input"
        type={shown ? "text" : "password"}
        placeholder={placeholder}
        autoComplete={autoComplete}
        value={value}
        onChange={onChange}
        style={{ paddingRight: 44 }}
      />
      <button
        type="button"
        className="password-eye"
        aria-label={shown ? "Hide password" : "Show password"}
        aria-pressed={shown}
        title={shown ? "Hide password" : "Show password"}
        onClick={() => setShown((s) => !s)}
        style={{
          position: "absolute", top: 0, right: 0, height: "100%", width: 42,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "none", border: "none", cursor: "pointer", color: "var(--ink-soft)", padding: 0,
        }}
      >
        {shown ? <EyeOff size={17} /> : <Eye size={17} />}
      </button>
    </div>
  );
}
