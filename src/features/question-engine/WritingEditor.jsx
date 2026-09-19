import React, { useEffect, useRef, useState } from "react";
import { Bold, Italic, Underline, Undo2, Redo2, AlertCircle, X } from "lucide-react";
import { sanitizeWritingHtml, countWords, MAX_NOTE_LENGTH } from "./writingHtml";

// Rich-text writing area.
//  • Toolbar: Bold / Italic / Underline / Undo / Redo.
//    Keyboard: Ctrl+B / Ctrl+I / Ctrl+U / Ctrl+Z / Ctrl+Y (browser native).
//  • Student (default): spellcheck off, pasting and drag-and-drop blocked.
//  • Teacher correction (allowMarks): extra "Mark error" button — the
//    selected words get a red mark, with an optional note; clicking a
//    mark lets the teacher edit its note or remove it. Plain-text paste
//    is allowed for the teacher.
//  • The editor is "uncontrolled": its HTML is set once on mount and then
//    reported upward on every change, already sanitized, with a word count.
//    Remount it (React key) to load a different text.
export function WritingEditor({
  initialHtml,
  onChange,
  readOnly = false,
  placeholder = "Start writing here…",
  onBlockedPaste,
  allowMarks = false,
  allowPaste = false,
  spellCheck = false,
  onHint,
}) {
  const ref = useRef(null);
  const wrapRef = useRef(null);
  const [active, setActive] = useState({ bold: false, italic: false, underline: false });
  const [isEmpty, setIsEmpty] = useState(true);
  const [notePopup, setNotePopup] = useState(null); // { mark, note, top, left }
  const onBlockedPasteRef = useRef(onBlockedPaste);
  onBlockedPasteRef.current = onBlockedPaste;
  const allowPasteRef = useRef(allowPaste);
  allowPasteRef.current = allowPaste;
  const sanitizeOpts = { allowMarks };

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.innerHTML = sanitizeWritingHtml(initialHtml || "", sanitizeOpts);
    setIsEmpty(!el.innerText.trim());

    // Native listener: React's onBeforeInput does not expose inputType,
    // so paste/drop coming through other routes (menus, IME) is caught here.
    function onNativeBeforeInput(e) {
      if (allowPasteRef.current) return;
      if (e.inputType === "insertFromPaste" || e.inputType === "insertFromDrop" || e.inputType === "insertFromPasteAsQuotation") {
        e.preventDefault();
        onBlockedPasteRef.current?.();
      }
    }
    el.addEventListener("beforeinput", onNativeBeforeInput);
    return () => el.removeEventListener("beforeinput", onNativeBeforeInput);
    // Mount only — see comment above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keeps the B / I / U buttons lit when the caret is inside bold/italic/underlined text.
  useEffect(() => {
    function onSel() {
      const sel = document.getSelection();
      if (!ref.current || !sel || sel.rangeCount === 0 || !ref.current.contains(sel.anchorNode)) return;
      setActive({
        bold: document.queryCommandState("bold"),
        italic: document.queryCommandState("italic"),
        underline: document.queryCommandState("underline"),
      });
    }
    document.addEventListener("selectionchange", onSel);
    return () => document.removeEventListener("selectionchange", onSel);
  }, []);

  function report() {
    const el = ref.current;
    if (!el) return;
    const text = el.innerText;
    setIsEmpty(!text.trim());
    onChange?.(sanitizeWritingHtml(el.innerHTML, sanitizeOpts), countWords(text));
  }

  function prepare() {
    // Real <b>/<i>/<u> tags instead of inline styles, and Enter makes <p>.
    try {
      document.execCommand("styleWithCSS", false, false);
      document.execCommand("defaultParagraphSeparator", false, "p");
    } catch {
      /* older browsers: harmless */
    }
  }

  function run(cmd) {
    if (readOnly) return;
    ref.current?.focus();
    prepare();
    document.execCommand(cmd, false, null);
    report();
    setActive({
      bold: document.queryCommandState("bold"),
      italic: document.queryCommandState("italic"),
      underline: document.queryCommandState("underline"),
    });
  }

  function onPaste(e) {
    e.preventDefault();
    if (!allowPaste) {
      onBlockedPaste?.();
      return;
    }
    const text = e.clipboardData?.getData("text/plain") || "";
    if (text) document.execCommand("insertText", false, text);
  }

  function onDrop(e) {
    e.preventDefault();
    if (!allowPaste) onBlockedPaste?.();
  }

  // ---------- Teacher error marks ----------

  function openNote(mark) {
    const wrap = wrapRef.current;
    if (!wrap || !mark) return;
    const w = wrap.getBoundingClientRect();
    const r = mark.getBoundingClientRect();
    const left = Math.max(8, Math.min(r.left - w.left, w.width - 300));
    // Open below the mark, or above it when too close to the bottom.
    let top = r.bottom - w.top + 6;
    if (top + 190 > w.height) top = Math.max(8, r.top - w.top - 196);
    setNotePopup({ mark, note: mark.getAttribute("data-note") || "", top, left });
  }

  function markError() {
    if (readOnly) return;
    const el = ref.current;
    const sel = document.getSelection();
    if (!el || !sel || sel.rangeCount === 0 || sel.isCollapsed || !el.contains(sel.anchorNode) || !el.contains(sel.focusNode)) {
      onHint?.("Select the words you want to mark first.");
      return;
    }
    const range = sel.getRangeAt(0);
    const probe = document.createElement("div");
    probe.appendChild(range.cloneContents());
    if (probe.querySelector("p, div, br, li")) {
      onHint?.("Mark one sentence or phrase at a time — the selection can't cross paragraphs.");
      return;
    }
    if (!probe.textContent.trim()) return;
    // Existing marks inside the selection are merged into the new one.
    const inner = sanitizeWritingHtml(probe.innerHTML);
    el.focus();
    prepare();
    document.execCommand("insertHTML", false, `<mark data-new-mark="1">${inner}</mark>`);
    const created = el.querySelector("mark[data-new-mark]");
    if (created) {
      created.removeAttribute("data-new-mark");
      report();
      openNote(created);
    } else {
      report();
    }
  }

  function saveNote() {
    if (!notePopup) return;
    const note = notePopup.note.trim().slice(0, MAX_NOTE_LENGTH);
    if (note) notePopup.mark.setAttribute("data-note", note);
    else notePopup.mark.removeAttribute("data-note");
    setNotePopup(null);
    report();
  }

  function removeMark() {
    if (!notePopup) return;
    const m = notePopup.mark;
    const parent = m.parentNode;
    if (parent) {
      while (m.firstChild) parent.insertBefore(m.firstChild, m);
      parent.removeChild(m);
    }
    setNotePopup(null);
    report();
  }

  function onEditorClick(e) {
    if (!allowMarks || readOnly) return;
    const m = e.target.closest?.("mark");
    if (m && ref.current?.contains(m)) openNote(m);
  }

  // onMouseDown + preventDefault keeps the text selection while clicking a button.
  const btn = (cmd, Icon, label, shortcut, isOn) => (
    <button
      type="button"
      className={`qe-wr-tool ${isOn ? "active" : ""}`}
      title={`${label} (${shortcut})`}
      aria-label={label}
      aria-pressed={isOn}
      disabled={readOnly}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => run(cmd)}
    >
      <Icon size={15} strokeWidth={2.4} />
    </button>
  );

  return (
    <div ref={wrapRef} className={`qe-wr-editor-wrap ${readOnly ? "readonly" : ""} ${allowMarks ? "qe-wr-marking" : ""}`}>
      <div className="qe-wr-toolbar" role="toolbar" aria-label="Text formatting">
        {btn("bold", Bold, "Bold", "Ctrl+B", active.bold)}
        {btn("italic", Italic, "Italic", "Ctrl+I", active.italic)}
        {btn("underline", Underline, "Underline", "Ctrl+U", active.underline)}
        <span className="qe-wr-tool-sep" />
        {btn("undo", Undo2, "Undo", "Ctrl+Z", false)}
        {btn("redo", Redo2, "Redo", "Ctrl+Y", false)}
        {allowMarks && (
          <>
            <span className="qe-wr-tool-sep" />
            <button
              type="button"
              className="qe-wr-mark-btn"
              title="Mark the selected words as an error"
              disabled={readOnly}
              onMouseDown={(e) => e.preventDefault()}
              onClick={markError}
            >
              <AlertCircle size={14} strokeWidth={2.4} /> Mark error
            </button>
          </>
        )}
      </div>
      <div
        ref={ref}
        className={`qe-wr-editor ${isEmpty ? "is-empty" : ""}`}
        contentEditable={!readOnly}
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        data-placeholder={placeholder}
        spellCheck={spellCheck}
        lang="en"
        autoCorrect="off"
        autoCapitalize="off"
        autoComplete="off"
        data-gramm="false"
        data-gramm_editor="false"
        data-enable-grammarly="false"
        onFocus={prepare}
        onInput={report}
        onPaste={onPaste}
        onDrop={onDrop}
        onDragOver={(e) => e.preventDefault()}
        onClick={onEditorClick}
      />

      {notePopup && (
        <div className="qe-wr-note-popup" style={{ top: notePopup.top, left: notePopup.left }} onMouseDown={(e) => e.stopPropagation()}>
          <div className="qe-wr-note-head">
            <span>Error note (optional)</span>
            <button type="button" className="qe-wr-note-close" onClick={() => setNotePopup(null)} aria-label="Close"><X size={14} /></button>
          </div>
          <textarea
            className="field-input textarea qe-wr-note-input"
            autoFocus
            maxLength={MAX_NOTE_LENGTH}
            placeholder="e.g. Subject–verb agreement: “people was” → “people were”"
            value={notePopup.note}
            onChange={(e) => setNotePopup((p) => ({ ...p, note: e.target.value }))}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) saveNote();
              if (e.key === "Escape") setNotePopup(null);
            }}
          />
          <div className="qe-wr-note-actions">
            <button type="button" className="btn-ghost qe-wr-note-remove" onClick={removeMark}>Remove mark</button>
            <button type="button" className="btn-primary" onClick={saveNote}>Save note</button>
          </div>
        </div>
      )}
    </div>
  );
}
