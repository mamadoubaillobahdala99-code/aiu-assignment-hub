import React, { useState, useEffect, useRef, useCallback } from "react";
import { Eraser } from "lucide-react";
import { supabase } from "../../supabaseClient";

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
export function HighlightableText({ assignmentId, userId, scopeType, scopeId, optionKey, text, className, inline }) {
  const [colors, setColors] = useState({});
  const [loaded, setLoaded] = useState(false);
  const [toolbar, setToolbar] = useState(null); // { lo, hi, top, left } | null
  const containerRef = useRef(null);
  const toolbarRef = useRef(null);

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

  function handleMouseUp() {
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
    setToolbar({ lo, hi, top: rect.top - containerRect.top - 42, left: Math.max(0, rect.left - containerRect.left) });
  }

  useEffect(() => {
    function onDocMouseDown(e) {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target)) setToolbar(null);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, []);

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

  const body = loaded ? (
    tokens.map((tok, i) => (
      <span key={i} data-idx={i} className={colors[i] ? `hl-word hl-${colors[i]}` : "hl-word"}>
        {tok}
      </span>
    ))
  ) : (
    <span>{text}</span>
  );

  const Wrapper = inline ? "span" : "p";
  const wrapperClass = inline ? "qe-hl-inline" : "asg-desc reading-text";

  return (
    <span className={`qe-highlightable ${className || ""}`} ref={containerRef} onMouseUp={handleMouseUp} style={{ position: "relative", display: inline ? "inline" : "block" }}>
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
