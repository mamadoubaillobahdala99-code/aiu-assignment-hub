
import React, { useState, useEffect } from "react";
import { X, BookOpen, Headphones } from "lucide-react";
import { supabase } from "../../supabaseClient";
import { CenterSpinner } from "../../components/shared";
import { QuestionRenderer } from "./QuestionRenderer";

// Deliberately simple, step-by-step fetches (no deep nested embeds) —
// avoids the kind of ambiguous-relationship error PostgREST can throw
// on multi-level embeds, and matches the pattern already used
// elsewhere in this codebase (e.g. TeacherQuestionEngineReview).
export function QuestionBank({ teacherId, onClose }) {
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState([]); // [{ assignmentTitle, assignmentType, questions: [...] }]

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: questions } = await supabase
        .from("questions")
        .select("id, type, skill, prompt, options")
        .eq("teacher_id", teacherId)
        .order("created_at", { ascending: false });

      const qList = questions || [];
      if (qList.length === 0) {
        if (!cancelled) { setGroups([]); setLoading(false); }
        return;
      }
      const qIds = qList.map((q) => q.id);

      const { data: links } = await supabase.from("assignment_questions").select("question_id, section_id").in("question_id", qIds);
      const sectionIds = [...new Set((links || []).map((l) => l.section_id))];

      const { data: sections } = sectionIds.length
        ? await supabase.from("exam_sections").select("id, assignment_id").in("id", sectionIds)
        : { data: [] };
      const assignmentIdBySection = new Map((sections || []).map((s) => [s.id, s.assignment_id]));
      const assignmentIds = [...new Set((sections || []).map((s) => s.assignment_id))];

      const { data: assignmentsRows } = assignmentIds.length
        ? await supabase.from("assignments").select("id, title, type").in("id", assignmentIds)
        : { data: [] };
      const assignmentById = new Map((assignmentsRows || []).map((a) => [a.id, a]));

      const assignmentIdByQuestion = new Map();
      for (const l of links || []) {
        const assignmentId = assignmentIdBySection.get(l.section_id);
        if (assignmentId) assignmentIdByQuestion.set(l.question_id, assignmentId);
      }

      const byAssignment = new Map();
      for (const q of qList) {
        const assignmentId = assignmentIdByQuestion.get(q.id);
        const a = assignmentId ? assignmentById.get(assignmentId) : null;
        const key = a ? a.id : "unlinked";
        if (!byAssignment.has(key)) byAssignment.set(key, { assignmentTitle: a?.title || "Not yet part of a published assignment", assignmentType: a?.type || null, questions: [] });
        byAssignment.get(key).questions.push(q);
      }

      if (!cancelled) {
        setGroups([...byAssignment.values()]);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [teacherId]);

  return (
    <div className="qe-bank-overlay">
      <div className="qe-bank-topbar">
        <div className="qe-bank-title">Question bank — browse only</div>
        <button className="btn-ghost" onClick={onClose}><X size={14} /> Close</button>
      </div>

      <div className="qe-bank-body">
        <p className="field-hint" style={{ marginBottom: 18 }}>
          Every question you've created, for reference — Reading and Listening together. This is read-only: to reuse an idea, write a fresh question in the assignment you're building.
        </p>

        {loading ? (
          <CenterSpinner />
        ) : groups.length === 0 ? (
          <p className="empty-inline">No questions created yet.</p>
        ) : (
          groups.map((group, gi) => (
            <div key={gi} className="qe-bank-group">
              <h3 className="section-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {group.assignmentType === "Listening" ? <Headphones size={16} /> : <BookOpen size={16} />}
                {group.assignmentTitle}
              </h3>
              {group.questions.map((q) => (
                <div key={q.id} className="qe-bank-question">
                  {q.type === "gap_fill" ? (
                    <p className="qe-bank-gapfill-note">Gap-fill blank (part of a Notes / Table / Summary completion — shown in context there, not individually here)</p>
                  ) : (
                    <QuestionRenderer question={q} value={null} onChange={() => {}} disabled />
                  )}
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
