import React, { useMemo, useState } from "react";
import { FileText, Search, Copy, ExternalLink } from "lucide-react";
import { EmptyState } from "../../components/shared";
import { DropMenu, DropMenuItem } from "../../components/DropMenu";
import { TYPES } from "../../lib/utils";
import { dueInfo } from "../../lib/due";

// The list of a class's assignments, on the teacher's class page.
//
// Livraison 70: a table instead of a pile of cards — type, time, due date,
// how many students handed it in ("8/12", from class_overview, script 44)
// and, for Writing, how many copies still wait for a correction. A search
// box and one chip per skill filter it. Every row opens the assignment;
// its "⋯" menu opens it too, or opens it with the Duplicate panel ready.
const SKILLS = ["Reading", "Listening", "Writing", "Speaking"];
const skillOf = (type) => (String(type || "").startsWith("Writing") ? "Writing" : SKILLS.includes(type) ? type : "Other");
const icClass = { Reading: "ic-reading", Listening: "ic-listening", Writing: "ic-writing", Speaking: "ic-speaking", Other: "ic-reading" };

export function AssignmentsTab({ assignments, counts, studentsCount, onOpen, onDuplicate }) {
  const [query, setQuery] = useState("");
  const [skill, setSkill] = useState("All");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return assignments.filter((a) =>
      (skill === "All" || skillOf(a.type) === skill) && (!q || String(a.title || "").toLowerCase().includes(q)));
  }, [assignments, query, skill]);

  if (assignments.length === 0) {
    return (
      <EmptyState
        icon={<FileText size={26} />}
        title="No assignments yet"
        body="Use New assignment, at the top of the page, to import a test or build your first one."
      />
    );
  }

  return (
    <>
      <div className="dt-toolbar">
        <label className="dt-search">
          <Search size={15} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search assignments…" aria-label="Search assignments" />
        </label>
        <div className="dt-chips" role="group" aria-label="Filter by skill">
          {["All", ...SKILLS].map((s) => (
            <button key={s} type="button" className={`dt-chip ${skill === s ? "on" : ""}`} aria-pressed={skill === s} onClick={() => setSkill(s)}>{s}</button>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="empty-inline">No assignment matches. <button className="dt-reset" onClick={() => { setQuery(""); setSkill("All"); }}>Show all</button></p>
      ) : (
        <div className="dt-wrap">
          <table className="dt">
            <thead>
              <tr>
                <th>Assignment</th>
                <th className="hide-sm">Time</th>
                <th>Due</th>
                <th className="hide-sm">Handed in</th>
                <th className="hide-sm">To mark</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => {
                const sk = skillOf(a.type);
                const Icon = (TYPES[a.type] || TYPES.Other).icon;
                const c = counts?.[a.id];
                const due = dueInfo(a.due_date, a.due_time);
                const total = studentsCount || 0;
                const pct = c && total ? Math.round((c.handed_in / total) * 100) : 0;
                return (
                  <tr key={a.id} className="dt-row" onClick={() => onOpen(a)}>
                    <td>
                      <div className="dt-title">
                        <span className={`type-ic ${icClass[sk]}`}><Icon size={17} /></span>
                        <span className="dt-title-text">
                          <button type="button" className="dt-open" onClick={(e) => { e.stopPropagation(); onOpen(a); }}>{a.title}</button>
                          <span className="dt-sub">{a.type}{c && total ? <span className="show-sm"> · {c.handed_in}/{total} {sk === "Speaking" ? "viewed" : "handed in"}</span> : null}</span>
                        </span>
                      </div>
                    </td>
                    <td className="hide-sm dt-nowrap">{a.time_limit_minutes ? `${a.time_limit_minutes} min` : "—"}</td>
                    <td>
                      {due.tone === "none" ? <span className="dt-muted">No due date</span>
                        : <span className={`pill ${due.tone === "danger" ? "pill-rose" : due.tone === "warn" ? "pill-amber" : "pill-plain"}`}>{due.label}</span>}
                    </td>
                    <td className="hide-sm">
                      {c ? (
                        <span className="dt-progress" title={sk === "Speaking" ? "Students who opened it" : "Students who handed it in"}>
                          <span className="dt-bar"><i style={{ width: `${pct}%` }} /></span>
                          {c.handed_in}/{total}{sk === "Speaking" ? " viewed" : ""}
                        </span>
                      ) : <span className="dt-muted">—</span>}
                    </td>
                    <td className="hide-sm">
                      {c?.to_mark ? <span className="pill pill-amber">{c.to_mark}</span> : <span className="dt-muted">—</span>}
                    </td>
                    <td className="dt-actions" onClick={(e) => e.stopPropagation()}>
                      <DropMenu label="⋯" className="btn-ghost btn-row" title={`Actions for ${a.title}`}>
                        <DropMenuItem icon={<ExternalLink size={16} />} title="Open" onClick={() => onOpen(a)} />
                        {c?.structured && (
                          <DropMenuItem icon={<Copy size={16} />} title="Duplicate to a class or an exam…" onClick={() => onDuplicate(a)} />
                        )}
                      </DropMenu>
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
