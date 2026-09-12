import React, { useState, useEffect, useRef, useCallback } from "react";
import { Loader2, Eraser } from "lucide-react";
import { supabase } from "../../supabaseClient";

const COLORS = [
  { key: "yellow", label: "Yellow" },
  { key: "green", label: "Green" },
  { key: "red", label: "Red" },
];

// scopeType: "passage" | "question" — decides which column (section_id
// or question_id) the highlight is filed under, so a passage's
// highlights never mix with a question's, or with another passage's.
export function HighlightableText({ assignmentId, userId, scopeType, scopeId, text, className }) {
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
      query = scopeType === "passage" ? query.eq("section_id", scopeId) : query.eq("question_id", scopeId);
      const { data } = await query.maybeSingle();

      const map = {};
      (data?.word_indices || []).forEach((i) => {
        map[i] = data?.word_colors?.[i] || "yellow";
      });
      setColors(map);
      setLoaded(true);
    })();
  }, [assignmentId, userId, scopeType, scopeId]);

  const persist = useCallback(
    async (nextMap) => {
      await supabase.from("reading_highlights").upsert(
        {
          assignment_id: assignmentId,
          student_id: userId,
          scope_type: scopeType,
          section_id: scopeType === "passage" ? scopeId : null,
          question_id: scopeType === "question" ? scopeId : null,
          word_indices: Object.keys(nextMap).map(Number),
          word_colors: nextMap,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "assignment_id,student_id,scope_type,section_id,question_id" }
      );
    },
    [assignmentId, userId, scopeType, scopeId]
  );

  function wordIndexFromNode(node) {
    const el = node.nodeType === 3 ? node.parentElement : node;
    const span = el?.closest("[data-idx]");
    return span ? parseInt(span.dataset.idx, 10) : null;
  }

  function handleMouseUp() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (!containerRef.current || !containerRef.current.contains(range.commonAncestorContainer)) return;

    const a = wordIndexFromNode(range.startContainer);
    const b = wordIndexFromNode(range.endContainer);
    if (a === null || b === null) return;

    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    const rect = range.getBoundingClientRect();
    const containerRect = containerRef.current.getBoundingClientRect();
    setToolbar({ lo, hi, top: rect.top - containerRect.top - 42, left: Math.max(0, rect.left - containerRect.left) });
  }

  useEffect(() => {
    function onDocMouseDown(e) {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target)) {
        // Let a genuine new selection's own mouseup reopen the toolbar;
        // just close the current one when clicking away.
        setToolbar(null);
      }
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, []);

  function applyColor(color) {
    if (!toolbar) return;
    setColors((prev) => {
      const next = { ...prev };
      for (let i = toolbar.lo; i <= toolbar.hi; i++) {
        if (tokens[i] !== undefined && !/^\s+$/.test(tokens[i])) next[i] = color;
      }
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

  if (!loaded) return <div className="asg-desc"><Loader2 className="spin" size={14} /></div>;

  return (
    <div className={`qe-highlightable ${className || ""}`} ref={containerRef} onMouseUp={handleMouseUp} style={{ position: "relative" }}>
      {toolbar && (
        <div ref={toolbarRef} className="qe-hl-toolbar" style={{ top: toolbar.top, left: toolbar.left }}>
          {COLORS.map((c) => (
            <button key={c.key} type="button" title={c.label} className={`qe-hl-swatch swatch-${c.key}`} onClick={() => applyColor(c.key)} />
          ))}
          <button type="button" title="Remove highlight" className="qe-hl-erase" onClick={eraseSelection}>
            <Eraser size={13} />
          </button>
        </div>
      )}
      <p className="asg-desc reading-text">
        {tokens.map((tok, i) =>
          /^\s+$/.test(tok) ? (
            tok
          ) : (
            <span key={i} data-idx={i} className={`hl-word ${colors[i] ? `hl-${colors[i]}` : ""}`}>
              {tok}
            </span>
          )
        )}
      </p>
    </div>
  );
}
