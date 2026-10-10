// =====================================================================
// The exam page (teacher), after the exam — the results and their bands.
// Livraison 98 — moved out of ExamSessionDetail.jsx without any change:
// the same markup, the same buttons, the same calls. ExamSessionDetail
// keeps every read, write and timer, and passes what is shown here in
// one object (v). These are plain functions called while the page
// renders (not components), so React sees exactly the same page.
// =====================================================================
import React from "react";
import { CenterSpinner, LoadFailed } from "../../components/shared";
import { overallBand, average, fmtBand } from "./examWork";

// After the exam: results.
export function renderResultsTab(v) {
  const { cellOf, grid, gridFailed, loadGrid, openCopy, roster, session, setGridFailed, sorted } = v;
  const scoredPapers = sorted.filter((it) => ["Listening", "Reading", "Writing"].includes(it.assignment?.type));
  const overallOf = (st) => overallBand(sorted.filter((it) => it.assignment), (it) => cellOf(st.id, it));
  const overalls = roster.map(overallOf).filter((b) => b !== null);
  return roster.length === 0 ? (
    <p className="empty-inline">Nobody sat this exam.</p>
  ) : grid === null && gridFailed ? (
    <LoadFailed what="the results" onRetry={() => { setGridFailed(false); loadGrid(); }} />
  ) : grid === null ? <CenterSpinner /> : (
    <>
      <div className="stat-grid">
        <div className="stat"><div className="stat-l">Average overall</div><div className="stat-v">{fmtBand(average(overalls))}</div>
          <div className="stat-d">{overalls.length ? `band · ${overalls.length} complete of ${roster.length}` : "no complete result yet"}</div></div>
        {scoredPapers.slice(0, 3).map((it) => {
          const cells = roster.map((st) => cellOf(st.id, it)).filter(Boolean);
          const handed = cells.filter((c) => c.open).length;
          const isW = it.assignment.type === "Writing";
          const marked = cells.filter((c) => c.band !== null && c.band !== undefined && c.band !== "").length;
          return (
            <div key={it.id} className="stat">
              <div className="stat-l">{it.assignment.type}</div>
              <div className="stat-v">{fmtBand(average(cells.filter((c) => c.open).map((c) => c.band)))}</div>
              <div className="stat-d">{isW ? `${marked}/${handed} marked` : `average band · ${handed}/${roster.length} handed in`}</div>
            </div>
          );
        })}
      </div>
      <div className="dt-wrap exd-scroll">
        <table className="dt exd-matrix exd-cards">
          <thead>
            <tr>
              <th>Candidate</th>
              {sorted.map((it) => <th key={it.id} className="exd-c">{it.assignment?.type || "Paper"}</th>)}
              <th className="exd-c">Overall</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {roster.map((st) => {
              const o = overallOf(st);
              const firstToMark = sorted.find((it) => cellOf(st.id, it)?.status === "to-mark" && cellOf(st.id, it)?.band == null);
              const firstOpen = sorted.find((it) => it.assignment?.type !== "Speaking" && cellOf(st.id, it)?.open);
              return (
                <tr key={st.id}>
                  <td className="exd-name"><span className="exd-person"><span className="avatar small">{st.name.slice(0, 1).toUpperCase()}</span><b>{st.name}</b></span></td>
                  {sorted.map((it) => {
                    const c = cellOf(st.id, it);
                    const type = it.assignment?.type;
                    let body = <span className="dt-muted">—</span>;
                    if (type === "Speaking") body = c?.status === "viewed" ? "✓ viewed" : body;
                    else if (type === "Writing") {
                      if (c?.open && c.band != null && c.band !== "") {
                        body = <button type="button" className="dt-open" onClick={() => openCopy(st, it)}><b>{fmtBand(c.band)}</b>{!c.bandPublished && <span className="dt-sub" style={{ display: "block" }}>not published</span>}</button>;
                      } else if (c?.open) body = <button type="button" className="pill pill-amber pill-btn" onClick={() => openCopy(st, it)}>To mark</button>;
                      else if (c?.status === "in-progress") body = <span className="dt-muted">not handed in</span>;
                    } else if (c?.score) {
                      body = <button type="button" className="dt-open" onClick={() => openCopy(st, it)}>{c.score.earned}/{c.score.total ?? "?"} · <b>{fmtBand(c.band)}</b></button>;
                    } else if (c?.status === "in-progress") body = <span className="dt-muted">not handed in</span>;
                    return <td key={it.id} data-label={it.assignment?.type || "Paper"} className="exd-c">{body}</td>;
                  })}
                  <td data-label="Overall" className="exd-c"><b>{o === null ? "—" : o.toFixed(1)}</b></td>
                  <td className="exd-act" style={{ textAlign: "right" }}>
                    {firstToMark ? <button className="btn-ghost btn-go" onClick={() => openCopy(st, firstToMark)}>Mark →</button>
                      : firstOpen ? <button className="btn-ghost btn-go" onClick={() => openCopy(st, firstOpen)}>Open →</button> : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="panel-note" style={{ marginTop: 10 }}>
        Click a score to open that copy (the same correction screen as in a class). Bands: the teacher's band if given, otherwise the IELTS estimate.
        Overall = Listening, Reading and Writing, like IELTS: one band per skill (two papers of the same skill are averaged first),
        then their average, rounded to the nearest half band. It appears once every paper has a band.
        Speaking is not marked on the site: type it in the Excel file, where the overall follows.
        {session.results_released_at ? " The candidates can see their results." : " Nothing is visible to candidates before « Publish the results »."}
      </p>
    </>
  );
}

