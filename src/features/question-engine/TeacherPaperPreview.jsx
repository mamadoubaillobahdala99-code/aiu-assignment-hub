import React, { useState, useEffect, useCallback } from "react";
import { ArrowLeft, FileText, Image as ImageIcon, Music, File, Download, Pencil, Check } from "lucide-react";
import { supabase } from "../../supabaseClient";
import { CenterSpinner } from "../../components/shared";
import { Breadcrumb } from "../../components/DropMenu";
import { TYPES } from "../../lib/utils";
import { buildSheet } from "./ResultParts";
import { plainPrompt } from "../assignment-hub/assignmentWork";
import { ReviewContent } from "./ReviewContent";
import { formatAnswerValue } from "./answerFormat";
import { numberQuestions } from "./bulkParse";
import { SPEAKING_PARTS, cleanDocuments, fmtSize } from "./speaking";
import { StoredImg, StoredLink } from "../../lib/storageFiles";

// The teacher reads a paper he has just built — passage, parts, questions,
// and the correct answer under each one.
//
// Until now the only screen that showed a paper's content needed a
// STUDENT'S COPY to open. Before the exam there is no student, so a
// teacher had no way at all to proofread what he had built. This screen
// fills that hole. It is read-only: no clock, no submit, nothing to save.
export function TeacherPaperPreview({ assignmentId, onBack, crumbs, onEdit }) {
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("paper");   // Reading / Listening: "paper" | "key"
  const [assignment, setAssignment] = useState(null);
  const [sections, setSections] = useState([]);
  const [correctByQ, setCorrectByQ] = useState({});
  const [writingTasks, setWritingTasks] = useState([]);
  const [speakingParts, setSpeakingParts] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    // One call first (get_paper, script 30). If it fails for any reason —
    // the SQL not run yet, a network hiccup — the old step-by-step loading
    // below takes over, so the page never breaks because of the fast path.
    const paper = (await loadPaperInOneCall(assignmentId)) || (await loadPaperStepByStep(assignmentId));
    const a = paper.assignment;
    const rows = paper.sections;
    setAssignment(a || null);

    if (a?.type === "Writing") {
      setWritingTasks(
        rows.filter((s) => s.task_number).map((s) => ({
          id: s.id, taskNumber: s.task_number, title: s.title,
          prompt: s.passage_text || "", imageUrl: s.image_url || "",
        }))
      );
      setLoading(false);
      return;
    }

    if (a?.type === "Speaking") {
      setSpeakingParts(
        rows.filter((s) => s.speaking_part).map((s) => ({
          id: s.id, part: s.speaking_part, text: s.passage_text || "",
          documents: cleanDocuments(s.documents),
        }))
      );
      setLoading(false);
      return;
    }

    // Reading and Listening — the same shape ReviewContent already knows.
    const built = [];
    let globalCounter = 0;
    for (const s of rows) {
      const groups = [];
      for (const g of s.groups) {
        const questions = g.questions;
        const { start: startNumber, end: endNumber, numbers: questionNumbers, nextStart } =
          numberQuestions(questions, globalCounter + 1);
        globalCounter = nextStart - 1;
        groups.push({ id: g.id, instruction: g.instruction, passageText: g.passage_text, imageUrl: g.image_url, questions, startNumber, endNumber, questionNumbers });
      }
      built.push({ id: s.id, title: s.title, passageTitle: s.passage_title, passageText: s.passage_text, audioUrl: s.audio_url, maxPlays: s.max_plays, groups });
    }
    setSections(built);
    setCorrectByQ(paper.answerKeys);
    setLoading(false);
  }, [assignmentId]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <CenterSpinner />;
  if (!assignment) {
    return (
      <div className="page page-wide">
        {crumbs ? <Breadcrumb items={crumbs} /> : <button className="back-link" onClick={onBack}><ArrowLeft size={14} /> Back</button>}
        <p className="empty-inline">This paper no longer exists.</p>
        <button className="btn-ghost" onClick={onBack}><ArrowLeft size={14} /> Back to the assignment</button>
      </div>
    );
  }

  const allQuestions = sections.flatMap((s) => s.groups.flatMap((g) => g.questions));
  const totalPoints = allQuestions.reduce((sum, q) => sum + (q.points || 1), 0);
  const correctAnswersFormatted = {};
  const keyResults = {};
  for (const q of allQuestions) {
    if (correctByQ[q.id] !== undefined) {
      correctAnswersFormatted[q.id] = formatAnswerValue(q, correctByQ[q.id]);
      keyResults[q.id] = { isCorrect: true };
    }
  }
  const isRL = assignment.type !== "Writing" && assignment.type !== "Speaking";
  const sheet = isRL ? buildSheet(sections) : [];
  const noKey = sheet.filter((r) => correctByQ[r.q.id] === undefined).length;
  const typeKey = String(assignment.type || "").toLowerCase().startsWith("listening") ? "listening"
    : String(assignment.type || "").toLowerCase().startsWith("writing") ? "writing"
    : String(assignment.type || "").toLowerCase().startsWith("speaking") ? "speaking" : "reading";
  const meta = TYPES[assignment.type] || TYPES.Other;
  const Icon = meta.icon;
  const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
  const facts = assignment.type === "Writing"
    ? [plural(writingTasks.length, "task")]
    : assignment.type === "Speaking"
      ? [plural(speakingParts.length, "part")]
      : [plural(sections.length, "part"), plural(allQuestions.length, "question"), plural(totalPoints, "point")];
  if (assignment.time_limit_minutes) facts.push(`${assignment.time_limit_minutes} min`);

  // Livraison 77: the same header as the other teacher pages — breadcrumb,
  // title, Back and Edit — and, for Reading / Listening, two views: the
  // whole paper as the students see it, or the answer key in one table.
  const header = (
    <>
      {crumbs ? <Breadcrumb items={crumbs} /> : <button className="back-link" onClick={onBack}><ArrowLeft size={14} /> Back</button>}
      <div className="ph">
        <div className="ph-main">
          <span className={`ph-icon type-ic ic-${typeKey}`}><Icon size={21} /></span>
          <div>
            <div className="eyebrow">{assignment.type} · Preview</div>
            <h1 className="ph-title">{assignment.title}</h1>
            <div className="ph-sub">
              {isRL ? "What your students will sit, with the answer key." : "What your students will see."} Nothing here is saved or timed.
            </div>
            <div className="ph-meta">
              {facts.map((f) => <span key={f} className="pill">{f}</span>)}
              {isRL && sheet.length > 0 && (noKey > 0
                ? <span className="pill pill-rose">{plural(noKey, "question")} without a correct answer</span>
                : <span className="pill pill-teal"><Check size={13} /> Every question has its answer</span>)}
            </div>
          </div>
        </div>
        <div className="ph-actions">
          <button className="btn-ghost" onClick={onBack}><ArrowLeft size={15} /> Back</button>
          {onEdit && <button className="btn-ghost" onClick={onEdit}><Pencil size={15} /> Edit</button>}
        </div>
      </div>
    </>
  );

  if (assignment.type === "Writing") {
    return (
      <div className="page page-wide">
        {header}
        {writingTasks.length === 0 ? (
          <p className="empty-inline">This paper has no task yet.</p>
        ) : writingTasks.map((t) => (
          <section key={t.id} className="panel pv-part">
            <div className="panel-h"><h2>Writing Task {t.taskNumber}{t.title ? ` — ${t.title}` : ""}</h2></div>
            {t.imageUrl && <StoredImg className="qe-sp-doc-img" src={t.imageUrl} alt={`Task ${t.taskNumber}`} />}
            {t.prompt.trim() ? <div className="qe-sp-questions">{t.prompt}</div> : <p className="empty-inline">No question written for this task.</p>}
          </section>
        ))}
      </div>
    );
  }

  if (assignment.type === "Speaking") {
    const KIND_ICON = { pdf: FileText, image: ImageIcon, audio: Music, docx: File };
    return (
      <div className="page page-wide">
        {header}
        {speakingParts.length === 0 ? (
          <p className="empty-inline">This paper has no topic yet.</p>
        ) : speakingParts.map((p) => {
          const meta = SPEAKING_PARTS[p.part] || { label: `Part ${p.part}`, title: "" };
          return (
            <section key={p.id} className="panel pv-part">
              <div className="panel-h"><h2>Speaking {meta.label} — {meta.title}</h2></div>
              {p.text.trim() && (
                p.part === 2 ? <div className="qe-sp-cuecard">{p.text}</div> : <div className="qe-sp-questions">{p.text}</div>
              )}
              {p.documents.map((d) => {
                const Icon = KIND_ICON[d.kind] || File;
                return (
                  <div key={d.url} className="qe-sp-doc">
                    <div className="qe-sp-doc-head">
                      <Icon size={15} />
                      <span className="qe-sp-docname">{d.name}</span>
                      {d.size > 0 && <span className="qe-sp-docmeta">{fmtSize(d.size)}</span>}
                      <StoredLink className="btn-ghost qe-sp-download" href={d.url} target="_blank" rel="noopener noreferrer">
                        <Download size={13} /> Open
                      </StoredLink>
                    </div>
                    {d.kind === "image" && <StoredImg className="qe-sp-doc-img" src={d.url} alt={d.name} />}
                  </div>
                );
              })}
              {!p.text.trim() && p.documents.length === 0 && <p className="empty-inline">Nothing in this part yet.</p>}
            </section>
          );
        })}
      </div>
    );
  }

  return (
    <div className="page page-wide">
      {header}
      {allQuestions.length === 0 ? (
        <p className="empty-inline">This paper has no question yet.</p>
      ) : (
        <>
          <div className="dt-chips pv-views" role="group" aria-label="View">
            {[["paper", "Full paper"], ["key", "Answer key"]].map(([k, l]) => (
              <button key={k} type="button" className={`dt-chip ${view === k ? "on" : ""}`} aria-pressed={view === k} onClick={() => setView(k)}>{l}</button>
            ))}
          </div>
          {view === "key" ? (
            <div className="dt-wrap">
              <table className="dt pv-key">
                <thead>
                  <tr><th>#</th><th>Question</th><th>Correct answer</th></tr>
                </thead>
                <tbody>
                  {sheet.map((row, i) => {
                    const newPart = i === 0 || sheet[i - 1].part !== row.part;
                    const answer = correctAnswersFormatted[row.q.id];
                    return (
                      <React.Fragment key={row.q.id}>
                        {newPart && sections.length > 1 && <tr className="pv-part-row"><td colSpan={3}>{row.part || "Part"}</td></tr>}
                        <tr>
                          <td className="dt-nowrap"><b>{row.label}</b></td>
                          <td><span className="dt-q">{plainPrompt(row.q.prompt) || String(row.q.type || "").replace(/_/g, " ")}</span></td>
                          <td>{answer ? <b>{answer}</b> : <span className="pill pill-rose">No correct answer</span>}</td>
                        </tr>
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            /* The answer key is fed in as if it were the answers, so every
               question shows its correct option filled in. answerKeyMode
               then labels it for what it is instead of marking a copy. */
            <ReviewContent
              sections={sections}
              answersByQ={correctByQ}
              resultsByQ={keyResults}
              correctAnswersFormatted={correctAnswersFormatted}
              correctAnswersRaw={correctByQ}
              showCorrectAnswers
              answerKeyMode
              assignmentId={assignmentId}
            />
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loading a paper. Both functions return the same shape:
//   { assignment, sections: [{ ...section, groups: [{ ...group, questions: [...] }] }], answerKeys: { [questionId]: correctAnswer } }
// ---------------------------------------------------------------------------

// Fast path: the whole paper in one call (get_paper, script 30). The function
// runs with the teacher's own rights, so the database's RLS decides what comes
// back — exactly as with the step-by-step queries. Returns null when the call
// fails, so the caller can fall back.
async function loadPaperInOneCall(assignmentId) {
  try {
    const { data, error } = await supabase.rpc("get_paper", { p_assignment_id: assignmentId, p_with_keys: true });
    if (error) {
      console.warn("get_paper failed, falling back to step-by-step loading:", error.message);
      return null;
    }
    // null = the paper does not exist or this account cannot read it.
    if (data === null) return { assignment: null, sections: [], answerKeys: {} };
    if (!data || !Array.isArray(data.sections)) {
      console.warn("get_paper returned an unexpected shape, falling back to step-by-step loading.");
      return null;
    }
    return {
      assignment: data.assignment || null,
      sections: data.sections.map((s) => ({
        ...s,
        groups: (s.groups || []).map((g) => ({ ...g, questions: (g.questions || []).filter(Boolean) })),
      })),
      answerKeys: data.answer_keys || {},
    };
  } catch (e) {
    console.warn("get_paper failed, falling back to step-by-step loading:", e?.message || e);
    return null;
  }
}

// Safety net: the loading this screen has always used, one query at a time.
async function loadPaperStepByStep(assignmentId) {
  const { data: a } = await supabase
    .from("assignments")
    .select("id, title, type, time_limit_minutes, reading_test_type")
    .eq("id", assignmentId)
    .single();

  const { data: sectionRows } = await supabase
    .from("exam_sections")
    .select("id, title, passage_title, passage_text, instruction, audio_url, max_plays, image_url, task_number, speaking_part, documents, order_index")
    .eq("assignment_id", assignmentId)
    .order("order_index");
  const rows = sectionRows || [];

  // Writing and Speaking papers have no question groups to fetch.
  if (a?.type === "Writing" || a?.type === "Speaking") {
    return { assignment: a || null, sections: rows.map((s) => ({ ...s, groups: [] })), answerKeys: {} };
  }

  const sections = [];
  for (const s of rows) {
    const { data: groupRows } = await supabase
      .from("question_groups")
      .select("id, instruction, passage_text, image_url, order_index")
      .eq("section_id", s.id)
      .order("order_index");

    const groups = [];
    for (const g of groupRows || []) {
      const { data: links } = await supabase
        .from("assignment_questions")
        .select("order_index, questions(*)")
        .eq("group_id", g.id)
        .order("order_index");
      groups.push({ ...g, questions: (links || []).map((l) => l.questions).filter(Boolean) });
    }
    sections.push({ ...s, groups });
  }

  const answerKeys = {};
  const ids = sections.flatMap((s) => s.groups.flatMap((g) => g.questions.map((q) => q.id)));
  if (ids.length > 0) {
    const { data: keys } = await supabase
      .from("question_answer_key")
      .select("question_id, correct_answer")
      .in("question_id", ids);
    (keys || []).forEach((k) => { answerKeys[k.question_id] = k.correct_answer; });
  }
  return { assignment: a || null, sections, answerKeys };
}
