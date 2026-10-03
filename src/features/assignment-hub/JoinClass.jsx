import React, { useState, useEffect, useRef } from "react";
import { supabase } from "../../supabaseClient";

// Livraison 77 — « Join a class »: the 5-character code in 5 boxes.
// Typing moves to the next box, Backspace goes back, the arrows move, and
// pasting a whole code ("k7x2m", " K7X2M ") fills every box. Enter joins.
//
// Joining goes through the database function join_class, the only way in:
// the class list is private (a student only sees the classes they belong
// to), so the code is checked by the server, which enrols the student in
// the same step. Running it twice is harmless. The call is the same as
// before: join_class({ p_code }).
const LEN = 5;
const clean = (v) => String(v || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

export function JoinClass({ userId, setScreen, showToast }) {
  const [boxes, setBoxes] = useState(Array(LEN).fill(""));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [mine, setMine] = useState(null);   // the classes I am already in (names)
  const refs = useRef([]);
  const busyRef = useRef(false);            // a second Enter / click before the re-render

  // The classes this student already belongs to (an exam's private box is
  // not a class). Read with the student's own rights.
  useEffect(() => {
    let cancelled = false;
    supabase.from("roster").select("class_id, classes(name, kind)").eq("student_id", userId).then(({ data, error }) => {
      if (cancelled || error) return;
      setMine((data || []).filter((r) => r.classes && r.classes.kind !== "exam").map((r) => ({ id: r.class_id, name: r.classes.name || "Class" })));
    });
    return () => { cancelled = true; };
  }, [userId]);

  useEffect(() => { refs.current[0]?.focus(); }, []);

  const code = boxes.join("");
  const full = code.length === LEN;

  function fill(from, text) {
    const chars = clean(text).slice(0, LEN - from).split("");
    if (chars.length === 0) return;
    setErr("");
    setBoxes((b) => { const n = [...b]; chars.forEach((c, k) => { n[from + k] = c; }); return n; });
    refs.current[Math.min(from + chars.length, LEN - 1)]?.focus();
  }

  function onChange(i, e) {
    const v = clean(e.target.value);
    if (!v) { setBoxes((b) => { const n = [...b]; n[i] = ""; return n; }); return; }
    // A box that already held a letter receives two: keep the new one.
    fill(i, v.length > 1 && boxes[i] ? v.replace(boxes[i], "") || v : v);
  }

  function onKeyDown(i, e) {
    if (e.key === "Backspace" && !boxes[i] && i > 0) {
      e.preventDefault();
      setBoxes((b) => { const n = [...b]; n[i - 1] = ""; return n; });
      refs.current[i - 1]?.focus();
    } else if (e.key === "ArrowLeft" && i > 0) {
      e.preventDefault(); refs.current[i - 1]?.focus();
    } else if (e.key === "ArrowRight" && i < LEN - 1) {
      e.preventDefault(); refs.current[i + 1]?.focus();
    } else if (e.key === "Enter") {
      e.preventDefault(); join();
    }
  }

  function onPaste(i, e) {
    e.preventDefault();
    const text = e.clipboardData?.getData("text") || "";
    // A whole code pasted anywhere fills the boxes from the first one.
    fill(clean(text).length >= LEN ? 0 : i, text);
  }

  async function join() {
    if (!full || busyRef.current) return;
    setErr("");
    busyRef.current = true;
    setBusy(true);
    const { data, error } = await supabase.rpc("join_class", { p_code: code });
    busyRef.current = false;
    setBusy(false);
    if (error) {
      setErr(
        /No class found/i.test(error.message || "")
          ? "No class found with that code. Double-check with your teacher."
          : "Could not join this class. Check your connection and try again."
      );
      return;
    }
    const already = mine?.some((c) => c.id === data?.class_id);
    showToast(already ? `You are already in ${data?.name || "this class"}` : `Joined ${data?.name || "the class"}`);
    // Straight to the class just joined (its assignments are there).
    setScreen(data?.class_id ? { name: "student-class-detail", classId: data.class_id } : { name: "home" });
  }

  return (
    <div className="page jc-page">
      <div className="jc-card">
        <div className="eyebrow">Join a class</div>
        <h1 className="ph-title">Enter your class code</h1>
        <p className="ph-sub" style={{ marginTop: 6 }}>Your teacher gives you a {LEN}-character code, for example A2K9Q.</p>

        <div className={`jc-boxes ${err ? "bad" : ""}`} role="group" aria-label="Class code">
          {boxes.map((c, i) => (
            <input key={i} ref={(el) => { refs.current[i] = el; }}
                   className={`jc-box ${c ? "on" : ""}`} value={c} inputMode="text" autoComplete="off" autoCapitalize="characters" spellCheck={false}
                   aria-label={`Character ${i + 1} of ${LEN}`} maxLength={LEN}
                   onChange={(e) => onChange(i, e)} onKeyDown={(e) => onKeyDown(i, e)} onPaste={(e) => onPaste(i, e)}
                   onFocus={(e) => e.target.select()} disabled={busy} />
          ))}
        </div>
        {err && <div className="field-error jc-err" role="alert">{err}</div>}

        <button className="btn-primary jc-go" disabled={!full || busy} onClick={join}>
          {busy ? "Joining…" : "Join the class"}
        </button>

        {mine && (
          <p className="jc-mine">
            {mine.length === 0
              ? "You are not in any class yet."
              : <>Already in {mine.length} class{mine.length === 1 ? "" : "es"}: {mine.map((c) => c.name).join(", ")} · </>}
            {mine.length > 0 && <button type="button" className="panel-link" onClick={() => setScreen({ name: "student-classes" })}>My classes →</button>}
          </p>
        )}
      </div>
    </div>
  );
}
