import React, { useState, useEffect } from "react";
import { Loader2, Highlighter } from "lucide-react";
import { supabase } from "../../supabaseClient";

const COLORS = [
  { key: "yellow", label: "Yellow" },
  { key: "green", label: "Green" },
  { key: "red", label: "Red" },
];

export function ReadingPassage({ assignmentId, userId, text }) {
  const [colors, setColors] = useState({}); // { [wordIndex]: "yellow" | "green" | "red" }
  const [selectedColor, setSelectedColor] = useState("yellow");
  const [loaded, setLoaded] = useState(false);

  // split into tokens, keeping whitespace as separate tokens so layout stays natural
  const tokens = React.useMemo(() => text.split(/(\s+)/), [text]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("reading_highlights")
        .select("word_indices, word_colors")
        .eq("assignment_id", assignmentId)
        .eq("student_id", userId)
        .maybeSingle();

      // Backward compatible: older highlights only have word_indices (no color info) —
      // treat those as yellow by default.
      const map = {};
      (data?.word_indices || []).forEach((i) => {
        map[i] = data?.word_colors?.[i] || "yellow";
      });
      setColors(map);
      setLoaded(true);
    })();
  }, [assignmentId, userId]);

  async function persist(nextMap) {
    await supabase.from("reading_highlights").upsert(
      {
        assignment_id: assignmentId,
        student_id: userId,
        word_indices: Object.keys(nextMap).map(Number),
        word_colors: nextMap,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "assignment_id,student_id" }
    );
  }

  function toggleWord(i) {
    setColors((prev) => {
      const next = { ...prev };
      if (next[i] === selectedColor) {
        // clicking a word already in the selected color removes the highlight
        delete next[i];
      } else {
        // otherwise highlight it (or re-color it) in the selected color
        next[i] = selectedColor;
      }
      persist(next);
      return next;
    });
  }

  if (!loaded) return <div className="asg-desc"><Loader2 className="spin" size={14} /></div>;

  return (
    <div className="reading-passage">
      <div className="reading-toolbar">
        <div className="reading-hint"><Highlighter size={13} /> Pick a color, then click any word to highlight it.</div>
        <div className="color-picker">
          {COLORS.map((c) => (
            <button
              key={c.key}
              type="button"
              title={c.label}
              className={`color-swatch swatch-${c.key} ${selectedColor === c.key ? "active" : ""}`}
              onClick={() => setSelectedColor(c.key)}
            />
          ))}
        </div>
      </div>
      <p className="asg-desc reading-text">
        {tokens.map((tok, i) =>
          /^\s+$/.test(tok) ? (
            tok
          ) : (
            <span
              key={i}
              className={`hl-word ${colors[i] ? `hl-${colors[i]}` : ""}`}
              onClick={() => toggleWord(i)}
            >
              {tok}
            </span>
          )
        )}
      </p>
    </div>
  );
}
