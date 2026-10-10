// Livraison 99 — moved out of StudentExamRunner.jsx without any change.
import { supabase } from "../../supabaseClient";

// ---------------------------------------------------------------------------
// Loading the paper for the exam. Always WITHOUT the answer key.
// Result: { status: "ok", assignment, sections } | { status: "refused" } | { status: "error" }
//   sections = [{ ...section, groups: [{ ...group, questions: [...] }] }]
// ---------------------------------------------------------------------------

// One call (get_paper, sql/30). It runs with the student's own rights: the
// answer is null exactly when the paper's own row is not readable — the row
// that carries the exam locks. null = refused, and then there is NO fallback.
// Only a real failure (network, server, function missing) falls back.
export async function loadExamPaper(assignmentId) {
  try {
    const { data, error } = await supabase.rpc("get_paper", { p_assignment_id: assignmentId, p_with_keys: false });
    if (!error) {
      if (data === null) return { status: "refused" };
      if (data && data.assignment && Array.isArray(data.sections)) {
        const sections = data.sections.map((s) => ({
          ...s,
          groups: (s.groups || []).map((g) => ({ ...g, questions: (g.questions || []).filter(Boolean) })),
        }));
        // Readable but no Part: it changed while loading. Not shown; Try again settles it.
        if (sections.length === 0) return { status: "error" };
        return { status: "ok", assignment: data.assignment, sections };
      }
      console.warn("get_paper returned an unexpected shape, falling back to step-by-step loading.");
    } else {
      console.warn("get_paper failed, falling back to step-by-step loading:", error.message);
    }
  } catch (e) {
    console.warn("get_paper failed, falling back to step-by-step loading:", e?.message || e);
  }
  return loadExamPaperStepByStep(assignmentId);
}

// Safety net: the loading this screen has always used, one query at a time.
// The paper's OWN row decides first. If it is not readable, we stop at once:
// the parts and questions are never read (their tables do not check the
// exam locks themselves). maybeSingle: no row = no error, so a refusal is
// never mistaken for a connection problem.
async function loadExamPaperStepByStep(assignmentId) {
  try {
    const { data: a, error: aError } = await supabase.from("assignments").select("*").eq("id", assignmentId).maybeSingle();
    if (aError) return { status: "error" };
    if (!a) return { status: "refused" };

    const { data: sectionRows, error: sError } = await supabase
      .from("exam_sections")
      .select("id, title, passage_title, passage_text, audio_url, max_plays, order_index")
      .eq("assignment_id", assignmentId)
      .order("order_index");
    if (sError || !sectionRows || sectionRows.length === 0) return { status: "error" };

    const sections = [];
    for (const s of sectionRows) {
      const { data: groupRows, error: gError } = await supabase
        .from("question_groups")
        .select("id, instruction, passage_text, image_url, order_index")
        .eq("section_id", s.id)
        .order("order_index");
      if (gError) return { status: "error" };

      const groups = [];
      for (const g of groupRows || []) {
        const { data: links, error: lError } = await supabase
          .from("assignment_questions")
          .select("order_index, questions(*)")
          .eq("group_id", g.id)
          .order("order_index");
        if (lError) return { status: "error" };
        groups.push({ ...g, questions: (links || []).map((l) => l.questions).filter(Boolean) });
      }
      sections.push({ ...s, groups });
    }
    return { status: "ok", assignment: a, sections };
  } catch {
    return { status: "error" };
  }
}
