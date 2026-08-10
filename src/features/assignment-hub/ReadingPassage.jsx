import React, { useState, useEffect, useCallback } from "react";
import { BookOpen, Users, Plus, Check, Clock, AlertTriangle, LogOut, GraduationCap, FileText, ChevronRight, X, Copy, CheckCircle2, Headphones, PenLine, Mic, ListChecks, ArrowLeft, Loader2, Timer, Highlighter } from "lucide-react";
import { supabase } from "../../supabaseClient";
import { uid, makeCode, TYPES, fmtDate, daysUntil, wordCount, isPdfUrl } from "../../lib/utils";
import { AttachmentPreview, PageHeader, EmptyState, CenterSpinner, Modal, StatusBadge } from "../../components/shared";

export function ReadingPassage({ assignmentId, userId, text }) {
  const [highlighted, setHighlighted] = useState(new Set());
  const [loaded, setLoaded] = useState(false);

  // split into tokens, keeping whitespace as separate tokens so layout stays natural
  const tokens = React.useMemo(() => text.split(/(\s+)/), [text]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("reading_highlights")
        .select("word_indices")
        .eq("assignment_id", assignmentId)
        .eq("student_id", userId)
        .maybeSingle();
      setHighlighted(new Set(data?.word_indices || []));
      setLoaded(true);
    })();
  }, [assignmentId, userId]);

  async function persist(nextSet) {
    await supabase.from("reading_highlights").upsert(
      { assignment_id: assignmentId, student_id: userId, word_indices: Array.from(nextSet), updated_at: new Date().toISOString() },
      { onConflict: "assignment_id,student_id" }
    );
  }

  function toggleWord(i) {
    setHighlighted((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      persist(next);
      return next;
    });
  }

  if (!loaded) return <div className="asg-desc"><Loader2 className="spin" size={14} /></div>;

  return (
    <div className="reading-passage">
      <div className="reading-hint"><Highlighter size={13} /> Click any word to highlight it while you read.</div>
      <p className="asg-desc reading-text">
        {tokens.map((tok, i) =>
          /^\s+$/.test(tok) ? (
            tok
          ) : (
            <span key={i} className={`hl-word ${highlighted.has(i) ? "hl-active" : ""}`} onClick={() => toggleWord(i)}>
              {tok}
            </span>
          )
        )}
      </p>
    </div>
  );
}
