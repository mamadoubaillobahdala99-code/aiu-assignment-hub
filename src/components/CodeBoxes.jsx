import React, { useRef, useEffect } from "react";

// Livraison 80 — a code typed in boxes, one character per box (the exam
// code). Same behaviour as « Join a class » (livraison 77): typing moves to
// the next box, Backspace goes back, the arrows move, pasting a whole code
// (" ab12cd ") fills every box from the first one. Enter calls onEnter —
// INSIDE the key press, so a screen that asks for full screen there still
// gets it (a browser only grants full screen to a gesture).
// The boxes only edit a value (an array, one character per box — an
// empty box stays empty, nothing shifts); they never send anything.
export const cleanCode = (v) => String(v || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

export function CodeBoxes({ length, value, onChange, onEnter, disabled, bad, label = "Code", autoFocus }) {
  const refs = useRef([]);
  const boxes = Array.from({ length }, (_, i) => (value && value[i]) || "");

  useEffect(() => { if (autoFocus) refs.current[0]?.focus(); }, [autoFocus]);

  function put(from, text) {
    const chars = cleanCode(text).slice(0, length - from).split("");
    if (chars.length === 0) return;
    const n = [...boxes];
    chars.forEach((c, k) => { n[from + k] = c; });
    onChange(n);
    refs.current[Math.min(from + chars.length, length - 1)]?.focus();
  }
  function setAt(i, c) {
    const n = [...boxes]; n[i] = c;
    onChange(n);
  }

  function handleChange(i, e) {
    const v = cleanCode(e.target.value);
    if (!v) { setAt(i, ""); return; }
    // A box that already held a character receives two: keep the new one.
    put(i, v.length > 1 && boxes[i] ? v.replace(boxes[i], "") || v : v);
  }
  function handleKey(i, e) {
    if (e.key === "Backspace" && !boxes[i] && i > 0) {
      e.preventDefault();
      setAt(i - 1, "");
      refs.current[i - 1]?.focus();
    } else if (e.key === "ArrowLeft" && i > 0) {
      e.preventDefault(); refs.current[i - 1]?.focus();
    } else if (e.key === "ArrowRight" && i < length - 1) {
      e.preventDefault(); refs.current[i + 1]?.focus();
    } else if (e.key === "Enter") {
      e.preventDefault(); onEnter?.();
    }
  }
  function handlePaste(i, e) {
    e.preventDefault();
    const text = e.clipboardData?.getData("text") || "";
    put(cleanCode(text).length >= length ? 0 : i, text);
  }

  return (
    <div className={`jc-boxes ${bad ? "bad" : ""}`} role="group" aria-label={label}>
      {boxes.map((c, i) => (
        <input key={i} ref={(el) => { refs.current[i] = el; }}
               className={`jc-box ${c ? "on" : ""}`} value={c} inputMode="text" autoComplete="off" autoCapitalize="characters" spellCheck={false}
               aria-label={`Character ${i + 1} of ${length}`} maxLength={length}
               onChange={(e) => handleChange(i, e)} onKeyDown={(e) => handleKey(i, e)} onPaste={(e) => handlePaste(i, e)}
               onFocus={(e) => e.target.select()} disabled={disabled} />
      ))}
    </div>
  );
}
