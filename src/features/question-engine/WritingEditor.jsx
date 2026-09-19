
import React, { useEffect, useRef, useState } from "react";
import { Bold, Italic, Underline, Undo2, Redo2 } from "lucide-react";
import { sanitizeWritingHtml, countWords } from "./writingHtml";

// Rich-text writing area used in exam conditions.
//  • Toolbar: Bold / Italic / Underline / Undo / Redo — nothing else.
//    Keyboard: Ctrl+B / Ctrl+I / Ctrl+U / Ctrl+Z / Ctrl+Y (browser native).
//  • Spellcheck, autocorrect and autocapitalize are OFF.
//  • Pasting and drag-and-drop of text are blocked (exam conditions).
//  • The editor is "uncontrolled": its HTML is set once on mount and then
//    reported upward on every change, already sanitized, with a word count.
//    Remount it (React key) to load a different text.
export function WritingEditor({ initialHtml, onChange, readOnly = false, placeholder = "Start writing here…", onBlockedPaste }) {
  const ref = useRef(null);
  const [active, setActive] = useState({ bold: false, italic: false, underline: false });
  const [isEmpty, setIsEmpty] = useState(true);
  const onBlockedPasteRef = useRef(onBlockedPaste);
  onBlockedPasteRef.current = onBlockedPaste;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.innerHTML = sanitizeWritingHtml(initialHtml || "");
    setIsEmpty(!el.innerText.trim());

    // Native listener: React's onBeforeInput does not expose inputType,
    // so paste/drop coming through other routes (menus, IME) is caught here.
    function onNativeBeforeInput(e) {
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
    onChange?.(sanitizeWritingHtml(el.innerHTML), countWords(text));
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

  function block(e) {
    e.preventDefault();
    onBlockedPaste?.();
  }

  // onMouseDown + preventDefault keeps the student's text selection while clicking a button.
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
    <div className={`qe-wr-editor-wrap ${readOnly ? "readonly" : ""}`}>
      <div className="qe-wr-toolbar" role="toolbar" aria-label="Text formatting">
        {btn("bold", Bold, "Bold", "Ctrl+B", active.bold)}
        {btn("italic", Italic, "Italic", "Ctrl+I", active.italic)}
        {btn("underline", Underline, "Underline", "Ctrl+U", active.underline)}
        <span className="qe-wr-tool-sep" />
        {btn("undo", Undo2, "Undo", "Ctrl+Z", false)}
        {btn("redo", Redo2, "Redo", "Ctrl+Y", false)}
      </div>
      <div
        ref={ref}
        className={`qe-wr-editor ${isEmpty ? "is-empty" : ""}`}
        contentEditable={!readOnly}
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        data-placeholder={placeholder}
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="off"
        autoComplete="off"
        data-gramm="false"
        data-gramm_editor="false"
        data-enable-grammarly="false"
        onFocus={prepare}
        onInput={report}
        onPaste={block}
        onDrop={block}
        onDragOver={(e) => e.preventDefault()}
      />
    </div>
  );
}
