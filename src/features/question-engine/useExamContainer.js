import { useState, useEffect } from "react";
import { supabase } from "../../supabaseClient";

// true when the paper is being built inside an exam (its class is an
// exam's private container), false inside an ordinary class, null while
// we don't know yet.
export function useIsExamContainer(classId) {
  const [inExam, setInExam] = useState(null);
  useEffect(() => {
    if (!classId) {
      setInExam(false);
      return;
    }
    let alive = true;
    (async () => {
      const { data } = await supabase.from("classes").select("kind").eq("id", classId).maybeSingle();
      if (alive) setInExam(data?.kind === "exam");
    })();
    return () => {
      alive = false;
    };
  }, [classId]);
  return inExam;
}

// Number of questions currently stored in an assignment (0 on error).
export async function countStoredQuestions(assignmentId) {
  // Livraison 95d: a failed count throws — « 0 » would skip the
  // « Replace the questions? » confirmation.
  const { data: sections, error: sErr } = await supabase.from("exam_sections").select("id").eq("assignment_id", assignmentId);
  if (sErr) throw new Error("Could not load");
  const ids = (sections || []).map((s) => s.id);
  if (ids.length === 0) return 0;
  const { count, error } = await supabase.from("assignment_questions").select("question_id", { count: "exact", head: true }).in("section_id", ids);
  if (error) throw new Error("Could not load");
  return count || 0;
}
