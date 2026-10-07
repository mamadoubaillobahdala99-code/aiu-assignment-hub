import React, { useState } from "react";
import { FileSpreadsheet } from "lucide-react";
import { Modal } from "../../components/shared";
import { buildResultsWorkbook, downloadBytes, safeFileName } from "./examExport";
import { loadExamForExport } from "./examWork";

// Livraison 91 — « Export to Excel »: the teacher chooses the two
// thresholds of the colours (Achieved / Approaching / Not achieved) and,
// from the Exams list, which exams go in the file (one sheet each, plus
// « All results »). Read only: nothing is written to the database.

const BANDS = Array.from({ length: 19 }, (_, i) => i / 2);   // 0, 0.5 … 9
const KEY = "aiu-export-thresholds";
function savedThresholds() {
  try {
    const v = JSON.parse(window.localStorage.getItem(KEY) || "null");
    if (v && BANDS.includes(v.achieved) && BANDS.includes(v.approaching) && v.approaching < v.achieved) return v;
  } catch { /* storage unavailable */ }
  return { achieved: 6.5, approaching: 5.5 };
}
const stamp = () => new Date().toISOString().slice(0, 10);

// single: { name, rows } (the exam page has them already) — or
// exams: the Exams list (each one is read when the file is made).
export function ExportResultsDialog({ single, exams, onClose, showToast }) {
  const [th, setTh] = useState(savedThresholds);
  const choosable = (exams || []).filter((e) => e.candidates > 0);
  const [picked, setPicked] = useState(() => new Set(choosable.filter((e) => e.stage >= 2).map((e) => e.id)));
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const thErr = th.approaching >= th.achieved ? "« Approaching » must be lower than « Achieved »." : "";

  function toggle(id) {
    setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  async function make() {
    if (thErr) return;
    setErr("");
    try { window.localStorage.setItem(KEY, JSON.stringify(th)); } catch { /* fine */ }
    try {
      if (single) {
        downloadBytes(`${safeFileName(single.name)} - results.xlsx`, buildResultsWorkbook([single], th));
        showToast?.("Results exported (Excel)");
        onClose();
        return;
      }
      // Oldest first, as they were sat.
      const chosen = choosable.filter((e) => picked.has(e.id))
        .sort((a, b) => new Date(a.opened_at || a.opens_at || a.created_at) - new Date(b.opened_at || b.opens_at || b.created_at));
      const done = [];
      for (let i = 0; i < chosen.length; i++) {
        setBusy(`Reading ${chosen[i].name} (${i + 1} of ${chosen.length})…`);
        done.push(await loadExamForExport(chosen[i]));
      }
      setBusy("Making the file…");
      const file = chosen.length === 1 ? `${safeFileName(chosen[0].name)} - results.xlsx` : `Exam results ${stamp()}.xlsx`;
      downloadBytes(file, buildResultsWorkbook(done, th));
      showToast?.(chosen.length === 1 ? "Results exported (Excel)" : `${chosen.length} exams exported (Excel)`);
      onClose();
    } catch {
      setErr("The file could not be made. Check your connection and try again.");
    } finally {
      setBusy("");
    }
  }

  const bandSelect = (key, label) => (
    <label className="xr-th">
      <span className={`xr-key xr-key-${key}`}>{label}</span>
      <span className="xr-from">from band</span>
      <select className="field-input xr-select" value={th[key]} aria-label={`${label}: from band`}
              onChange={(e) => setTh((t) => ({ ...t, [key]: Number(e.target.value) }))}>
        {BANDS.map((b) => <option key={b} value={b}>{b.toFixed(1)}</option>)}
      </select>
    </label>
  );

  const count = single ? 1 : picked.size;
  return (
    <Modal title="Export the results to Excel" onClose={busy ? () => {} : onClose}>
      <p className="muted-p" style={{ marginTop: 0 }}>
        One line per candidate: Reading, Listening, Writing, an empty Speaking column to fill in, and the Average
        (rounded like IELTS). Programme and Group are left empty. The colours follow the bands — you can change
        the thresholds in the file too.
      </p>

      {!single && (
        <>
          <div className="field-label">Exams in the file</div>
          {choosable.length === 0 ? (
            <p className="empty-inline">No exam with candidates yet.</p>
          ) : (
            <div className="xr-list">
              {choosable.map((e) => (
                <label key={e.id} className="xr-item">
                  <input type="checkbox" checked={picked.has(e.id)} onChange={() => toggle(e.id)} disabled={Boolean(busy)} />
                  <span className="xr-name">{e.name}</span>
                  <span className="dt-sub">{e.candidates} candidate{e.candidates === 1 ? "" : "s"}{e.stage < 2 ? " · not closed yet" : ""}</span>
                </label>
              ))}
            </div>
          )}
          {picked.size > 1 && <p className="field-hint">A sheet « All results » (with the exam's name on each line), then one sheet per exam.</p>}
        </>
      )}

      <div className="field-label">Colours</div>
      <div className="xr-ths">
        {bandSelect("achieved", "Achieved")}
        {bandSelect("approaching", "Approaching")}
        <div className="xr-th"><span className="xr-key xr-key-not">Not achieved</span><span className="xr-from">below {th.approaching.toFixed(1)}</span></div>
      </div>
      {thErr && <div className="field-error">{thErr}</div>}
      {err && <div className="field-error">{err}</div>}
      {busy && <p className="field-hint">{busy}</p>}

      <button className="btn-primary" style={{ marginTop: 16 }} disabled={Boolean(busy) || Boolean(thErr) || count === 0} onClick={make}>
        <FileSpreadsheet size={15} /> {busy ? "Exporting…" : count > 1 ? `Download Excel (${count} exams)` : "Download Excel"}
      </button>
    </Modal>
  );
}
