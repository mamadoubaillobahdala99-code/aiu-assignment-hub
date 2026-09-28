import React, { useState, useEffect, useCallback } from "react";
import { Users, GraduationCap, Plus, ShieldCheck } from "lucide-react";
import { EmptyState, CenterSpinner } from "../../components/shared";
import { loadStudentWork, isDone, sortTodo, sortDone, actionLabel, resultLabel } from "./studentWork";
import { TypeIcon, DuePill } from "./StudentHome";

// Livraison 71 — the student's Home: what to do next, the figures that
// matter, the latest (published) results, progress per skill, the exam
// entry and the classes. Every block leads somewhere.

const SKILLS = ["Reading", "Listening", "Writing", "Speaking"];

function greeting(name) {
  const h = new Date().getHours();
  const first = String(name || "").trim().split(/\s+/)[0] || "";
  return `${h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"}${first ? `, ${first}` : ""}`;
}
function pct(r) {
  return r?.kind === "score" && r.total ? Math.round((r.earned / r.total) * 100) : null;
}

export function StudentDashboard({ userId, profile, setScreen }) {
  const [data, setData] = useState(null);
  const load = useCallback(async () => { setData(await loadStudentWork(userId)); }, [userId]);
  useEffect(() => { load(); }, [load]);

  if (data === null) return <CenterSpinner />;
  const open = (it) => setScreen({ name: "assignment-student", classId: it.class_id, assignmentId: it.id });
  const today = new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });

  const todo = sortTodo(data.items.filter((it) => !isDone(it)));
  const done = sortDone(data.items.filter(isDone));
  const next = todo[0] || null;
  const now = new Date();
  const dueWeek = todo.filter((it) => it.due.end && it.due.end >= now && it.due.days <= 7).length;
  const urgent = todo.filter((it) => it.due.tone === "danger").length;
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const doneMonth = done.filter((it) => it.doneAt && new Date(it.doneAt) >= monthStart).length;
  const lastBand = done.find((it) => it.skill === "Writing" && it.result?.kind === "band");
  const results = done.filter((it) => it.status !== "viewed").slice(0, 5);
  // Progress: the latest published result per skill, and the last five
  // Reading/Listening scores as bars (percent of the paper's points).
  const lastBySkill = Object.fromEntries(SKILLS.map((s) => [s, done.find((it) => it.skill === s && it.result)]));
  const barSkill = ["Reading", "Listening"].find((s) => done.some((it) => it.skill === s && pct(it.result) !== null)) || "Reading";
  const bars = done.filter((it) => it.skill === barSkill && pct(it.result) !== null).slice(0, 5).reverse();

  return (
    <div className="page page-dash">
      <div className="ph">
        <div className="ph-main">
          <div>
            <div className="eyebrow">Home</div>
            <h1 className="ph-title">{greeting(profile?.name)}</h1>
            <div className="ph-sub">{today} · {data.classes.length} class{data.classes.length === 1 ? "" : "es"}</div>
          </div>
        </div>
      </div>

      {data.classes.length === 0 ? (
        <EmptyState icon={<Users size={26} />} title="You haven't joined a class yet" body="Get a join code from your teacher, then use Join a class." />
      ) : (
        <>
          {next ? (
            <div className="next-up">
              <TypeIcon it={next} size={20} />
              <div className="next-up-main">
                <div className="next-up-k">Next up</div>
                <button type="button" className="next-up-title" onClick={() => open(next)}>{next.title}</button>
                <div className="next-up-meta">
                  {next.className}{next.time_limit_minutes && next.skill !== "Speaking" ? ` · ${next.time_limit_minutes} min` : ""}
                  {next.due.tone !== "none" && <> · <span className={`next-up-due ${next.due.tone}`}>{next.due.label}</span></>}
                </div>
              </div>
              <button type="button" className="next-up-go" onClick={() => open(next)}>{actionLabel(next)} →</button>
            </div>
          ) : (
            <div className="next-up next-up-empty">
              <div className="next-up-main">
                <div className="next-up-k">Next up</div>
                <div className="next-up-title-static">Nothing to do right now — well done.</div>
              </div>
            </div>
          )}

          <div className="stat-grid">
            <div className="stat"><div className="stat-l">To do</div><div className="stat-v">{todo.length}</div><div className="stat-d">{urgent ? `${urgent} due today or late` : "nothing urgent"}</div></div>
            <div className="stat"><div className="stat-l">Due this week</div><div className="stat-v">{dueWeek}</div><div className="stat-d">assignment{dueWeek === 1 ? "" : "s"}</div></div>
            <div className="stat"><div className="stat-l">Done</div><div className="stat-v">{doneMonth}</div><div className="stat-d">this month</div></div>
            <div className="stat"><div className="stat-l">Latest Writing band</div><div className="stat-v">{lastBand ? lastBand.result.value : "—"}</div><div className="stat-d">{lastBand ? lastBand.title : "no published band yet"}</div></div>
          </div>

          <div className="dash-grid">
            <div>
              <section className="panel">
                <div className="panel-h"><h2>To do</h2><button className="panel-link" onClick={() => setScreen({ name: "student-assignments" })}>All my assignments →</button></div>
                {todo.length === 0 ? <p className="empty-inline">Nothing left to do.</p> : (
                  <div className="plist">
                    {todo.slice(0, 5).map((it) => (
                      <div key={it.id} className="prow">
                        <TypeIcon it={it} />
                        <div className="prow-main">
                          <button type="button" className="dt-open" onClick={() => open(it)}>{it.title}</button>
                          <span className="dt-sub">{it.className}{it.time_limit_minutes && it.skill !== "Speaking" ? ` · ${it.time_limit_minutes} min` : ""}{it.due.tone !== "none" && <span className={`show-sm due-${it.due.tone}`}> · {it.due.label}</span>}</span>
                        </div>
                        <span className="hide-sm"><DuePill due={it.due} /></span>
                        <button type="button" className="btn-ghost btn-go" onClick={() => open(it)}>{actionLabel(it)} →</button>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="panel">
                <div className="panel-h"><h2>My latest results</h2><button className="panel-link" onClick={() => setScreen({ name: "student-assignments" })}>See all →</button></div>
                {results.length === 0 ? <p className="empty-inline">Your results appear here once your teacher publishes them.</p> : (
                  <div className="plist">
                    {results.map((it) => {
                      const r = resultLabel(it);
                      return (
                        <div key={it.id} className="prow">
                          <TypeIcon it={it} />
                          <div className="prow-main">
                            <button type="button" className="dt-open" onClick={() => open(it)}>{it.title}</button>
                            <span className="dt-sub">{it.type} · {it.className}</span>
                          </div>
                          <span className={`pill ${r.tone === "teal" ? "pill-teal" : ""}`}>{r.text}</span>
                          <button type="button" className="panel-link" onClick={() => open(it)}>{it.status === "graded" ? "See →" : "Open →"}</button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>

            <div>
              <section className="panel">
                <div className="panel-h"><h2>My progress</h2><span className="panel-note">latest result per skill</span></div>
                <div className="skill-grid">
                  {SKILLS.map((s) => {
                    const it = lastBySkill[s];
                    const r = it?.result;
                    const v = !r ? "—" : r.kind === "band" ? r.value : r.total ? `${Math.round(r.earned * 10) / 10}/${r.total}` : Math.round(r.earned * 10) / 10;
                    return (
                      <button key={s} type="button" className="skill-tile" disabled={!it} onClick={() => it && open(it)} title={it ? it.title : `No published ${s} result yet`}>
                        <b>{v}</b><span>{s}</span>
                      </button>
                    );
                  })}
                </div>
                {bars.length > 1 && (
                  <>
                    <div className="panel-note" style={{ marginTop: 12 }}>{barSkill}, last {bars.length} results</div>
                    <div className="mini-bars" aria-label={`${barSkill}, last ${bars.length} results`}>
                      {bars.map((it, i) => (
                        <button key={it.id} type="button" className={`mini-bar ${i === bars.length - 1 ? "last" : ""}`}
                                style={{ height: `${Math.max(8, pct(it.result))}%` }} title={`${it.title}: ${pct(it.result)}%`} onClick={() => open(it)} />
                      ))}
                    </div>
                  </>
                )}
              </section>

              <section className="panel">
                <div className="panel-h"><h2>Exam</h2></div>
                <p className="panel-text">Your teacher gives you a code on the day.</p>
                <button type="button" className="btn-teal" onClick={() => setScreen({ name: "student-exam" })}><ShieldCheck size={16} /> Enter an exam code →</button>
              </section>

              <section className="panel">
                <div className="panel-h"><h2>My classes</h2><button className="panel-link" onClick={() => setScreen({ name: "join" })}><Plus size={13} /> Join a class</button></div>
                <div className="plist">
                  {data.classes.map((c) => {
                    const all = data.items.filter((it) => it.class_id === c.id).length;
                    const left = data.items.filter((it) => it.class_id === c.id && !isDone(it)).length;
                    return (
                      <button key={c.id} type="button" className="mini-card" onClick={() => setScreen({ name: "student-class-detail", classId: c.id })}>
                        <span className="prow-main">
                          <b>{c.name}</b>
                          <span className="dt-sub"><GraduationCap size={12} /> {c.teacher ? `Teacher: ${c.teacher}` : "Teacher"}</span>
                        </span>
                        <span className={`pill ${left ? "pill-amber" : all ? "pill-teal" : ""}`}>{left ? `${left} to do` : all ? "All done" : "Nothing yet"}</span>
                      </button>
                    );
                  })}
                </div>
              </section>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
