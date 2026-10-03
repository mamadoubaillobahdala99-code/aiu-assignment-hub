import React, { useState, useEffect, useCallback } from "react";
import { Plus, ShieldCheck, Search } from "lucide-react";
import { supabase } from "../../supabaseClient";
import { EmptyState, CenterSpinner, Modal } from "../../components/shared";
import { loadExamsList, skillLetter, examStage } from "./examWork";

// An exam session chains several papers in one sitting, behind its own
// code. It is not a class: it owns a private container the students
// never see as a class, so its papers cannot show up in anyone's
// assignment list before the day.
//
// Livraison 78: the list as a table, with four figures (open now, coming
// up, Writing copies to mark, results published), tabs and a search.
// Creating an exam is unchanged (create_exam_session).
const TABS = [["all", "All"], ["open", "Open"], ["coming", "Coming up"], ["finished", "Finished"]];

export function ExamSessionsHome({ userId, setScreen, showToast }) {
  const [data, setData] = useState(null);
  const [tab, setTab] = useState("all");
  const [query, setQuery] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setData(await loadExamsList());
  }, [userId]);   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  async function create() {
    if (!name.trim()) return;
    setErr(""); setBusy(true);
    const { data: d, error } = await supabase.rpc("create_exam_session", { p_name: name.trim() });
    setBusy(false);
    if (error) {
      setErr(/Only a teacher/i.test(error.message || "") ? "Only a teacher can create an exam." : "Could not create this exam. Check your connection and try again.");
      return;
    }
    setShowCreate(false);
    setName("");
    showToast?.("Exam created");
    setScreen({ name: "exam-session", sessionId: d.session_id });
  }

  if (data === null) return <CenterSpinner />;
  const exams = data.exams;
  const now = Date.now();
  const open = exams.filter((e) => e.stage === 1);
  const coming = exams.filter((e) => e.stage === 0);
  const finished = exams.filter((e) => e.stage >= 2);
  const toMark = exams.reduce((s, e) => s + e.toMark, 0);
  const next = coming.filter((e) => e.opens_at && new Date(e.opens_at).getTime() > now)
    .sort((a, b) => new Date(a.opens_at) - new Date(b.opens_at))[0];
  const count = { all: exams.length, open: open.length, coming: coming.length, finished: finished.length };
  const q = query.trim().toLowerCase();
  const rows = (tab === "open" ? open : tab === "coming" ? coming : tab === "finished" ? finished : exams)
    .filter((e) => !q || e.name.toLowerCase().includes(q) || String(e.code || "").toLowerCase().includes(q));
  const go = (e) => setScreen({ name: "exam-session", sessionId: e.id });

  return (
    <div className="page page-dash">
      <div className="ph">
        <div className="ph-main">
          <div>
            <div className="eyebrow">Teacher</div>
            <h1 className="ph-title">Exams</h1>
            <div className="ph-sub">Several papers in one sitting, behind one code. The papers never appear in a class.</div>
          </div>
        </div>
        <div className="ph-actions">
          <button className="btn-teal" onClick={() => setShowCreate(true)}><Plus size={16} /> New exam</button>
        </div>
      </div>

      {exams.length === 0 ? (
        <EmptyState icon={<ShieldCheck size={26} />} title="No exam yet" body="Create one, build its papers inside it, then give the code to your students on the day." />
      ) : (
        <>
          <div className="stat-grid">
            <div className="stat"><div className="stat-l">Open now</div><div className="stat-v">{open.length}</div>
              <div className="stat-d">{open.length ? `${open.reduce((s, e) => s + e.candidates, 0)} candidate${open.reduce((s, e) => s + e.candidates, 0) === 1 ? "" : "s"}` : "no exam running"}</div></div>
            <div className="stat"><div className="stat-l">Coming up</div><div className="stat-v">{coming.length}</div>
              <div className="stat-d">{next ? `next: ${when(next.opens_at)}` : coming.length ? "opened with the button" : "nothing planned"}</div></div>
            <div className="stat"><div className="stat-l">To mark</div><div className="stat-v">{data.marksOk ? toMark : "—"}</div>
              <div className="stat-d">Writing cop{toMark === 1 ? "y" : "ies"}</div></div>
            <div className="stat"><div className="stat-l">Results published</div><div className="stat-v">{exams.filter((e) => e.stage === 3).length}</div>
              <div className="stat-d">exam{exams.filter((e) => e.stage === 3).length === 1 ? "" : "s"}</div></div>
          </div>

          <div className="dt-toolbar">
            <div className="dt-chips" role="group" aria-label="Show">
              {TABS.map(([k, l]) => (
                <button key={k} type="button" className={`dt-chip ${tab === k ? "on" : ""}`} aria-pressed={tab === k} onClick={() => setTab(k)}>{l} {count[k]}</button>
              ))}
            </div>
            <label className="dt-search" style={{ maxWidth: 320 }}>
              <Search size={15} />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search exams…" aria-label="Search exams" />
            </label>
          </div>

          {rows.length === 0 ? (
            <p className="empty-inline">No exam here. <button className="dt-reset" onClick={() => { setQuery(""); setTab("all"); }}>Show all</button></p>
          ) : (
            <div className="dt-wrap">
              <table className="dt exl">
                <thead>
                  <tr>
                    <th>Exam</th>
                    <th>Status</th>
                    <th className="hide-sm">When</th>
                    <th className="hide-sm">Papers</th>
                    <th className="hide-sm">Candidates</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((e) => (
                    <tr key={e.id} className="dt-row-click" onClick={() => go(e)}>
                      <td>
                        <button type="button" className="dt-open" onClick={(ev) => { ev.stopPropagation(); go(e); }}>{e.name}</button>
                        <span className="dt-sub ex-code-sm">{e.code}</span>
                      </td>
                      <td><ExamStateBadge session={e} toMark={e.toMark} /></td>
                      <td className="hide-sm dt-nowrap">{whenRange(e)}</td>
                      <td className="hide-sm dt-nowrap">{e.papers.length ? e.papers.map((p) => skillLetter(p.type)).join(" · ") : <span className="dt-muted">no paper</span>}</td>
                      <td className="hide-sm">{e.candidates || <span className="dt-muted">—</span>}</td>
                      <td style={{ textAlign: "right" }}>
                        <button type="button" className="btn-ghost btn-go" onClick={(ev) => { ev.stopPropagation(); go(e); }}>Open →</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {showCreate && (
        <Modal title="New exam" onClose={() => setShowCreate(false)}>
          <label className="field-label">Name</label>
          <input
            className="field-input"
            placeholder="e.g. IELTS Mock — October"
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && name.trim() && !busy) create(); }}
          />
          <p className="field-hint">You will add the papers, in order, on the next screen.</p>
          {err && <div className="field-error">{err}</div>}
          <button className="btn-primary" style={{ marginTop: 16 }} disabled={!name.trim() || busy} onClick={create}>
            {busy ? "Creating…" : "Create exam"}
          </button>
        </Modal>
      )}
    </div>
  );
}

function when(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const today = new Date();
  const same = d.toDateString() === today.toDateString();
  const t = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return same ? `today ${t}` : `${d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })} · ${t}`;
}
function day(iso) {
  return iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "";
}
function whenRange(e) {
  if (e.stage >= 2) return day(e.results_released_at && !e.closed_at ? e.results_released_at : e.closed_at || e.closes_at || e.opened_at || e.created_at);
  if (e.stage === 1) {
    const from = e.opened_at || e.opens_at;
    return `${when(from)}${e.closes_at ? ` → ${new Date(e.closes_at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}` : ""}`;
  }
  return e.opens_at ? when(e.opens_at) : <span className="dt-muted">opened with the button</span>;
}

// Used by this list, the exam page and the teacher's Dashboard.
export function ExamStateBadge({ session, toMark = 0 }) {
  const stage = examStage(session);
  if (stage === 3) return <span className="ex-badge ex-badge-done">Results published</span>;
  if (stage === 2) return <span className="ex-badge ex-badge-closed">Closed{toMark > 0 ? ` · ${toMark} to mark` : ""}</span>;
  if (stage === 1) return <span className="ex-badge ex-badge-live">● Open now</span>;
  return <span className="ex-badge ex-badge-draft">Not open</span>;
}
