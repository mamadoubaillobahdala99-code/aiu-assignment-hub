import React, { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { ago } from "./teacherWork";
import { sortRows, plainPrompt } from "./assignmentWork";

// Livraison 73 — the figures, the students table and (Reading /
// Listening) the questions table of one assignment, for its teacher.

const fmtWhen = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  const today = new Date();
  const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === today.toDateString()) return `today, ${time}`;
  return `${d.toLocaleDateString(undefined, { day: "numeric", month: "short" })}, ${time}`;
};
const fmtNum = (n) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10));

export function AssignmentStats({ stats }) {
  if (!stats) return null;
  const cards = [];
  if (stats.kind === "speaking") {
    cards.push(["Viewed", `${stats.viewed}/${stats.students}`, stats.notYet ? `${stats.notYet} not yet` : "everyone has opened it"]);
    cards.push(["Not viewed yet", stats.notYet, stats.notYet ? `student${stats.notYet === 1 ? "" : "s"}` : "nobody left"]);
  } else if (stats.kind === "writing") {
    cards.push(["Handed in", `${stats.handed}/${stats.students}`, stats.students - stats.handed ? `${stats.students - stats.handed} not yet` : "everyone"]);
    cards.push(["To mark", stats.toMark, stats.toMark ? `oldest ${ago(stats.oldest)}` : "all feedback published"]);
    cards.push(["Average band", stats.avgBand ?? "—", stats.marked ? `on ${stats.marked} marked cop${stats.marked === 1 ? "y" : "ies"}` : "no band given yet"]);
    cards.push(["In progress", stats.inProgress, "started, not handed in"]);
  } else {
    cards.push(["Handed in", `${stats.handed}/${stats.students}`, stats.students - stats.handed ? `${stats.students - stats.handed} not yet` : "everyone"]);
    cards.push(["Average band", stats.avgBand ?? "—", stats.handed ? `score ${fmtNum(stats.avgScore)}${stats.total ? `/${stats.total}` : ""} · on ${stats.handed} cop${stats.handed === 1 ? "y" : "ies"}` : "no copy yet"]);
    cards.push(["Hardest question", stats.hardest ? `Q${stats.hardest.number}` : "—", stats.hardest ? `${stats.hardest.correct}/${stats.hardest.of} correct` : "after the first copies"]);
    cards.push(["In progress", stats.inProgress, "started, not handed in"]);
  }
  return (
    <div className={`stat-grid ${cards.length === 2 ? "stat-grid-2" : ""}`}>
      {cards.map(([l, v, d]) => (
        <div key={l} className="stat"><div className="stat-l">{l}</div><div className="stat-v">{v}</div><div className="stat-d">{d}</div></div>
      ))}
    </div>
  );
}

const PILL = {
  "handed-in": ["Handed in", "pill-teal"],
  "to-mark": ["To mark", "pill-amber"],
  published: ["Feedback published", "pill-teal"],
  "in-progress": ["In progress", "pill-blue"],
  "not-started": ["Not started", ""],
  viewed: ["Viewed", "pill-teal"],
  "not-viewed": ["Not viewed yet", ""],
  "no-content": ["—", ""],
};

function resultText(r) {
  if (r.score) {
    const s = `${fmtNum(r.score.earned)}${r.score.total ? `/${r.score.total}` : ""}`;
    return r.band ? `${s} · band ${r.band}` : s;
  }
  if (r.band) return `Band ${r.band}`;
  return "—";
}

export function StudentsTable({ rows, type, onOpen }) {
  const [query, setQuery] = useState("");
  const [show, setShow] = useState("all");
  const doneLabel = type === "Speaking" ? "Viewed" : "Handed in";
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sortRows(rows).filter((r) => (show === "all" || (show === "done" ? (r.open || r.status === "viewed") : !(r.open || r.status === "viewed")))
      && (!q || String(r.name).toLowerCase().includes(q)));
  }, [rows, query, show]);
  const hasResult = type !== "Speaking";

  return (
    <>
      <div className="dt-toolbar">
        <label className="dt-search">
          <Search size={15} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search students…" aria-label="Search students" />
        </label>
        <div className="dt-chips" role="group" aria-label="Filter students">
          {[["all", "All"], ["done", doneLabel], ["todo", "Not yet"]].map(([k, l]) => (
            <button key={k} type="button" className={`dt-chip ${show === k ? "on" : ""}`} aria-pressed={show === k} onClick={() => setShow(k)}>{l}</button>
          ))}
        </div>
      </div>
      {list.length === 0 ? (
        <p className="empty-inline">No student matches. <button className="dt-reset" onClick={() => { setQuery(""); setShow("all"); }}>Show all</button></p>
      ) : (
        <div className="dt-wrap">
          <table className="dt">
            <thead><tr><th>Student</th><th>Status</th>{hasResult && <th className="hide-sm">Result</th>}<th className="hide-sm">When</th><th aria-label="Open" /></tr></thead>
            <tbody>
              {list.map((r) => {
                const [label, tone] = PILL[r.status] || PILL["not-started"];
                const when = r.at ? fmtWhen(r.at) : r.startedAt ? `started ${fmtWhen(r.startedAt)}` : "—";
                return (
                  <tr key={r.id} className={`dt-row ${r.open ? "" : "dt-row-static"}`} onClick={r.open ? () => onOpen(r) : undefined}>
                    <td>
                      <div className="dt-title">
                        <span className="act-av" aria-hidden="true">{String(r.name || "?").trim().charAt(0).toUpperCase()}</span>
                        <span className="dt-title-text">
                          {r.open ? <button type="button" className="dt-open" onClick={(e) => { e.stopPropagation(); onOpen(r); }}>{r.name}</button> : <span className="dt-name">{r.name}</span>}
                          <span className="dt-sub show-sm">{hasResult && resultText(r) !== "—" ? `${resultText(r)} · ` : ""}{when}</span>
                        </span>
                      </div>
                    </td>
                    <td><span className={`pill ${tone}`}>{label}</span></td>
                    {hasResult && (
                      <td className="hide-sm dt-nowrap">
                        <b className="dt-result">{resultText(r)}</b>
                        {type === "Writing" && r.band && !r.bandPublished && <span className="dt-muted"> · not published</span>}
                      </td>
                    )}
                    <td className="hide-sm dt-muted dt-nowrap">{when}</td>
                    <td className="dt-actions" onClick={(e) => e.stopPropagation()}>
                      {r.open && <button type="button" className="btn-ghost btn-go" onClick={() => onOpen(r)}>{r.status === "to-mark" ? "Mark →" : "Open →"}</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

export function QuestionsTable({ questions, handed }) {
  if (questions.length === 0) return <p className="empty-inline">This paper has no questions yet.</p>;
  if (handed === 0) return <p className="empty-inline">How each question went appears here after the first copies are handed in.</p>;
  const min = Math.min(...questions.map((q) => q.correct));
  return (
    <div className="dt-wrap">
      <table className="dt">
        <thead><tr><th>#</th><th>Question</th><th>Correct</th></tr></thead>
        <tbody>
          {questions.map((q) => {
            const pct = Math.round((q.correct / handed) * 100);
            return (
              <tr key={q.id} className={q.correct === min ? "dt-row-hard" : ""}>
                <td className="dt-nowrap"><b>Q{q.number}</b></td>
                <td><span className="dt-q">{plainPrompt(q.prompt) || String(q.type || "").replace(/_/g, " ")}</span></td>
                <td>
                  <span className="dt-progress">
                    <span className="dt-bar"><i style={{ width: `${pct}%` }} /></span>
                    {q.correct}/{handed}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
