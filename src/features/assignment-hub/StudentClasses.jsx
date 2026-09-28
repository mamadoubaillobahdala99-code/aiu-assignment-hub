import React, { useState, useEffect, useCallback } from "react";
import { Users, GraduationCap, Plus } from "lucide-react";
import { fmtDate } from "../../lib/utils";
import { EmptyState, CenterSpinner } from "../../components/shared";
import { loadStudentWork, isDone } from "./studentWork";

// Livraison 71 — the student's classes as cards: teacher, what is left to
// do, since when. A card opens the class; the last card joins a new one.
export function StudentClasses({ userId, setScreen }) {
  const [data, setData] = useState(null);
  const load = useCallback(async () => { setData(await loadStudentWork(userId)); }, [userId]);
  useEffect(() => { load(); }, [load]);

  if (data === null) return <CenterSpinner />;

  return (
    <div className="page page-wide">
      <div className="ph">
        <div className="ph-main"><div><div className="eyebrow">Student</div><h1 className="ph-title">My classes</h1></div></div>
        <div className="ph-actions">
          <button className="btn-teal" onClick={() => setScreen({ name: "join" })}><Plus size={16} /> Join a class</button>
        </div>
      </div>

      {data.classes.length === 0 ? (
        <EmptyState icon={<Users size={26} />} title="You haven't joined a class yet" body="Get a join code from your teacher, then use Join a class." />
      ) : (
        <div className="card-grid">
          {data.classes.map((c) => {
            const mine = data.items.filter((it) => it.class_id === c.id);
            const todo = mine.filter((it) => !isDone(it));
            const urgent = todo.filter((it) => it.due.tone === "danger").length;
            return (
              <button key={c.id} type="button" className="c-card" onClick={() => setScreen({ name: "student-class-detail", classId: c.id })}>
                <div className="c-card-name">{c.name}</div>
                <div className="c-card-line"><GraduationCap size={14} /> {c.teacher ? `Teacher: ${c.teacher}` : "Teacher"}</div>
                <div className="c-card-line">{mine.length} assignment{mine.length === 1 ? "" : "s"} · joined {fmtDate(c.joinedAt)}</div>
                <div className="c-card-foot">
                  {urgent > 0 ? <span className="pill pill-rose">{urgent} due today or late</span>
                    : todo.length > 0 ? <span className="pill pill-amber">{todo.length} to do</span>
                    : mine.length > 0 ? <span className="pill pill-teal">All done</span>
                    : <span className="pill">Nothing yet</span>}
                  <span className="c-card-open">Open →</span>
                </div>
              </button>
            );
          })}
          <button type="button" className="c-card c-card-new" onClick={() => setScreen({ name: "join" })}>
            <Plus size={18} /> Join a class
          </button>
        </div>
      )}
    </div>
  );
}
