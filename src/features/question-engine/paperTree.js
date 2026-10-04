import { supabase } from "../../supabaseClient";

// Livraison 81 — a whole paper (parts → groups → questions, + the correct
// answers when asked) in ONE call: get_paper (sql/30). It runs with the
// caller's OWN rights (security invoker): exactly the rows the tables
// would give one by one, nothing more. It replaces the old loading "one
// request per part, then one per group" (13 waits in a row on a real
// Reading test), which made the result, marking and editing screens slow.
//
// Returns { status: "ok", assignment, sections, answerKeys }
//      or { status: "refused" }  (the paper cannot be read by this account)
//      or { status: "error" }    (could not be loaded at all)
// sections: [{ ...section row, groups: [{ ...group row, questions: [question rows] }] }]
// in the paper's order (order_index). Correct answers only when withKeys
// is true, and only those the database lets this account read.
//
// If get_paper itself fails, the same rows are read table by table — one
// request per LEVEL (3 waits), never one per part or per group.
export async function loadPaperTree(assignmentId, { withKeys = false } = {}) {
  try {
    const { data, error } = await supabase.rpc("get_paper", { p_assignment_id: assignmentId, p_with_keys: withKeys });
    if (!error) {
      if (data === null) return { status: "refused" };
      if (data && data.assignment && Array.isArray(data.sections)) {
        return {
          status: "ok",
          assignment: data.assignment,
          sections: data.sections.map((s) => ({
            ...s,
            groups: (s.groups || []).map((g) => ({ ...g, questions: (g.questions || []).filter(Boolean) })),
          })),
          answerKeys: withKeys ? (data.answer_keys || {}) : {},
        };
      }
    }
  } catch {
    // fall through to the table-by-table reading
  }
  return loadPaperTreeByLevel(assignmentId, withKeys);
}

const byOrder = (a, b) => ((a.order_index ?? 0) - (b.order_index ?? 0)) || String(a.id).localeCompare(String(b.id));

async function loadPaperTreeByLevel(assignmentId, withKeys) {
  try {
    const [{ data: a, error: aErr }, { data: secs, error: sErr }] = await Promise.all([
      supabase.from("assignments").select("*").eq("id", assignmentId).maybeSingle(),
      supabase.from("exam_sections").select("*").eq("assignment_id", assignmentId),
    ]);
    if (aErr || sErr) return { status: "error" };
    if (!a) return { status: "refused" };
    const sections = [...(secs || [])].sort(byOrder);
    const secIds = sections.map((s) => s.id);
    const { data: groups, error: gErr } = secIds.length
      ? await supabase.from("question_groups").select("*").in("section_id", secIds)
      : { data: [], error: null };
    if (gErr) return { status: "error" };
    const gIds = (groups || []).map((g) => g.id);
    const { data: links, error: lErr } = gIds.length
      ? await supabase.from("assignment_questions").select("group_id, order_index, question_id, questions(*)").in("group_id", gIds)
      : { data: [], error: null };
    if (lErr) return { status: "error" };
    const tree = sections.map((s) => ({
      ...s,
      groups: (groups || []).filter((g) => g.section_id === s.id).sort(byOrder).map((g) => ({
        ...g,
        questions: (links || [])
          .filter((l) => l.group_id === g.id && l.questions)
          .sort((x, y) => ((x.order_index ?? 0) - (y.order_index ?? 0)) || String(x.question_id).localeCompare(String(y.question_id)))
          .map((l) => l.questions),
      })),
    }));
    const answerKeys = {};
    if (withKeys) {
      const ids = tree.flatMap((s) => s.groups.flatMap((g) => g.questions.map((q) => q.id)));
      if (ids.length) {
        const { data: keys } = await supabase.from("question_answer_key").select("question_id, correct_answer").in("question_id", ids);
        (keys || []).forEach((k) => { answerKeys[k.question_id] = k.correct_answer; });
      }
    }
    return { status: "ok", assignment: a, sections: tree, answerKeys };
  } catch {
    return { status: "error" };
  }
}

// The shape the result and marking screens draw (livraison 74), with the
// paper's question numbers (a "choose TWO" question takes two numbers).
// Same fields and same numbering as their old step-by-step loading.
export function toReviewSections(sections, numberQuestions) {
  let counter = 0;
  return sections.map((s) => ({
    id: s.id, title: s.title, passageTitle: s.passage_title, passageText: s.passage_text, audioUrl: s.audio_url, maxPlays: s.max_plays,
    groups: s.groups.map((g) => {
      const questions = g.questions;
      const { start: startNumber, end: endNumber, numbers: questionNumbers, nextStart } = numberQuestions(questions, counter + 1);
      counter = nextStart - 1;
      return { id: g.id, instruction: g.instruction, passageText: g.passage_text, imageUrl: g.image_url, questions, startNumber, endNumber, questionNumbers };
    }),
  }));
}
