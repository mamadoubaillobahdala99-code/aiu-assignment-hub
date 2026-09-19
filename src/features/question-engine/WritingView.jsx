
import React, { useMemo } from "react";
import { sanitizeWritingHtml } from "./writingHtml";

// Read-only display of a Writing text (student original or teacher's
// corrected copy). The HTML is ALWAYS sanitized here before display —
// never trust what is stored. Clicking a red error mark reports it
// (with its note) through onMarkClick.
export function WritingView({ html, allowMarks = false, onMarkClick, emptyText = "No text written." }) {
  const clean = useMemo(() => sanitizeWritingHtml(html || "", { allowMarks }), [html, allowMarks]);

  function onClick(e) {
    if (!allowMarks || !onMarkClick) return;
    const m = e.target.closest?.("mark");
    if (!m) return;
    const all = [...e.currentTarget.querySelectorAll("mark")];
    onMarkClick({ index: all.indexOf(m), note: m.getAttribute("data-note") || "", text: m.textContent || "" });
  }

  if (!clean.replace(/<[^>]+>/g, "").trim()) {
    return <div className="qe-wr-view qe-wr-view-empty">{emptyText}</div>;
  }
  return (
    <div
      className={`qe-wr-view ${allowMarks ? "qe-wr-view-marks" : ""}`}
      onClick={onClick}
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}
