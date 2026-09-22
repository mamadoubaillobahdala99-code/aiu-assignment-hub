import React, { useState, useEffect, useCallback } from "react";
import { ArrowLeft, FileText, Image as ImageIcon, Music, File, Download } from "lucide-react";
import { supabase } from "../../supabaseClient";
import { CenterSpinner, PageHeader } from "../../components/shared";
import { ReviewContent } from "./ReviewContent";
import { formatAnswerValue } from "./answerFormat";
import { numberQuestions } from "./bulkParse";
import { SPEAKING_PARTS, cleanDocuments, fmtSize } from "./speaking";

// The teacher reads a paper he has just built — passage, parts, questions,
// and the correct answer under each one.
//
// Until now the only screen that showed a paper's content needed a
// STUDENT'S COPY to open. Before the exam there is no student, so a
// teacher had no way at all to proofread what he had built. This screen
// fills that hole. It is read-only: no clock, no submit, nothing to save.
export function TeacherPaperPreview({ assignmentId, onBack }) {
  const [loading, setLoading] = useState(true);
  const [assignment, setAssignment] = useState(null);
  const [sections, setSections] = useState([]);
  const [correctByQ, setCorrectByQ] = useState({});
  const [writingTasks, setWritingTasks] = useState([]);
  const [speakingParts, setSpeakingParts] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: a } = await supabase
      .from("assignments")
      .select("id, title, type, time_limit_minutes, reading_test_type")
      .eq("id", assignmentId)
      .single();
    setAssignment(a || null);

    const { data: sectionRows } = await supabase
      .from("exam_sections")
      .select("id, title, passage_title, passage_text, instruction, audio_url, max_plays, image_url, task_number, speaking_part, documents, order_index")
      .eq("assignment_id", assignmentId)
      .order("order_index");
    const rows = sectionRows || [];

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
        const questions = (links || []).map((l) => l.questions).filter(Boolean);
        const { start: startNumber, end: endNumber, numbers: questionNumbers, nextStart } =
          numberQuestions(questions, globalCounter + 1);
        globalCounter = nextStart - 1;
        groups.push({ id: g.id, instruction: g.instruction, passageText: g.passage_text, imageUrl: g.image_url, questions, startNumber, endNumber, questionNumbers });
      }
      built.push({ id: s.id, title: s.title, passageTitle: s.passage_title, passageText: s.passage_text, audioUrl: s.audio_url, maxPlays: s.max_plays, groups });
    }
    setSections(built);

    const ids = built.flatMap((s) => s.groups.flatMap((g) => g.questions.map((q) => q.id)));
    if (ids.length > 0) {
      const { data: keys } = await supabase
        .from("question_answer_key")
        .select("question_id, correct_answer")
        .in("question_id", ids);
      const map = {};
      (keys || []).forEach((k) => { map[k.question_id] = k.correct_answer; });
      setCorrectByQ(map);
    }
    setLoading(false);
  }, [assignmentId]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <CenterSpinner />;
  if (!assignment) {
    return (
      <div className="page">
        <button className="back-link" onClick={onBack}><ArrowLeft size={14} /> Back</button>
        <p className="empty-inline">This paper no longer exists.</p>
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

  const header = (
    <>
      <button className="back-link" onClick={onBack}><ArrowLeft size={14} /> Back</button>
      <PageHeader eyebrow={`${assignment.type} — preview`} title={assignment.title} />
      <p className="muted-p" style={{ marginTop: -8 }}>
        What your students will sit, with the answer key. Nothing here is saved or timed.
        {assignment.time_limit_minutes ? ` Time limit: ${assignment.time_limit_minutes} minutes.` : ""}
      </p>
    </>
  );

  if (assignment.type === "Writing") {
    return (
      <div className="page page-wide">
        {header}
        {writingTasks.length === 0 ? (
          <p className="empty-inline">This paper has no task yet.</p>
        ) : writingTasks.map((t) => (
          <div key={t.id} className="qe-review-part">
            <h3 className="section-title">Task {t.taskNumber}{t.title ? ` — ${t.title}` : ""}</h3>
            {t.imageUrl && <img className="qe-sp-doc-img" src={t.imageUrl} alt={`Task ${t.taskNumber}`} />}
            <div className="qe-sp-questions">{t.prompt}</div>
          </div>
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
            <div key={p.id} className="qe-review-part">
              <h3 className="section-title">Speaking {meta.label} — {meta.title}</h3>
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
                      <a className="btn-ghost qe-sp-download" href={d.url} target="_blank" rel="noopener noreferrer">
                        <Download size={13} /> Open
                      </a>
                    </div>
                    {d.kind === "image" && <img className="qe-sp-doc-img" src={d.url} alt={d.name} />}
                  </div>
                );
              })}
            </div>
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
          <p className="muted-p" style={{ marginTop: 0 }}>
            {sections.length} part{sections.length > 1 ? "s" : ""} · {allQuestions.length} question
            {allQuestions.length > 1 ? "s" : ""} · {totalPoints} point{totalPoints > 1 ? "s" : ""}
          </p>
          {/* The answer key is fed in as if it were the answers, so every
              question shows its correct option filled in. answerKeyMode
              then labels it for what it is instead of marking a copy. */}
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
        </>
      )}
    </div>
  );
}
