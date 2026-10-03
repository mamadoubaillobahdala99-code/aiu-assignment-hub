import React, { useState, useEffect } from "react";
import { ArrowLeft, Clock } from "lucide-react";
import { supabase } from "../../supabaseClient";
import { CenterSpinner } from "../../components/shared";
import { Breadcrumb } from "../../components/DropMenu";
import { WritingView } from "./WritingView";
import { fmtWhen } from "./ResultParts";

// Livraison 74 — what a student sees after handing a paper in, while the
// teacher has not published the result yet. Only the student's own rows
// are read (row security): their text, their hand-in time. No mark, no
// correct answer — those come with the publication.
// inExam: the paper belongs to an exam — "Back" returns to the exam.

function WaitShell({ title, type, at, inExam, setScreen, children, message }) {
  const back = () => setScreen(inExam ? { name: "home" } : { name: "student-assignments" });
  return (
    <div className="page page-wide rs-page">
      <Breadcrumb items={[{ label: inExam ? "Exam" : "My assignments", onClick: back }, { label: title || "Assignment" }]} />
      <div className="ph"><div className="ph-main"><div><div className="eyebrow">{type}</div><h1 className="ph-title">{title}</h1></div></div></div>
      <div className="rs-wait">
        <span className="rs-wait-ic"><Clock size={20} /></span>
        <div className="rs-wait-main">
          <b>{at ? `Handed in on ${fmtWhen(at)}` : "Handed in"}</b>
          <span>{message}</span>
        </div>
        <span className="pill pill-amber">Waiting for the teacher</span>
      </div>
      {children}
      <div className="rs-foot">
        <button className="back-link" onClick={back}><ArrowLeft size={14} /> {inExam ? "Back to the exam" : "Back to my assignments"}</button>
      </div>
    </div>
  );
}

export function WritingWaiting({ assignmentId, userId, setScreen, inExam = false }) {
  const [data, setData] = useState(null);
  const [active, setActive] = useState(0);
  useEffect(() => {
    let off = false;
    (async () => {
      const [{ data: a }, { data: secs }, { data: wr }] = await Promise.all([
        supabase.from("assignments").select("title, type").eq("id", assignmentId).maybeSingle(),
        supabase.from("exam_sections").select("id, task_number, order_index").eq("assignment_id", assignmentId).order("order_index"),
        supabase.from("writing_responses").select("section_id, content_html, word_count, submitted_at").eq("assignment_id", assignmentId).eq("student_id", userId),
      ]);
      if (off) return;
      const tasks = (secs || []).filter((s) => s.task_number);
      const byS = new Map((wr || []).map((r) => [r.section_id, r]));
      const at = (wr || []).reduce((m, r) => (r.submitted_at && (!m || new Date(r.submitted_at) > new Date(m)) ? r.submitted_at : m), null);
      setData({ title: a?.title || "Writing", tasks, byS, at });
    })();
    return () => { off = true; };
  }, [assignmentId, userId]);

  if (!data) return <CenterSpinner />;
  const task = data.tasks[Math.min(active, Math.max(0, data.tasks.length - 1))];
  const resp = task ? data.byS.get(task.id) : null;
  return (
    <WaitShell title={data.title} type="Writing" at={data.at} inExam={inExam} setScreen={setScreen}
               message="Your teacher is marking it. Your band, the corrections and the comments will appear here once they are published.">
      {data.tasks.length > 1 && (
        <div className="qe-wrv-tabs qe-wrf-tabs">
          {data.tasks.map((t, i) => (
            <button key={t.id} className={`qe-wrv-tab ${i === active ? "active" : ""}`} onClick={() => setActive(i)}>
              Writing Task {t.task_number}
              <span className="qe-wrv-tab-meta">{data.byS.get(t.id)?.word_count || 0} words</span>
            </button>
          ))}
        </div>
      )}
      {task && (
        <>
          <div className="qe-wrv-original">
            <WritingView html={resp?.content_html} emptyText="You left this task empty." />
          </div>
          <div className="sub-meta" style={{ marginTop: 8 }}>Your text as you handed it in (read only) · {resp?.word_count || 0} words</div>
        </>
      )}
    </WaitShell>
  );
}

export function PaperWaiting({ assignmentId, userId, setScreen, inExam = false }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    let off = false;
    (async () => {
      const [{ data: a }, { data: att }] = await Promise.all([
        supabase.from("assignments").select("title, type").eq("id", assignmentId).maybeSingle(),
        supabase.from("exam_attempts").select("submitted_at").eq("assignment_id", assignmentId).eq("student_id", userId).maybeSingle(),
      ]);
      if (!off) setData({ title: a?.title || "Assignment", type: a?.type || "", at: att?.submitted_at || null });
    })();
    return () => { off = true; };
  }, [assignmentId, userId]);

  if (!data) return <CenterSpinner />;
  return (
    <WaitShell title={data.title} type={data.type} at={data.at} inExam={inExam} setScreen={setScreen}
               message="Your answers are saved. Your score and your answers will appear here once your teacher publishes the results." />
  );
}
