import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from "react";
import { Eraser } from "lucide-react";
import { supabase } from "../../supabaseClient";
import { IMAGE_MARKER_RE, PassageFigure, defaultResolve } from "./PassageImages";

const COLORS = [
  { key: "yellow", label: "Yellow" },
  { key: "green", label: "Green" },
  { key: "red", label: "Red" },
];

// scopeType: "passage" | "question"
// optionKey: only for scopeType="question" — distinguishes an option's
// own highlight (e.g. "A", "B") from the question's prompt (undefined)
// and from every other option, so none of them ever mix.
// inline: renders a plain <span> instead of a full paragraph block —
// use this for text that sits inside an answer row (options, labels).
// images: the text may contain "[[image:…]]" lines (Reading passages):
// they are shown as pictures in place. Word positions (and so saved
// highlights) are unchanged, because the image line stays one token.
export function HighlightableText({ assignmentId, userId, scopeType, scopeId, optionKey, text, className, inline, images = false, resolveImage = defaultResolve }) {
  const [colors, setColors] = useState({});
  const [loaded, setLoaded] = useState(false);
  const [toolbar, setToolbar] = useState(null); // { lo, hi, top, left } | null
  const containerRef = useRef(null);
  const toolbarRef = useRef(null);
  const draggingRef = useRef(false);

  const tokens = React.useMemo(() => text.split(/(\s+)/), [text]);

  useEffect(() => {
    setLoaded(false);
    setColors({});
    (async () => {
      let query = supabase
        .from("reading_highlights")
        .select("word_indices, word_colors")
        .eq("assignment_id", assignmentId)
        .eq("student_id", userId)
        .eq("scope_type", scopeType);

      if (scopeType === "passage") {
        query = query.eq("section_id", scopeId).is("question_id", null).is("option_key", null);
      } else {
        query = query.is("section_id", null).eq("question_id", scopeId);
        query = optionKey ? query.eq("option_key", optionKey) : query.is("option_key", null);
      }

      const { data } = await query.maybeSingle();

      const map = {};
      (data?.word_indices || []).forEach((i) => {
        map[i] = data?.word_colors?.[i] || "yellow";
      });
      setColors(map);
      setLoaded(true);
    })();
  }, [assignmentId, userId, scopeType, scopeId, optionKey]);

  const persist = useCallback(
    async (nextMap) => {
      await supabase.from("reading_highlights").upsert(
        {
          assignment_id: assignmentId,
          student_id: userId,
          scope_type: scopeType,
          section_id: scopeType === "passage" ? scopeId : null,
          question_id: scopeType === "question" ? scopeId : null,
          option_key: scopeType === "question" ? optionKey || null : null,
          word_indices: Object.keys(nextMap).map(Number),
          word_colors: nextMap,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "assignment_id,student_id,scope_type,section_id,question_id,option_key" }
      );
    },
    [assignmentId, userId, scopeType, scopeId, optionKey]
  );

  function anchorIndexFromNode(node) {
    const el = node.nodeType === 3 ? node.parentElement : node;
    const span = el?.closest("[data-idx]");
    return span ? parseInt(span.dataset.idx, 10) : null;
  }

  // Reads whatever is selected right now and puts the colour bar above
  // it. Called from two places (see below) so that a finger and a mouse
  // both get there.
  const showToolbarForSelection = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (!containerRef.current || !containerRef.current.contains(range.commonAncestorContainer)) return;

    const a = anchorIndexFromNode(range.startContainer);
    const b = anchorIndexFromNode(range.endContainer);
    if (a === null || b === null) return;

    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    const rect = range.getBoundingClientRect();
    const containerRect = containerRef.current.getBoundingClientRect();

    // Above the selection when there is room; underneath otherwise. At
    // the top of a passage on a phone there is none, and the bar used to
    // be drawn off-screen where nobody could reach it.
    const above = rect.top - containerRect.top - 42;
    const top = above < 0 ? rect.bottom - containerRect.top + 8 : above;

    setToolbar({ lo, hi, top, left: Math.max(0, rect.left - containerRect.left) });
  }, []);

  // A finger never fires mouseup, so on a phone or a tablet the colour
  // bar simply never appeared. selectionchange is the one event both a
  // mouse and a finger raise — including when iOS's own round handles
  // are dragged to widen the selection, which raises nothing else.
  // While the pointer is still down the selection is not finished, so we
  // wait: the bar would otherwise jump around mid-drag.
  useEffect(() => {
    let timer = null;
    const settle = (delay) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (!draggingRef.current) showToolbarForSelection();
      }, delay);
    };

    function onSelectionChange() {
      if (draggingRef.current) return;
      settle(200);
    }
    function onPointerDown(e) {
      if (toolbarRef.current && toolbarRef.current.contains(e.target)) return;
      draggingRef.current = true;
      setToolbar(null);
    }
    function onPointerUp() {
      draggingRef.current = false;
      // A short breath: iOS settles the selection just after the finger
      // leaves the glass, not before.
      settle(60);
    }

    document.addEventListener("selectionchange", onSelectionChange);
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("pointerup", onPointerUp);
    document.addEventListener("pointercancel", onPointerUp);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("selectionchange", onSelectionChange);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("pointerup", onPointerUp);
      document.removeEventListener("pointercancel", onPointerUp);
    };
  }, [showToolbarForSelection]);

  // Keep the bar inside the panel: near the right edge of a narrow
  // screen it used to hang off the side. Measured once it is on screen,
  // so the width is the real one rather than a guess.
  useLayoutEffect(() => {
    if (!toolbar || !toolbarRef.current || !containerRef.current) return;
    const max = containerRef.current.clientWidth - toolbarRef.current.offsetWidth;
    const clamped = Math.max(0, Math.min(toolbar.left, Math.max(0, max)));
    if (clamped !== toolbar.left) setToolbar((t) => (t ? { ...t, left: clamped } : t));
  }, [toolbar]);

  // Every token in the range gets the color — including the spaces
  // between words — so a highlighted phrase reads as one continuous
  // band, exactly like a real exam, instead of word-by-word chunks
  // with white gaps at each space.
  function applyColor(color) {
    if (!toolbar) return;
    setColors((prev) => {
      const next = { ...prev };
      for (let i = toolbar.lo; i <= toolbar.hi; i++) if (tokens[i] !== undefined) next[i] = color;
      persist(next);
      return next;
    });
    window.getSelection()?.removeAllRanges();
    setToolbar(null);
  }

  function eraseSelection() {
    if (!toolbar) return;
    setColors((prev) => {
      const next = { ...prev };
      for (let i = toolbar.lo; i <= toolbar.hi; i++) delete next[i];
      persist(next);
      return next;
    });
    window.getSelection()?.removeAllRanges();
    setToolbar(null);
  }

  const hasImages = images && !inline && text.includes("[[image:");
  const isImage = (t) => hasImages && IMAGE_MARKER_RE.test(t || "");

  const body = hasImages ? (
    tokens.map((tok, i) => {
      if (isImage(tok)) {
        const src = resolveImage(IMAGE_MARKER_RE.exec(tok)[1]);
        return <span key={i} data-idx={i} className="qe-hl-figure">{src ? <PassageFigure url={src} /> : null}</span>;
      }
      // The line breaks around a picture are drawn by the picture itself.
      if (/^\s+$/.test(tok) && (isImage(tokens[i - 1]) || isImage(tokens[i + 1]))) return <span key={i} data-idx={i} />;
      return (
        <span key={i} data-idx={i} className={loaded && colors[i] ? `qe-hl-word qe-hl-${colors[i]}` : "qe-hl-word"}>
          {tok}
        </span>
      );
    })
  ) : loaded ? (
    tokens.map((tok, i) => (
      <span key={i} data-idx={i} className={colors[i] ? `qe-hl-word qe-hl-${colors[i]}` : "qe-hl-word"}>
        {tok}
      </span>
    ))
  ) : (
    <span>{text}</span>
  );

  const Wrapper = inline ? "span" : hasImages ? "div" : "p";
  const wrapperClass = inline ? "qe-hl-inline" : "asg-desc reading-text";

  return (
    <span className={`qe-highlightable ${className || ""}`} ref={containerRef} style={{ position: "relative", display: inline ? "inline" : "block" }}>
      {toolbar && (
        <span ref={toolbarRef} className="qe-hl-toolbar" style={{ top: toolbar.top, left: toolbar.left }}>
          {COLORS.map((c) => (
            <button key={c.key} type="button" title={c.label} className={`qe-hl-swatch swatch-${c.key}`} onClick={() => applyColor(c.key)} />
          ))}
          <button type="button" title="Remove highlight" className="qe-hl-erase" onClick={eraseSelection}>
            <Eraser size={13} />
          </button>
        </span>
      )}
      <Wrapper className={wrapperClass}>{body}</Wrapper>
    </span>
  );
}
