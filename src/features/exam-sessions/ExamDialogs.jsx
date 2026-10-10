// =====================================================================
// The exam page (teacher) — its windows: extra time, add a paper, rename,
// Excel export, duplicate, delete, close, open, invite a teacher.
// Livraison 98 — moved out of ExamSessionDetail.jsx without any change:
// the same markup, the same buttons, the same calls. ExamSessionDetail
// keeps every read, write and timer, and passes what is shown here in
// one object (v). These are plain functions called while the page
// renders (not components), so React sees exactly the same page.
// =====================================================================
import React from "react";
import { FileText, ShieldCheck, Headphones, Users, Trash2, Square, Play, UserPlus } from "lucide-react";
import { Modal } from "../../components/shared";
import { examRows } from "./examExport";
import { ExportResultsDialog } from "./ExportResultsDialog";

// Livraison 98 — the windows, in the same order as before.
export function renderDialogs(v) {
  const { act, addOpen, addStaff, attempts, build, busy, cellOf, closeAsk, delOpen, delTyped, doDelete, doDuplicate, doRename, dupOpen, exportOpen, extraFor, giveExtra, giving, manageBusy, openAsk, renaming, replayIds, roster, session, setAddOpen, setCloseAsk, setDelOpen, setDelTyped, setDupOpen, setExportOpen, setExtraFor, setOpenAsk, setRenaming, setStaffOpen, showToast, sorted, staff, staffOpen, teachers } = v;
  return (
    <>
      {extraFor && (() => {
        const t = attempts.find((a) => a.student_id === extraFor.st.id && a.assignment_id === extraFor.it.assignment_id);
        const lim = extraFor.it.assignment?.time_limit_minutes || 0;
        const end = t?.started_at ? new Date(t.started_at).getTime() + lim * 60000 : null;
        const first = sorted.filter((it) => it.assignment && it.assignment.type !== "Speaking").find((it) => it.room_started_at);
        const delay = first && extraFor.st.joined_at ? Math.round((new Date(extraFor.st.joined_at) - new Date(first.room_started_at)) / 60000) : 0;
        const fmt = (ms) => new Date(ms).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
        const choices = [...new Set([5, 10, 15, ...(delay > 0 && delay <= 60 ? [delay] : [])])].sort((a, b) => a - b);
        return (
          <Modal title={`Extra time for ${extraFor.st.name}`} onClose={() => setExtraFor(null)}>
            <p className="muted-p" style={{ marginTop: 0 }}>
              {extraFor.it.assignment?.type} · {extraFor.it.assignment?.title}
              {delay > 0 ? ` · arrived ${delay} min after the start` : ""}
            </p>
            <div className="dt-chips" role="group" aria-label="Minutes">
              {choices.map((m) => (
                <button key={m} type="button" className={`dt-chip ${extraFor.minutes === m ? "on" : ""}`} aria-pressed={extraFor.minutes === m}
                        onClick={() => setExtraFor({ ...extraFor, minutes: m })}>+ {m} min{m === delay ? " (delay)" : ""}</button>
              ))}
              <label className="exd-other">Other
                <input type="number" min="1" max="60" className="field-input" value={extraFor.minutes}
                       onChange={(e) => setExtraFor({ ...extraFor, minutes: Math.max(1, Math.min(60, Number(e.target.value) || 1)) })} />
              </label>
            </div>
            {end && (
              <div className="set exd-ends"><span>Ends for {extraFor.st.name}</span>
                <b>{fmt(end + extraFor.minutes * 60000)} instead of {fmt(end)}</b></div>
            )}
            <p className="field-hint">Only for this paper and this candidate. « Close the exam » still ends everything, extra time included.</p>
            <div className="ex-actions" style={{ marginTop: 16 }}>
              <button className="btn-ghost" onClick={() => setExtraFor(null)}>Cancel</button>
              <button className="btn-primary" disabled={giving} onClick={giveExtra}>
                {giving ? "Saving…" : `Give ${extraFor.minutes} minute${extraFor.minutes === 1 ? "" : "s"}`}
              </button>
            </div>
          </Modal>
        );
      })()}

      {addOpen && (
        <Modal title="Add a paper to this exam" onClose={() => setAddOpen(false)}>
          <p className="muted-p" style={{ marginTop: 0 }}>
            The paper is built inside this exam. It belongs to no class, so no student can
            find it before the day.
          </p>
          <div className="ex-build-list">
            <button className="ex-build" onClick={() => build("test-importer")}>
              <FileText size={17} />
              <span><strong>Import a test</strong><em>A Word or PDF file — the whole paper at once. Reading and Listening.</em></span>
            </button>
            <button className="ex-build" onClick={() => build("reading-builder")}>
              <ShieldCheck size={17} />
              <span><strong>Reading</strong><em>Build it question by question.</em></span>
            </button>
            <button className="ex-build" onClick={() => build("listening-builder")}>
              <Headphones size={17} />
              <span><strong>Listening</strong><em>With its recording.</em></span>
            </button>
            <button className="ex-build" onClick={() => build("writing-builder")}>
              <FileText size={17} />
              <span><strong>Writing</strong><em>Task 1 and Task 2.</em></span>
            </button>
            <button className="ex-build" onClick={() => build("speaking-builder")}>
              <Users size={17} />
              <span><strong>Speaking</strong><em>Topics and cue cards to consult.</em></span>
            </button>
          </div>
        </Modal>
      )}

      {renaming !== null && (
        <Modal title="Rename this exam" onClose={() => setRenaming(null)}>
          <label className="field-label">Name</label>
          <input className="field-input" value={renaming} autoFocus
                 onChange={(e) => setRenaming(e.target.value)}
                 onKeyDown={(e) => { if (e.key === "Enter" && renaming.trim()) doRename(); }} />
          <button className="btn-primary" style={{ marginTop: 16 }}
                  disabled={!renaming.trim() || manageBusy === "rename"} onClick={doRename}>
            {manageBusy === "rename" ? "Saving…" : "Save"}
          </button>
        </Modal>
      )}

      {exportOpen && (
        <ExportResultsDialog
          single={{ name: session.name, rows: examRows(sorted.filter((it) => it.assignment), roster, cellOf) }}
          onClose={() => setExportOpen(false)}
          showToast={showToast}
        />
      )}

      {dupOpen !== null && (
        <Modal title="Duplicate this exam" onClose={() => setDupOpen(null)}>
          <p className="muted-p" style={{ marginTop: 0 }}>
            The copy gets the same papers, in the same order, with their passages, questions
            and answer keys — and its own code. It starts closed, with nobody in it.
            The candidates, the copies and the results of this exam are not carried over,
            and neither is the opening window: that belongs to a particular day.
          </p>
          <label className="field-label">Name of the copy</label>
          <input className="field-input" value={dupOpen} autoFocus
                 onChange={(e) => setDupOpen(e.target.value)}
                 onKeyDown={(e) => { if (e.key === "Enter" && manageBusy !== "dup") doDuplicate(); }} />
          <button className="btn-primary" style={{ marginTop: 16 }} disabled={manageBusy === "dup"} onClick={doDuplicate}>
            {manageBusy === "dup" ? "Copying…" : "Duplicate"}
          </button>
        </Modal>
      )}

      {delOpen && (
        <Modal title="Delete this exam?" onClose={() => setDelOpen(false)}>
          {roster.length === 0 ? (
            <p className="muted-p" style={{ marginTop: 0 }}>
              Nobody has sat this exam. Its {sorted.length} paper{sorted.length === 1 ? "" : "s"} will be
              deleted with it. This cannot be undone.
            </p>
          ) : (
            <>
              <p className="muted-p" style={{ marginTop: 0 }}>
                <strong>{roster.length} candidate{roster.length > 1 ? "s have" : " has"} sat this exam.</strong>{" "}
                Deleting it removes their papers, their answers and their marks for good.
                Nothing can bring them back.
              </p>
              <label className="field-label">Type the name of the exam to confirm</label>
              <input className="field-input" value={delTyped} autoFocus placeholder={session.name}
                     onChange={(e) => setDelTyped(e.target.value)} />
            </>
          )}
          <div className="ex-actions" style={{ marginTop: 18 }}>
            <button className="btn-ghost" onClick={() => setDelOpen(false)}>Cancel</button>
            <button
              className="btn-primary ex-delete-confirm"
              disabled={manageBusy === "del" || (roster.length > 0 && delTyped.trim() !== session.name)}
              onClick={doDelete}
            >
              <Trash2 size={14} /> {manageBusy === "del" ? "Deleting…" : "Delete the exam"}
            </button>
          </div>
        </Modal>
      )}

      {closeAsk && closeAsk !== "counting" && (
        <Modal title="Close the exam?" onClose={() => setCloseAsk(null)}>
          {closeAsk.working === null ? (
            <p className="muted-p" style={{ marginTop: 0 }}>
              The number of candidates still writing could not be counted.{" "}
              <strong>Every paper still being written will be handed in now, as it is.</strong>{" "}
              This cannot be undone, even if you reopen the exam.
            </p>
          ) : closeAsk.working === 0 ? (
            <p className="muted-p" style={{ marginTop: 0 }}>
              <strong>Nobody is writing right now.</strong> Closing is safe: no candidate
              will be able to open a paper again.
            </p>
          ) : (
            <>
              <p className="muted-p" style={{ marginTop: 0 }}>
                <strong>
                  {closeAsk.working} candidate{closeAsk.working > 1 ? "s are" : " is"} still writing.
                </strong>{" "}
                <strong>Every paper still being written will be handed in now, as it is</strong>{" "}
                — pens down, like at the end of a real exam. Their screens will say so within
                a few seconds, and nobody will be able to open a new paper.
                This cannot be undone, even if you reopen the exam.
              </p>
              {closeAsk.names.length > 0 && (
                <div className="ex-people" style={{ marginTop: 4 }}>
                  {closeAsk.names.map((n) => (
                    <div key={n} className="ex-person">
                      <div className="avatar small">{n.slice(0, 1).toUpperCase()}</div>
                      <span>{n}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
          <div className="ex-actions" style={{ marginTop: 18 }}>
            <button className="btn-ghost" onClick={() => setCloseAsk(null)}>Cancel</button>
            <button className="btn-primary" disabled={busy === "close"} onClick={() => { setCloseAsk(null); act("close"); }}>
              <Square size={14} /> Close the exam
            </button>
          </div>
        </Modal>
      )}

      {openAsk && (
        <Modal title="Open the exam?" onClose={() => setOpenAsk(false)}>
          <p className="muted-p" style={{ marginTop: 0 }}>
            <strong>
              {sorted.filter((it) => replayIds.has(it.assignment_id)).map((it) => it.assignment?.title || "A Listening paper").join(", ")}
            </strong>{" "}
            {sorted.filter((it) => replayIds.has(it.assignment_id)).length > 1 ? "let" : "lets"} candidates pause and
            replay the recording, like a practice test. In the real IELTS the recording is heard once.
          </p>
          <p className="muted-p">
            To change it (one recording for the whole test): cancel, open the paper, choose{" "}
            <em>Edit assignment</em>, tick “Exam mode: one listening only” and use{" "}
            <em>Save title and settings only</em>.
          </p>
          <div className="ex-actions" style={{ marginTop: 18 }}>
            <button className="btn-ghost" onClick={() => setOpenAsk(false)}>Cancel</button>
            <button className="btn-primary" disabled={busy === "open"} onClick={() => { setOpenAsk(false); act("open"); }}>
              <Play size={15} /> Open anyway
            </button>
          </div>
        </Modal>
      )}

      {staffOpen && (
        <Modal title="Invite a teacher" onClose={() => setStaffOpen(false)}>
          <p className="muted-p" style={{ marginTop: 0 }}>
            An invited teacher can watch the exam, let a candidate back in, and mark the papers.
            Only you can delete the exam.
          </p>
          {teachers === null ? (
            <p className="empty-inline">Loading…</p>
          ) : teachers.filter((t) => !staff.some((s) => s.id === t.id)).length === 0 ? (
            <p className="empty-inline">
              Nobody else to invite — every teacher of this school is already on this exam.
            </p>
          ) : (
            <div className="ex-people" style={{ marginTop: 12 }}>
              {teachers.filter((t) => !staff.some((s) => s.id === t.id)).map((t) => (
                <button key={t.id} className="ex-person ex-person-pick" onClick={() => addStaff(t.id)}>
                  <div className="avatar small">{(t.name || "?").slice(0, 1).toUpperCase()}</div>
                  <span>{t.name}</span>
                  <UserPlus size={14} />
                </button>
              ))}
            </div>
          )}
        </Modal>
      )}
    </>
  );
}

