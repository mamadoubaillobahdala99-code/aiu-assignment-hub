import React, { useState, useEffect, useCallback } from "react";
import { FileText, LogOut, GraduationCap } from "lucide-react";
import { supabase } from "../../supabaseClient";
import { EmptyState, CenterSpinner, LoadFailed } from "../../components/shared";
import { confirmDialog } from "../../lib/confirmDialog";
import { DropMenu, DropMenuItem, Breadcrumb } from "../../components/DropMenu";
import { loadStudentWork, rememberedStudentWork, forgetStudentWork, isDone, sortTodo, sortDone } from "./studentWork";
import { TodoTable, DoneTable } from "./StudentHome";

// Livraison 71 — a class, seen by a student: its teacher, what is left to
// do and what is done, with the same two tables as "My assignments".
// "Leave this class…" moves into the "•••" menu (it still asks first).
export function StudentClassDetail({ classId, userId, setScreen, showToast }) {
  // Livraison 82: what this page last read is shown at once, then refreshed.
  const [data, setData] = useState(() => rememberedStudentWork(userId, { classId }));
  const [tab, setTab] = useState("todo");
  const [leaving, setLeaving] = useState(false);

  // Livraison 95c: a failed read says so (never « no class » / « Start » on a paper handed in).
  const [loadFailed, setLoadFailed] = useState(false);
  const load = useCallback(async () => {
    try { setData(await loadStudentWork(userId, { classId })); setLoadFailed(false); }
    catch { setLoadFailed(true); }
  }, [classId, userId]);
  useEffect(() => { load(); }, [load]);

  const cls = data?.classes?.[0] || null;

  async function leaveClass() {
    if (!(await confirmDialog({ title: "Leave this class?", message: `Leave "${cls.name}"? You'll lose access to its assignments, and you'll need the class code to rejoin.`, confirmLabel: "Leave the class", danger: true }))) return;
    setLeaving(true);
    const { error } = await supabase.from("roster").delete().eq("class_id", classId).eq("student_id", userId);
    setLeaving(false);
    if (error) {
      showToast?.("Could not leave the class");
      return;
    }
    forgetStudentWork();   // livraison 82: no page shows this class again from memory
    showToast?.("You left the class");
    setScreen({ name: "student-classes" });
  }

  if (loadFailed) return <div className="page page-wide"><LoadFailed what="this class" onRetry={() => { setLoadFailed(false); load(); }} /></div>;
  if (data === null) return <CenterSpinner />;
  if (!cls) {
    // Not (or no longer) in this class — nothing to show.
    return (
      <div className="page page-wide">
        <Breadcrumb items={[{ label: "My classes", onClick: () => setScreen({ name: "student-classes" }) }, { label: "Class" }]} />
        <EmptyState icon={<FileText size={26} />} title="This class is not available" body="You are not in this class (any more)." />
      </div>
    );
  }

  const open = (it) => setScreen({ name: "assignment-student", classId, assignmentId: it.id });
  const todo = sortTodo(data.items.filter((it) => !isDone(it)));
  const done = sortDone(data.items.filter(isDone));

  return (
    <div className="page page-wide">
      <Breadcrumb items={[{ label: "My classes", onClick: () => setScreen({ name: "student-classes" }) }, { label: cls.name }]} />
      <div className="ph">
        <div className="ph-main">
          <div>
            <div className="eyebrow">Class</div>
            <h1 className="ph-title">{cls.name}</h1>
            <div className="ph-meta">
              <span className="pill"><GraduationCap size={14} /> {cls.teacher ? `Teacher: ${cls.teacher}` : "Teacher"}</span>
              <span className="pill">{data.items.length} assignment{data.items.length === 1 ? "" : "s"}</span>
              <span className="pill pill-teal">{done.length} done</span>
            </div>
          </div>
        </div>
        <div className="ph-actions">
          <DropMenu label="•••" className="btn-ghost btn-dots" title="More actions">
            <DropMenuItem icon={<LogOut size={16} />} title={leaving ? "Leaving…" : "Leave this class…"} danger disabled={leaving} onClick={leaveClass} />
          </DropMenu>
        </div>
      </div>

      {data.items.length === 0 ? (
        <EmptyState icon={<FileText size={26} />} title="Nothing posted yet" body="Your teacher hasn't added any assignments to this class yet." />
      ) : (
        <>
          <div className="tabs">
            <button className={`tab ${tab === "todo" ? "active" : ""}`} onClick={() => setTab("todo")}>To do ({todo.length})</button>
            <button className={`tab ${tab === "done" ? "active" : ""}`} onClick={() => setTab("done")}>Done ({done.length})</button>
          </div>
          {tab === "todo" ? <TodoTable items={todo} open={open} showClass={false} /> : <DoneTable items={done} open={open} showClass={false} />}
        </>
      )}
    </div>
  );
}
