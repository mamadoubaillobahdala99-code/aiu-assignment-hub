import React, { useState, useEffect, useCallback } from "react";
import { BookOpen, Plus, PenLine } from "lucide-react";
import { EmptyState, CenterSpinner, LoadFailed } from "../../components/shared";
import { loadTeacherWork, loadTeacherExams, ago } from "./teacherWork";
import { CreateClassModal } from "./TeacherHome";
import { TypeIcon, DuePill } from "./StudentHome";
import { ExamStateBadge } from "../exam-sessions/ExamSessionsHome";

// Livraison 72 — the teacher's Dashboard: what to mark first, what is due,
// the exams, the classes and what happened lately. Every line opens the
// page where the work is done.

function greeting(name) {
  const h = new Date().getHours();
  const first = String(name || "").trim().split(/\s+/)[0] || "";
  return `${h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"}${first ? `, ${first}` : ""}`;
}
const n = (v) => (v === null || v === undefined ? "—" : v);

// Open now first, then not open yet, then closed; published ones are done.
function examRank(s) {
  if (s.closed_at) return 2;
  const scheduled = s.opens_at && new Date(s.opens_at) <= new Date();
  return s.opened_at || scheduled ? 0 : 1;
}

export function TeacherDashboard({ userId, profile, setScreen, showToast }) {
  const [data, setData] = useState(null);
  const [exams, setExams] = useState(null);
  const [showCreate, setShowCreate] = useState(false);

  // Livraison 95d: a failed read is never « No classes yet » / « No exam ».
  const [loadFailed, setLoadFailed] = useState(false);
  const load = useCallback(async () => {
    try {
      const [w, e] = await Promise.all([loadTeacherWork(userId), loadTeacherExams()]);
      setData(w);
      setExams(e);
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    }
  }, [userId]);
  useEffect(() => { load(); }, [load]);

  if (loadFailed) return <div className="page page-wide"><LoadFailed what="your dashboard" onRetry={() => { setLoadFailed(false); load(); }} /></div>;
  if (data === null) return <CenterSpinner />;
  const openA = (a) => setScreen({ name: "assignment-teacher", classId: a.class_id, assignmentId: a.id });
  const openC = (id) => setScreen({ name: "class", classId: id });
  const now = new Date();
  const today = now.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });

  const toMark = data.assignments.filter((a) => a.toMark > 0)
    .sort((x, y) => new Date(x.oldest || now) - new Date(y.oldest || now));
  const toMarkTotal = data.ok ? data.classes.reduce((s, c) => s + (c.toMark || 0), 0) : null;
  const upcoming = data.assignments.filter((a) => a.due.end && a.due.end >= now)
    .sort((x, y) => x.due.end - y.due.end);
  const dueWeek = upcoming.filter((a) => a.due.days <= 7).length;
  const aById = new Map(data.assignments.map((a) => [a.id, a]));
  const cById = new Map(data.classes.map((c) => [c.id, c]));
  const liveExams = (exams || []).filter((s) => !s.results_released_at).sort((x, y) => examRank(x) - examRank(y)).slice(0, 3);
  const examsThisWeek = (exams || []).filter((s) => !s.closed_at && s.opens_at && (new Date(s.opens_at) - now) < 7 * 86400000 && new Date(s.opens_at) >= new Date(now.getFullYear(), now.getMonth(), now.getDate())).length;

  return (
    <div className="page page-dash">
      <div className="ph">
        <div className="ph-main">
          <div>
            <div className="eyebrow">Dashboard</div>
            <h1 className="ph-title">{greeting(profile?.name)}</h1>
            <div className="ph-sub">
              {today} · {data.classes.length} class{data.classes.length === 1 ? "" : "es"}
              {examsThisWeek > 0 && ` · ${examsThisWeek} exam${examsThisWeek === 1 ? "" : "s"} this week`}
            </div>
          </div>
        </div>
        <div className="ph-actions">
          <button className="btn-teal" onClick={() => setShowCreate(true)}><Plus size={16} /> New class</button>
        </div>
      </div>

      {data.classes.length === 0 ? (
        <EmptyState icon={<BookOpen size={26} />} title="No classes yet" body="Create a class with « New class », then share its join code with your students." />
      ) : (
        <>
          <div className="stat-grid">
            <div className="stat"><div className="stat-l">To mark</div><div className="stat-v">{n(toMarkTotal)}</div><div className="stat-d">{toMarkTotal ? `Writing cop${toMarkTotal === 1 ? "y" : "ies"} waiting` : "nothing waiting"}</div></div>
            <div className="stat"><div className="stat-l">Due this week</div><div className="stat-v">{dueWeek}</div><div className="stat-d">assignment{dueWeek === 1 ? "" : "s"}</div></div>
            <div className="stat"><div className="stat-l">Handed in · 7 days</div><div className="stat-v">{n(data.handedIn7d)}</div><div className="stat-d">copies received</div></div>
            <div className="stat"><div className="stat-l">Students</div><div className="stat-v">{n(data.students)}</div><div className="stat-d">in {data.classes.length} class{data.classes.length === 1 ? "" : "es"}</div></div>
          </div>

          <div className="dash-grid">
            <div>
              <section className="panel">
                <div className="panel-h"><h2>To mark</h2>{toMark.length > 0 && <span className="panel-note">oldest first</span>}</div>
                {!data.ok ? <p className="empty-inline">The figures could not be read. Open a class to see its copies.</p>
                  : toMark.length === 0 ? <p className="empty-inline">Nothing to mark — all Writing copies have their feedback published.</p> : (
                  <div className="plist">
                    {toMark.slice(0, 5).map((a) => (
                      <div key={a.id} className="prow">
                        <span className="type-ic ic-writing"><PenLine size={17} /></span>
                        <div className="prow-main">
                          <button type="button" className="dt-open" onClick={() => openA(a)}>{a.title}</button>
                          <span className="dt-sub">{a.className} · {a.toMark} cop{a.toMark === 1 ? "y" : "ies"} waiting{a.oldest ? ` · oldest ${ago(a.oldest, now)}` : ""}</span>
                        </div>
                        <button type="button" className="btn-ghost btn-go" onClick={() => openA(a)}>Mark →</button>
                      </div>
                    ))}
                    {toMark.length > 5 && <p className="panel-note" style={{ marginTop: 8 }}>+ {toMark.length - 5} more assignment{toMark.length - 5 === 1 ? "" : "s"} with copies waiting — see each class.</p>}
                  </div>
                )}
              </section>

              <section className="panel">
                <div className="panel-h"><h2>Upcoming deadlines</h2><button className="panel-link" onClick={() => setScreen({ name: "home" })}>All my classes →</button></div>
                {upcoming.length === 0 ? <p className="empty-inline">No upcoming due date.</p> : (
                  <div className="dt-wrap">
                    <table className="dt">
                      <thead><tr><th>Assignment</th><th className="hide-sm">Class</th><th>Due</th><th className="hide-sm">Handed in</th></tr></thead>
                      <tbody>
                        {upcoming.slice(0, 5).map((a) => (
                          <tr key={a.id} className="dt-row" onClick={() => openA(a)}>
                            <td>
                              <div className="dt-title">
                                <TypeIcon it={{ type: a.type, skill: String(a.type || "").startsWith("Writing") ? "Writing" : a.type }} />
                                <span className="dt-title-text">
                                  <button type="button" className="dt-open" onClick={(e) => { e.stopPropagation(); openA(a); }}>{a.title}</button>
                                  <span className="dt-sub show-sm">{a.className}{a.handedIn !== null && a.students ? ` · ${a.handedIn}/${a.students}` : ""}</span>
                                </span>
                              </div>
                            </td>
                            <td className="hide-sm">{a.className}</td>
                            <td><DuePill due={a.due} /></td>
                            <td className="hide-sm">
                              {a.handedIn === null ? <span className="dt-muted">—</span> : (
                                <span className="dt-progress" title={a.type === "Speaking" ? "Students who opened it" : "Students who handed it in"}>
                                  <span className="dt-bar"><i style={{ width: `${a.students ? Math.round((a.handedIn / a.students) * 100) : 0}%` }} /></span>
                                  {a.handedIn}/{a.students || 0}{a.type === "Speaking" ? " viewed" : ""}
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </div>

            <div>
              <section className="panel">
                <div className="panel-h"><h2>Exams</h2><button className="panel-link" onClick={() => setScreen({ name: "exams" })}>All exams →</button></div>
                {exams === null || liveExams.length === 0 ? <p className="empty-inline">No exam in progress or coming up.</p> : (
                  <div className="plist">
                    {liveExams.map((s) => (
                      <button key={s.id} type="button" className="mini-card" onClick={() => setScreen({ name: "exam-session", sessionId: s.id })}>
                        <ExamStateBadge session={s} />
                        <span className="prow-main">
                          <b>{s.name}</b>
                          <span className="dt-sub">{s.candidates} candidate{s.candidates === 1 ? "" : "s"}{s.opens_at && !s.opened_at && !s.closed_at ? ` · ${new Date(s.opens_at).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : ""}</span>
                        </span>
                        <span className="c-card-open">Open →</span>
                      </button>
                    ))}
                  </div>
                )}
              </section>

              <section className="panel">
                <div className="panel-h"><h2>My classes</h2><button className="panel-link" onClick={() => setScreen({ name: "home" })}>See all →</button></div>
                <div className="plist">
                  {data.classes.map((c) => (
                    <button key={c.id} type="button" className="mini-card" onClick={() => openC(c.id)}>
                      <span className="prow-main">
                        <b>{c.name}</b>
                        <span className="dt-sub">{n(c.students)} student{c.students === 1 ? "" : "s"}</span>
                      </span>
                      {c.toMark === null ? null : c.toMark > 0 ? <span className="pill pill-amber">{c.toMark} to mark</span> : <span className="c-card-quiet">Up to date</span>}
                      <span className="c-card-open">→</span>
                    </button>
                  ))}
                </div>
              </section>

              <section className="panel">
                <div className="panel-h"><h2>Recent activity</h2></div>
                {data.recent.length === 0 ? <p className="empty-inline">Nothing yet.</p> : (
                  <div className="plist">
                    {data.recent.map((e, i) => {
                      const a = e.assignment_id ? aById.get(e.assignment_id) : null;
                      const c = cById.get(e.class_id);
                      const go = () => (a ? openA(a) : openC(e.class_id));
                      const who = e.student_name || "A student";
                      return (
                        <button key={i} type="button" className="act-row" onClick={go}>
                          <span className="act-av" aria-hidden="true">{who.trim().charAt(0).toUpperCase()}</span>
                          <span className="prow-main">
                            <span className="act-text">{who} {e.kind === "joined" ? "joined" : "handed in"} <b>{e.kind === "joined" ? (c?.name || "a class") : (a?.title || "an assignment")}</b></span>
                            <span className="dt-sub">{ago(e.at, now)}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>
          </div>
        </>
      )}

      {showCreate && (
        <CreateClassModal userId={userId} showToast={showToast} onClose={() => setShowCreate(false)}
                          onCreated={() => { setShowCreate(false); load(); }} />
      )}
    </div>
  );
}
