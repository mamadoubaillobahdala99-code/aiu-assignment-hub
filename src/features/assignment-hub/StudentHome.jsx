import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Users, FileText, Search } from "lucide-react";
import { TYPES } from "../../lib/utils";
import { EmptyState, CenterSpinner, LoadFailed } from "../../components/shared";
import { loadStudentWork, rememberedStudentWork, isDone, sortTodo, sortDone, actionLabel, resultLabel } from "./studentWork";

// Livraison 71 — the student's full list of assignments ("My assignments"),
// in two parts: To do (most urgent first) and Done (newest first, with the
// result once the teacher has published it). The same two tables are used
// on a class page.

const SKILLS = ["Reading", "Listening", "Writing", "Speaking"];
const icClass = { Reading: "ic-reading", Listening: "ic-listening", Writing: "ic-writing", Speaking: "ic-speaking" };

export function TypeIcon({ it, size = 17 }) {
  const Icon = (TYPES[it.type] || TYPES.Other).icon;
  return <span className={`type-ic ${icClass[it.skill] || "ic-reading"}`}><Icon size={size} /></span>;
}

export function DuePill({ due }) {
  if (due.tone === "none") return <span className="dt-muted">No due date</span>;
  return <span className={`pill ${due.tone === "danger" ? "pill-rose" : due.tone === "warn" ? "pill-amber" : "pill-plain"}`}>{due.label}</span>;
}

function fmtDay(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export function TodoTable({ items, open, showClass = true }) {
  if (items.length === 0) return <p className="empty-inline">Nothing to do here — well done.</p>;
  return (
    <div className="dt-wrap">
      <table className="dt">
        <thead><tr><th>Assignment</th>{showClass && <th className="hide-sm">Class</th>}<th className="hide-sm">Time</th><th className="hide-sm">Due</th><th aria-label="Open" /></tr></thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.id} className="dt-row" onClick={() => open(it)}>
              <td>
                <div className="dt-title">
                  <TypeIcon it={it} />
                  <span className="dt-title-text">
                    <button type="button" className="dt-open" onClick={(e) => { e.stopPropagation(); open(it); }}>{it.title}</button>
                    <span className="dt-sub">{it.type}{showClass ? <span className="show-sm"> · {it.className}</span> : null}{it.status === "in-progress" ? " · started" : ""}{it.due.tone !== "none" && <span className={`show-sm due-${it.due.tone}`}> · {it.due.label}</span>}</span>
                  </span>
                </div>
              </td>
              {showClass && <td className="hide-sm">{it.className}</td>}
              <td className="hide-sm dt-nowrap">{it.time_limit_minutes && it.skill !== "Speaking" ? `${it.time_limit_minutes} min` : "—"}</td>
              <td className="hide-sm"><DuePill due={it.due} /></td>
              <td className="dt-actions" onClick={(e) => e.stopPropagation()}>
                <button type="button" className="btn-ghost btn-go" onClick={() => open(it)}>{actionLabel(it)} →</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DoneTable({ items, open, showClass = true }) {
  if (items.length === 0) return <p className="empty-inline">Nothing handed in yet.</p>;
  return (
    <div className="dt-wrap">
      <table className="dt">
        <thead><tr><th>Assignment</th>{showClass && <th className="hide-sm">Class</th>}<th className="hide-sm">{"Handed in"}</th><th>Result</th><th className="hide-sm" aria-label="Open" /></tr></thead>
        <tbody>
          {items.map((it) => {
            const r = resultLabel(it);
            return (
              <tr key={it.id} className="dt-row" onClick={() => open(it)}>
                <td>
                  <div className="dt-title">
                    <TypeIcon it={it} />
                    <span className="dt-title-text">
                      <button type="button" className="dt-open" onClick={(e) => { e.stopPropagation(); open(it); }}>{it.title}</button>
                      <span className="dt-sub">{it.type}{showClass ? <span className="show-sm"> · {it.className}</span> : null}</span>
                    </span>
                  </div>
                </td>
                {showClass && <td className="hide-sm">{it.className}</td>}
                <td className="hide-sm dt-muted dt-nowrap">{it.status === "viewed" ? `Opened ${fmtDay(it.doneAt)}` : fmtDay(it.doneAt)}</td>
                <td><span className={`pill ${r.tone === "teal" ? "pill-teal" : ""}`}>{r.text}</span></td>
                <td className="dt-actions hide-sm" onClick={(e) => e.stopPropagation()}>
                  <button type="button" className="btn-ghost btn-go" onClick={() => open(it)}>{it.status === "graded" ? "See →" : "Open →"}</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// Search box + one chip per skill, shared by the student lists.
export function useListFilter(items) {
  const [query, setQuery] = useState("");
  const [skill, setSkill] = useState("All");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (items || []).filter((it) => (skill === "All" || it.skill === skill) && (!q || String(it.title || "").toLowerCase().includes(q)));
  }, [items, query, skill]);
  const bar = (
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
  );
  return { filtered, bar, reset: () => { setQuery(""); setSkill("All"); }, active: query.trim() !== "" || skill !== "All" };
}

export function StudentAssignments({ userId, setScreen }) {
  // Livraison 82: what this page last read is shown at once, then refreshed.
  const [data, setData] = useState(() => rememberedStudentWork(userId));
  // Livraison 95c: a failed read says so (never « no class » / « Start » on a paper handed in).
  const [loadFailed, setLoadFailed] = useState(false);
  const load = useCallback(async () => {
    try { setData(await loadStudentWork(userId)); setLoadFailed(false); }
    catch { setLoadFailed(true); }
  }, [userId]);
  useEffect(() => { load(); }, [load]);
  const { filtered, bar, reset, active } = useListFilter(data?.items);

  if (loadFailed) return <div className="page page-wide"><LoadFailed what="your assignments" onRetry={() => { setLoadFailed(false); load(); }} /></div>;
  if (data === null) return <CenterSpinner />;
  const open = (it) => setScreen({ name: "assignment-student", classId: it.class_id, assignmentId: it.id });
  const todo = sortTodo(filtered.filter((it) => !isDone(it)));
  const done = sortDone(filtered.filter(isDone));
  const allTodo = data.items.filter((it) => !isDone(it));
  const dueToday = allTodo.filter((it) => it.due.tone === "danger").length;

  return (
    <div className="page page-wide">
      <div className="ph">
        <div className="ph-main">
          <div>
            <div className="eyebrow">Student</div>
            <h1 className="ph-title">My assignments</h1>
            {data.items.length > 0 && (
              <div className="ph-meta">
                {dueToday > 0 && <span className="pill pill-rose">{dueToday} due today or late</span>}
                <span className="pill">{allTodo.length} to do</span>
                <span className="pill pill-teal">{data.items.length - allTodo.length} done</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {data.classes.length === 0 ? (
        <EmptyState icon={<Users size={26} />} title="You haven't joined a class yet" body="Get a join code from your teacher, then use Join a class in the menu." />
      ) : data.items.length === 0 ? (
        <EmptyState icon={<FileText size={26} />} title="Nothing posted yet" body="Your teacher hasn't added any assignments to your class(es) yet." />
      ) : (
        <>
          {bar}
          {active && todo.length + done.length === 0 && (
            <p className="empty-inline">No assignment matches. <button className="dt-reset" onClick={reset}>Show all</button></p>
          )}
          <div className="sec-label">To do ({todo.length})</div>
          <TodoTable items={todo} open={open} />
          <div className="sec-label" style={{ marginTop: 26 }}>Done ({done.length})</div>
          <DoneTable items={done} open={open} />
        </>
      )}
    </div>
  );
}
