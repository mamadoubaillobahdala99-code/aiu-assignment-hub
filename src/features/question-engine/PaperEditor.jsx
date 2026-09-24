import React, { useState, useEffect, useCallback, useMemo } from "react";
import { ArrowLeft, Lock, Plus, X, Copy, AlertTriangle, CheckCircle2, Trash2, Undo2 } from "lucide-react";
import { supabase } from "../../supabaseClient";
import { CenterSpinner } from "../../components/shared";
import { numberQuestions } from "./bulkParse";
import { AudioFilePicker } from "./AudioFilePicker";
import { GroupImagePicker } from "./GroupImage";

// Editing a Reading or Listening paper IN PLACE.
//
// The whole paper is shown as it exists — passages, instructions, the
// words of notes and tables, questions, choices and correct answers — and
// "Save changes" sends only what changed to save_paper_edits (sql/27),
// which keeps every question (so the students' answers stay) and checks
// everything again on the database side.
//
// What may change depends on the paper's situation (paper_edit_state):
//   level 1 — nobody has handed in:           everything below;
//   level 2 — copies handed in, no mark seen: wording + correct answers
//             (the copies are re-marked);
//   level 3 — a student has seen his mark:    wording only.
// The LAYOUT of what stays never changes: same choices and letters, same
// notes / table blocks, one "___" per question of its group.
// At level 1 only, questions and whole groups can also be removed. The
// recording and plays of each Part and the picture of each group can be
// changed at every level (they never change a mark).

const TFNG_LABELS = {
  true_false: { positive: "True", negative: "False", not_given: "Not Given" },
  yes_no: { positive: "Yes", negative: "No", not_given: "Not Given" },
};
const STRUCTURE_KEYS = new Set(["style", "type", "letter", "label_set", "kind"]);
const TYPE_LABELS = {
  gap_fill: "Gap",
  multiple_choice: "Multiple choice",
  multiple_selection: "Choose more than one",
  true_false_not_given: "True / False / Not Given",
  matching_features: "Matching",
  matching_information: "Matching (paragraphs)",
  matching_map_labelling: "Map / plan labelling",
};

export function countBlanks(text) {
  return (String(text || "").match(/_{3,}/g) || []).length;
}
const isJsonLayout = (t) => String(t || "").trimStart().startsWith("{");
const isPlaceholderPrompt = (p) => /^\s*(gap|blank)\s*\d+\s*$/i.test(String(p || ""));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Every editable text of a notes / table / form layout, in reading order.
function textLeaves(node, path = [], key = null, out = []) {
  if (Array.isArray(node)) node.forEach((v, i) => textLeaves(v, [...path, i], key, out));
  else if (node && typeof node === "object") Object.entries(node).forEach(([k, v]) => textLeaves(v, [...path, k], k, out));
  else if (typeof node === "string" && !STRUCTURE_KEYS.has(key)) out.push({ path, value: node });
  return out;
}
function setAtPath(node, path, value) {
  if (path.length === 0) return value;
  const [head, ...rest] = path;
  const copy = Array.isArray(node) ? [...node] : { ...node };
  copy[head] = setAtPath(node[head], rest, value);
  return copy;
}

// Matching groups show ONE box of options for all their questions.
function sharedChoices(questions) {
  if (questions.length === 0) return false;
  if (!questions.every((q) => q.type.startsWith("matching_"))) return false;
  const first = JSON.stringify(questions[0].options?.choices || []);
  return questions.every((q) => JSON.stringify(q.options?.choices || []) === first);
}

export function PaperEditor({ assignmentId, classId, teacherId, setScreen, showToast, returnTo }) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [assignment, setAssignment] = useState(null);
  const [state, setState] = useState(null); // { level, submitted, marks_seen, exam_live }
  const [structure, setStructure] = useState([]); // sections → groups → question ids
  const [orig, setOrig] = useState(null); // { sections, groups, questions } as stored
  const [draft, setDraft] = useState(null);
  // Removed on screen, deleted for real only by "Save changes" (level 1).
  const [removedGroups, setRemovedGroups] = useState(() => new Set());
  const [removedQuestions, setRemovedQuestions] = useState(() => new Set());
  const [settings, setSettings] = useState(null);
  const [origSettings, setOrigSettings] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [targets, setTargets] = useState([]);
  const [dupTarget, setDupTarget] = useState("");
  const [duplicating, setDuplicating] = useState(false);

  const back = useCallback(() => {
    setScreen({ name: "assignment-teacher", classId, assignmentId, returnTo });
  }, [setScreen, classId, assignmentId, returnTo]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    const { data: a, error: aErr } = await supabase.from("assignments").select("*").eq("id", assignmentId).single();
    if (aErr || !a) {
      setLoadError("This paper could not be opened.");
      setLoading(false);
      return;
    }
    const { data: st, error: stErr } = await supabase.rpc("paper_edit_state", { p_assignment_id: assignmentId });
    if (stErr || !st) {
      setLoadError("Only the teacher who owns this paper can edit it" + (stErr?.message ? ` (${stErr.message}).` : "."));
      setLoading(false);
      return;
    }

    const { data: sectionRows } = await supabase
      .from("exam_sections")
      .select("id, title, passage_title, passage_text, audio_url, max_plays, order_index")
      .eq("assignment_id", assignmentId)
      .order("order_index");

    const o = { sections: {}, groups: {}, questions: {} };
    const built = [];
    let counter = 0;
    for (const s of sectionRows || []) {
      o.sections[s.id] = { passage_title: s.passage_title || "", passage_text: s.passage_text || "", audio_url: s.audio_url || null, max_plays: s.max_plays == null ? "" : String(s.max_plays) };
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
        const qs = (links || []).map((l) => l.questions).filter(Boolean);
        const { numbers, end, nextStart } = numberQuestions(qs, counter + 1);
        counter = nextStart - 1;
        o.groups[g.id] = { instruction: g.instruction || "", passage_text: g.passage_text || "", image_url: g.image_url || null };
        qs.forEach((q) => {
          o.questions[q.id] = { type: q.type, prompt: q.prompt || "", options: q.options || {}, key: null };
        });
        groups.push({ id: g.id, imageUrl: g.image_url, questionIds: qs.map((q) => q.id), numbers, end });
      }
      built.push({ id: s.id, title: s.title, audioUrl: s.audio_url, maxPlays: s.max_plays, groups });
    }

    const ids = Object.keys(o.questions);
    if (ids.length > 0) {
      const { data: keys } = await supabase.from("question_answer_key").select("question_id, correct_answer").in("question_id", ids);
      (keys || []).forEach((k) => {
        if (o.questions[k.question_id]) o.questions[k.question_id].key = k.correct_answer;
      });
    }

    const s0 = {
      title: a.title || "",
      due_date: a.due_date || "",
      due_time: a.due_time || "",
      time_limit_minutes: a.time_limit_minutes ? String(a.time_limit_minutes) : "",
      auto_release_score: a.auto_release_score ?? true,
      show_answer_review: a.show_answer_review ?? true,
      listening_audio: a.listening_audio_url ? { url: a.listening_audio_url, filename: "Listening recording" } : null,
      listening_exam_mode: Boolean(a.listening_exam_mode),
      listening_check_minutes: String(a.listening_check_minutes ?? 2),
    };

    setAssignment(a);
    setState(st);
    setStructure(built);
    setOrig(o);
    setDraft(JSON.parse(JSON.stringify(o)));
    setSettings(s0);
    setOrigSettings(s0);
    setLoading(false);

    if (st.level >= 2) {
      const { data: t } = await supabase.rpc("duplicate_targets");
      setTargets(Array.isArray(t) ? t : []);
    }
  }, [assignmentId]);

  useEffect(() => {
    load();
  }, [load]);

  const keysLocked = state?.level === 3;

  // ---------- what changed, and what is wrong ----------
  const diff = useMemo(() => {
    if (!orig || !draft) return null;
    const sections = [];
    const groups = [];
    const questions = [];
    const problems = [];
    let keysChanged = 0;
    const qAlive = (id) => !removedQuestions.has(id);

    for (const sec of structure) {
      const id = sec.id;
      const d = draft.sections[id];
      const o = orig.sections[id];
      const e = { id };
      if (d.passage_title !== o.passage_title) e.passage_title = d.passage_title;
      if (d.passage_text !== o.passage_text) e.passage_text = d.passage_text;
      if (d.audio_url !== o.audio_url) e.audio_url = d.audio_url;
      if (d.max_plays !== o.max_plays) {
        const n = d.max_plays === "" ? null : Number(d.max_plays);
        if (n !== null && (!Number.isInteger(n) || n < 1 || n > 20)) problems.push(`plays:${id}`);
        e.max_plays = n;
      }
      if (Object.keys(e).length > 1) sections.push(e);
      if (sec.groups.every((g) => removedGroups.has(g.id))) problems.push(`part:${id}`);

      for (const g of sec.groups) {
        if (removedGroups.has(g.id)) continue;
        const gd = draft.groups[g.id];
        const go = orig.groups[g.id];
        const ge = { id: g.id };
        if (gd.instruction !== go.instruction) ge.instruction = gd.instruction;
        if (gd.passage_text !== go.passage_text) ge.passage_text = gd.passage_text;
        if (gd.image_url !== go.image_url) ge.image_url = gd.image_url;
        if (Object.keys(ge).length > 1) groups.push(ge);

        const alive = g.questionIds.filter(qAlive);
        if (alive.length === 0) problems.push(`empty:${g.id}`);
        const blanksWas = countBlanks(go.passage_text);
        const blanksNow = countBlanks(gd.passage_text);
        if (blanksWas > 0 ? blanksNow !== alive.length : blanksNow !== 0) problems.push(`group:${g.id}`);
        if (!gd.image_url && g.questionIds.some((qid) => orig.questions[qid].type === "matching_map_labelling")) problems.push(`image:${g.id}`);

        for (const qid of alive) {
          const qd = draft.questions[qid];
          const qo = orig.questions[qid];
          const qe = { id: qid };
          if (qd.prompt !== qo.prompt) {
            qe.prompt = qd.prompt;
            if (countBlanks(qd.prompt) !== countBlanks(qo.prompt)) problems.push(`prompt:${qid}`);
          }
          if (!same(qd.options, qo.options)) qe.options = qd.options;
          if (!same(qd.key, qo.key)) {
            const bad =
              qd.type === "gap_fill"
                ? !Array.isArray(qd.key) || qd.key.length === 0 || qd.key.some((x) => !String(x).trim())
                : qd.type === "multiple_selection"
                ? !Array.isArray(qd.key) || qd.key.length !== (Array.isArray(qo.key) ? qo.key.length : 0)
                : !qd.key;
            if (bad) problems.push(`key:${qid}`);
            qe.correct_answer = qd.type === "gap_fill" && Array.isArray(qd.key) ? qd.key.map((x) => String(x).trim()) : qd.key;
            keysChanged += 1;
          }
          if (Object.keys(qe).length > 1) questions.push(qe);
        }
      }
    }

    const deleteGroups = [...removedGroups];
    const deleteQuestions = [...removedQuestions].filter((qid) => {
      const owner = structure.flatMap((sec) => sec.groups).find((g) => g.questionIds.includes(qid));
      return owner && !removedGroups.has(owner.id);
    });
    const deleted = deleteGroups.length + deleteQuestions.length;
    return {
      sections, groups, questions, deleteGroups, deleteQuestions, deleted, problems, keysChanged,
      count: sections.length + groups.length + questions.length + deleted,
    };
  }, [orig, draft, structure, removedGroups, removedQuestions]);

  // Question numbers as the students will see them, without what is removed.
  const numbering = useMemo(() => {
    const map = {};
    let next = 1;
    for (const sec of structure) {
      for (const g of sec.groups) {
        if (removedGroups.has(g.id)) continue;
        const alive = g.questionIds.filter((id) => !removedQuestions.has(id));
        const qs = alive.map((id) => ({ ...orig.questions[id] }));
        const r = numberQuestions(qs, next);
        alive.forEach((id, i) => (map[id] = r.numbers[i]));
        map[`group:${g.id}`] = alive.length ? [r.start, r.end] : null;
        next = r.nextStart;
      }
    }
    return map;
  }, [structure, orig, removedGroups, removedQuestions]);

  const settingsChanged = settings && origSettings && !same(settings, origSettings);
  const hasProblem = (tag) => diff?.problems.includes(tag);

  // ---------- editing helpers ----------
  const patchSection = (id, patch) => setDraft((d) => ({ ...d, sections: { ...d.sections, [id]: { ...d.sections[id], ...patch } } }));
  const patchGroup = (id, patch) => setDraft((d) => ({ ...d, groups: { ...d.groups, [id]: { ...d.groups[id], ...patch } } }));
  const patchQuestion = (id, patch) => setDraft((d) => ({ ...d, questions: { ...d.questions, [id]: { ...d.questions[id], ...patch } } }));
  const setChoiceText = (qids, letter, text) =>
    setDraft((d) => {
      const questions = { ...d.questions };
      for (const id of qids) {
        const q = questions[id];
        const choices = (q.options?.choices || []).map((c) => (c.letter === letter ? { ...c, text } : c));
        questions[id] = { ...q, options: { ...q.options, choices } };
      }
      return { ...d, questions };
    });

  // ---------- save ----------
  async function save() {
    setError("");
    if (!diff) return;
    if (diff.problems.length > 0) {
      setError("Some fields need fixing first (marked in red): one \"___\" per question in a text with blanks, a correct answer for every question, a picture for a map, at least one question in each group and one group in each part.");
      return;
    }
    if (diff.deleted > 0) {
      const nq = diff.deleteQuestions.length;
      const ng = diff.deleteGroups.length;
      const parts = [];
      if (ng) parts.push(`${ng} question group${ng > 1 ? "s" : ""}`);
      if (nq) parts.push(`${nq} question${nq > 1 ? "s" : ""}`);
      if (!window.confirm(`Delete ${parts.join(" and ")} from this paper? This cannot be undone.`)) return;
    }
    const minutes = parseInt(settings.time_limit_minutes, 10);
    if (!minutes || minutes < 1) {
      setError("Set a time limit, in minutes.");
      return;
    }
    if (diff.keysChanged > 0 && state.level === 2) {
      const ok = window.confirm(
        `${state.submitted} student${state.submitted > 1 ? "s have" : " has"} already handed in this paper. ` +
          `You changed ${diff.keysChanged} correct answer${diff.keysChanged > 1 ? "s" : ""}: the copies will be re-marked automatically. ` +
          `No student has seen a mark yet. Continue?`
      );
      if (!ok) return;
    }
    setSaving(true);
    let remarked = 0;
    if (diff.count > 0) {
      const { data, error: rpcError } = await supabase.rpc("save_paper_edits", {
        p_assignment_id: assignmentId,
        p_edits: {
          sections: diff.sections,
          groups: diff.groups,
          questions: diff.questions,
          delete_groups: diff.deleteGroups,
          delete_questions: diff.deleteQuestions,
        },
      });
      if (rpcError) {
        setSaving(false);
        setError("Nothing was saved: " + rpcError.message);
        return;
      }
      remarked = data?.answers_remarked || 0;
    }
    if (settingsChanged) {
      const isListening = assignment.type === "Listening";
      const patch = {
        title: settings.title.trim() || assignment.title,
        due_date: settings.due_date || null,
        due_time: settings.due_time || null,
        time_limit_minutes: minutes,
        auto_release_score: settings.auto_release_score,
        show_answer_review: settings.show_answer_review,
      };
      if (isListening && origSettings.listening_audio) {
        patch.listening_audio_url = settings.listening_audio?.url || origSettings.listening_audio.url;
        patch.listening_exam_mode = settings.listening_exam_mode;
        patch.listening_check_minutes = Math.min(30, Math.max(0, parseInt(settings.listening_check_minutes, 10) || 0));
      }
      const { error: uError } = await supabase.from("assignments").update(patch).eq("id", assignmentId);
      if (uError) {
        setSaving(false);
        setError((diff.count > 0 ? "The questions were saved, but the settings were not: " : "The settings were not saved: ") + uError.message);
        return;
      }
    }
    setSaving(false);
    showToast?.(remarked > 0 ? `Saved — ${remarked} answer${remarked > 1 ? "s" : ""} re-marked` : "Changes saved");
    back();
  }

  async function duplicateAndEdit() {
    if (!dupTarget) return;
    setDuplicating(true);
    const { data, error: dErr } = await supabase.rpc("duplicate_assignment", { p_assignment_id: assignmentId, p_target_class_id: dupTarget });
    setDuplicating(false);
    if (dErr || !data?.assignment_id) {
      setError("Could not duplicate: " + (dErr?.message || "unknown error") + " — nothing was copied.");
      return;
    }
    showToast?.("Copy made — you are now editing the copy");
    setScreen({
      name: "paper-editor",
      classId: data.class_id,
      assignmentId: data.assignment_id,
      returnTo: data.session_id ? { name: "exam-session", sessionId: data.session_id } : undefined,
    });
  }

  if (loading) return <CenterSpinner />;
  if (loadError) {
    return (
      <div className="page">
        <button className="back-link" onClick={back}><ArrowLeft size={14} /> Back</button>
        <p className="empty-inline">{loadError}</p>
      </div>
    );
  }
  if (state.exam_live) {
    return (
      <div className="page">
        <button className="back-link" onClick={back}><ArrowLeft size={14} /> Back</button>
        <p className="empty-inline">This exam is running: its papers cannot be changed until it is closed.</p>
      </div>
    );
  }

  const isListening = assignment.type === "Listening";
  const canRemove = state.level === 1;
  const nothingToSave = diff.count === 0 && !settingsChanged;

  return (
    <div className="page page-wide qe-pe">
      <button className="back-link" onClick={back}><ArrowLeft size={14} /> Back</button>
      <div className="eyebrow">Edit {assignment.type}</div>
      <h1 className="page-title">{assignment.title}</h1>

      {state.level === 1 && (
        <div className="qe-pe-banner is-ok">
          <CheckCircle2 size={16} />
          <span>Nobody has handed in this paper yet: you can correct the wording and the correct answers.</span>
        </div>
      )}
      {state.level === 2 && (
        <div className="qe-pe-banner is-warn">
          <AlertTriangle size={16} />
          <span>
            <strong>{state.submitted} student{state.submitted > 1 ? "s have" : " has"} handed in this paper</strong>, but no one has seen a mark yet.
            You can correct the wording and the correct answers — the copies will be re-marked automatically when you save.
          </span>
        </div>
      )}
      {state.level === 3 && (
        <div className="qe-pe-banner is-lock">
          <Lock size={16} />
          <span>
            <strong>Students have already seen their mark for this paper, so its correct answers are locked.</strong>{" "}
            You can still fix typing mistakes in the wording.
          </span>
        </div>
      )}
      {state.level >= 2 && (
        <div className="qe-pe-dup">
          <span>
            To make a different version for another class, duplicate it and edit the copy — this paper and its students' marks stay as they are.
          </span>
          <div className="qe-pe-dup-row">
            <select className="field-input" value={dupTarget} onChange={(e) => setDupTarget(e.target.value)}>
              <option value="">Choose a class or an exam…</option>
              {targets.some((t) => t.kind === "class") && (
                <optgroup label="My classes">
                  {targets.filter((t) => t.kind === "class").map((t) => <option key={t.class_id} value={t.class_id}>{t.name}</option>)}
                </optgroup>
              )}
              {targets.some((t) => t.kind === "exam") && (
                <optgroup label="My exams (not started yet)">
                  {targets.filter((t) => t.kind === "exam").map((t) => <option key={t.class_id} value={t.class_id}>{t.name}</option>)}
                </optgroup>
              )}
            </select>
            <button className="btn-ghost" disabled={!dupTarget || duplicating} onClick={duplicateAndEdit}>
              <Copy size={13} /> {duplicating ? "Copying…" : "Duplicate and edit the copy"}
            </button>
          </div>
        </div>
      )}

      {/* ---------- Settings ---------- */}
      <h3 className="section-title" style={{ marginTop: 22 }}>Settings</h3>
      <label className="field-label">Title</label>
      <input className="field-input" value={settings.title} onChange={(e) => setSettings({ ...settings, title: e.target.value })} />
      <div className="qe-pe-row">
        <div>
          <label className="field-label">Due date (optional)</label>
          <input type="date" className="field-input" value={settings.due_date} onChange={(e) => setSettings({ ...settings, due_date: e.target.value })} />
        </div>
        <div>
          <label className="field-label">Due time (optional)</label>
          <input type="time" className="field-input" value={settings.due_time} onChange={(e) => setSettings({ ...settings, due_time: e.target.value })} />
        </div>
        <div>
          <label className="field-label">Time limit, minutes</label>
          <input type="number" min="1" className="field-input" value={settings.time_limit_minutes} onChange={(e) => setSettings({ ...settings, time_limit_minutes: e.target.value })} />
        </div>
      </div>
      <label className="checkbox-row" style={{ marginTop: 12 }}>
        <input type="checkbox" checked={settings.auto_release_score} onChange={(e) => setSettings({ ...settings, auto_release_score: e.target.checked })} />
        Show students their score right after they submit
      </label>
      <label className="checkbox-row" style={{ marginTop: 6 }}>
        <input type="checkbox" checked={settings.show_answer_review} onChange={(e) => setSettings({ ...settings, show_answer_review: e.target.checked })} />
        Let students see which answers were correct/incorrect, with the correct answer
      </label>

      {isListening && origSettings.listening_audio && (
        <div className="feedback-panel" style={{ marginTop: 14 }}>
          <label className="field-label" style={{ marginTop: 0 }}>Recording for the whole test</label>
          <AudioFilePicker teacherId={teacherId} value={settings.listening_audio} onChange={(f) => setSettings({ ...settings, listening_audio: f || null })} />
          <label className="checkbox-row" style={{ marginTop: 12 }}>
            <input type="checkbox" checked={settings.listening_exam_mode} onChange={(e) => setSettings({ ...settings, listening_exam_mode: e.target.checked })} />
            Exam mode: one listening only, no pause and no rewind
          </label>
          <label className="field-label" style={{ marginTop: 12 }}>Checking time after the recording (minutes)</label>
          <input type="number" min="0" max="30" className="field-input" style={{ maxWidth: 160 }} value={settings.listening_check_minutes} onChange={(e) => setSettings({ ...settings, listening_check_minutes: e.target.value })} />
        </div>
      )}

      {/* ---------- The paper ---------- */}
      {structure.map((sec, si) => (
        <div key={sec.id} className="qe-pe-part">
          <h3 className="section-title">{sec.title || `Part ${si + 1}`}</h3>

          {!isListening && (
            <>
              <label className="field-label">Passage title</label>
              <input className="field-input" value={draft.sections[sec.id].passage_title} onChange={(e) => patchSection(sec.id, { passage_title: e.target.value })} />
              <label className="field-label">Passage</label>
              <textarea
                className="field-input textarea qe-pe-passage"
                value={draft.sections[sec.id].passage_text}
                onChange={(e) => patchSection(sec.id, { passage_text: e.target.value })}
              />
              <p className="field-hint">Lines such as [[image:…]] are the pictures of the passage: leave them where they are.</p>
            </>
          )}
          {isListening && !origSettings.listening_audio && (
            <div className="qe-pe-media">
              <label className="field-label" style={{ marginTop: 0 }}>Recording of this part</label>
              <AudioFilePicker
                teacherId={teacherId}
                value={draft.sections[sec.id].audio_url ? { url: draft.sections[sec.id].audio_url, filename: draft.sections[sec.id].audio_url === orig.sections[sec.id].audio_url ? "Current recording" : "New recording" } : null}
                onChange={(f) => patchSection(sec.id, { audio_url: f?.url || null })}
              />
              <label className="field-label">Plays allowed (leave blank for unlimited)</label>
              <input
                type="number"
                min="1"
                max="20"
                placeholder="Unlimited"
                className={`field-input ${hasProblem(`plays:${sec.id}`) ? "is-invalid" : ""}`}
                style={{ maxWidth: 160 }}
                value={draft.sections[sec.id].max_plays}
                onChange={(e) => patchSection(sec.id, { max_plays: e.target.value })}
              />
              {hasProblem(`plays:${sec.id}`) && <div className="field-error">A whole number between 1 and 20, or empty.</div>}
            </div>
          )}
          {hasProblem(`part:${sec.id}`) && (
            <div className="field-error">A part must keep at least one question group: undo one of the removals.</div>
          )}

          {sec.groups.map((g) => {
            if (removedGroups.has(g.id)) {
              return (
                <div key={g.id} className="qe-pe-removed">
                  <span>Question group removed ({g.questionIds.length} question{g.questionIds.length > 1 ? "s" : ""}) — deleted when you save.</span>
                  <button type="button" className="btn-ghost" onClick={() => setRemovedGroups((set) => { const n = new Set(set); n.delete(g.id); return n; })}>
                    <Undo2 size={13} /> Undo
                  </button>
                </div>
              );
            }
            const qids = g.questionIds;
            const qs = qids.map((id) => draft.questions[id]);
            const shared = sharedChoices(qs);
            const sharedHasText = shared && (qs[0].options?.choices || []).some((c) => c.text);
            const range = numbering[`group:${g.id}`];
            const first = range ? range[0] : null;
            const last = range ? range[1] : null;
            const aliveCount = qids.filter((id) => !removedQuestions.has(id)).length;
            const isLabelling = qids.some((id) => orig.questions[id].type === "matching_map_labelling");
            const gText = draft.groups[g.id].passage_text;
            const gOrigText = orig.groups[g.id].passage_text;
            return (
              <div key={g.id} className="qe-pe-group">
                <div className="qe-pe-group-head">
                  <span>{range ? `Questions ${first}${last !== first ? `–${last}` : ""}` : "No question left"}</span>
                  {canRemove && (
                    <button type="button" className="btn-ghost qe-pe-remove" onClick={() => setRemovedGroups((set) => new Set(set).add(g.id))}>
                      <Trash2 size={13} /> Remove this group
                    </button>
                  )}
                </div>
                {hasProblem(`empty:${g.id}`) && <div className="field-error">A group cannot be left without questions: remove the whole group instead, or undo.</div>}
                <label className="field-label">Instruction</label>
                <textarea className="field-input textarea qe-pe-short" value={draft.groups[g.id].instruction} onChange={(e) => patchGroup(g.id, { instruction: e.target.value })} />

                {(orig.groups[g.id].image_url || isLabelling) && (
                  <div className={`qe-pe-image ${hasProblem(`image:${g.id}`) ? "is-invalid" : ""}`}>
                    <GroupImagePicker
                      teacherId={teacherId}
                      value={draft.groups[g.id].image_url || ""}
                      onChange={(url) => patchGroup(g.id, { image_url: url || null })}
                      label={isLabelling ? "Map / plan (required)" : "Picture"}
                      required={isLabelling}
                    />
                  </div>
                )}

                {gOrigText && (
                  <GroupTextEditor
                    value={gText}
                    original={gOrigText}
                    invalid={hasProblem(`group:${g.id}`)}
                    questionsLeft={aliveCount}
                    onChange={(v) => patchGroup(g.id, { passage_text: v })}
                  />
                )}

                {sharedHasText && (
                  <div className="qe-pe-options">
                    <div className="field-label" style={{ marginTop: 0 }}>Options (for all the questions of this group)</div>
                    {(qs[0].options?.choices || []).map((c) => (
                      <div key={c.letter} className="qe-pe-choice">
                        <span className="qe-pe-letter">{c.letter}</span>
                        <input className="field-input" value={c.text} onChange={(e) => setChoiceText(qids, c.letter, e.target.value)} />
                      </div>
                    ))}
                  </div>
                )}

                {qids.map((id) =>
                  removedQuestions.has(id) ? (
                    <div key={id} className="qe-pe-removed">
                      <span>Question removed — deleted when you save.{countBlanks(gOrigText) > 0 ? " Also remove its \"___\" from the text above." : ""}</span>
                      <button type="button" className="btn-ghost" onClick={() => setRemovedQuestions((set) => { const n = new Set(set); n.delete(id); return n; })}>
                        <Undo2 size={13} /> Undo
                      </button>
                    </div>
                  ) : (
                  <QuestionEditor
                    key={id}
                    number={numbering[id]}
                    onRemove={canRemove ? () => setRemovedQuestions((set) => new Set(set).add(id)) : null}
                    q={draft.questions[id]}
                    orig={orig.questions[id]}
                    hideChoices={shared}
                    keysLocked={keysLocked}
                    promptInvalid={hasProblem(`prompt:${id}`)}
                    keyInvalid={hasProblem(`key:${id}`)}
                    onPatch={(patch) => patchQuestion(id, patch)}
                    onChoice={(letter, text) => setChoiceText([id], letter, text)}
                  />
                  )
                )}
              </div>
            );
          })}
        </div>
      ))}

      {error && <div className="field-error" style={{ marginTop: 16 }}>{error}</div>}

      <div className="qe-builder-actions qe-pe-actions">
        <button className="btn-primary" disabled={saving || nothingToSave} onClick={save}>
          {saving ? "Saving…" : "Save changes"}
        </button>
        <button className="btn-ghost" disabled={saving} onClick={back}>Cancel</button>
        <span className="field-hint" style={{ margin: 0 }}>
          {nothingToSave
            ? "Nothing changed yet."
            : `${diff.count + (settingsChanged ? 1 : 0)} change${diff.count + (settingsChanged ? 1 : 0) > 1 ? "s" : ""} to save${diff.keysChanged ? ` — ${diff.keysChanged} correct answer${diff.keysChanged > 1 ? "s" : ""}` : ""}${diff.deleted ? ` — ${diff.deleted} removal${diff.deleted > 1 ? "s" : ""}` : ""}.`}
        </span>
      </div>
      <p className="field-hint">
        {canRemove
          ? "Adding new questions will come in a next step."
          : "Questions can only be removed while nobody has handed in this paper. To make a shorter version, duplicate it and edit the copy."}
      </p>
    </div>
  );
}

// The words of a notes / table / summary text. The layout (and every
// blank "___") stays; only the words change.
function GroupTextEditor({ value, original, invalid, onChange, questionsLeft }) {
  const blanksNow = countBlanks(value);
  const blanksWas = countBlanks(original);
  const needed = blanksWas > 0 ? questionsLeft : 0;
  const badge = (
    <span className={`qe-pe-blanks ${blanksNow !== needed ? "is-bad" : ""}`} title="One blank per question of this group">
      {blanksNow} blank{blanksNow === 1 ? "" : "s"} / {needed} question{needed === 1 ? "" : "s"}
    </span>
  );

  if (isJsonLayout(original)) {
    let parsed = null;
    try {
      parsed = JSON.parse(value);
    } catch {
      parsed = null;
    }
    if (!parsed) return <p className="field-error">This group's layout could not be read.</p>;
    const leaves = textLeaves(parsed);
    return (
      <div className={`qe-pe-layout ${invalid ? "is-invalid" : ""}`}>
        <div className="qe-pe-layout-head">
          <span className="field-label" style={{ margin: 0 }}>Text of the {parsed.style || "notes"}</span>
          {badge}
        </div>
        {leaves.map((l) => (
          <input
            key={l.path.join(".")}
            className={`field-input qe-pe-leaf ${countBlanks(l.value) ? "has-blank" : ""}`}
            value={l.value}
            onChange={(e) => onChange(JSON.stringify(setAtPath(parsed, l.path, e.target.value)))}
          />
        ))}
        <p className="field-hint">Keep each "___": it is where the student writes an answer.</p>
      </div>
    );
  }

  return (
    <div className={`qe-pe-layout ${invalid ? "is-invalid" : ""}`}>
      <div className="qe-pe-layout-head">
        <span className="field-label" style={{ margin: 0 }}>Text with the blanks</span>
        {badge}
      </div>
      <textarea className="field-input textarea qe-pe-passage" value={value} onChange={(e) => onChange(e.target.value)} />
      <p className="field-hint">Keep each "___": it is where the student writes an answer.</p>
    </div>
  );
}

function QuestionEditor({ number, q, orig, hideChoices, keysLocked, promptInvalid, keyInvalid, onPatch, onChoice, onRemove }) {
  const choices = q.options?.choices || [];
  const showPrompt = !isPlaceholderPrompt(orig.prompt) || q.prompt !== orig.prompt;
  const keyChanged = !same(q.key, orig.key);

  let answer = null;
  if (q.type === "gap_fill") {
    const list = Array.isArray(q.key) ? q.key : [];
    answer = (
      <div className="qe-pe-variants">
        {list.map((v, i) => (
          <span key={i} className="qe-pe-variant">
            <input
              className="field-input"
              value={v}
              disabled={keysLocked}
              onChange={(e) => onPatch({ key: list.map((x, j) => (j === i ? e.target.value : x)) })}
            />
            {!keysLocked && list.length > 1 && (
              <button type="button" className="qe-pe-icon" title="Remove this answer" onClick={() => onPatch({ key: list.filter((_, j) => j !== i) })}><X size={12} /></button>
            )}
          </span>
        ))}
        {!keysLocked && list.length < 10 && (
          <button type="button" className="btn-ghost qe-pe-add" onClick={() => onPatch({ key: [...list, ""] })}><Plus size={12} /> Another accepted answer</button>
        )}
      </div>
    );
  } else if (q.type === "true_false_not_given") {
    const labels = TFNG_LABELS[q.options?.label_set] || TFNG_LABELS.true_false;
    answer = (
      <select className="field-input qe-pe-select" value={q.key || ""} disabled={keysLocked} onChange={(e) => onPatch({ key: e.target.value })}>
        {Object.entries(labels).map(([v, label]) => <option key={v} value={v}>{label}</option>)}
      </select>
    );
  } else if (q.type === "multiple_selection") {
    const sel = Array.isArray(q.key) ? q.key : [];
    const need = Array.isArray(orig.key) ? orig.key.length : 0;
    answer = (
      <div className="qe-pe-letters">
        {choices.map((c) => (
          <label key={c.letter} className="checkbox-row qe-pe-letter-pick">
            <input
              type="checkbox"
              checked={sel.includes(c.letter)}
              disabled={keysLocked}
              onChange={(e) => onPatch({ key: e.target.checked ? [...sel, c.letter].sort() : sel.filter((x) => x !== c.letter) })}
            />
            {c.letter}
          </label>
        ))}
        <span className="field-hint" style={{ margin: 0 }}>Choose {need}.</span>
      </div>
    );
  } else {
    answer = (
      <select className="field-input qe-pe-select" value={q.key || ""} disabled={keysLocked} onChange={(e) => onPatch({ key: e.target.value })}>
        {choices.map((c) => (
          <option key={c.letter} value={c.letter}>{c.text ? `${c.letter} — ${c.text.slice(0, 60)}` : c.letter}</option>
        ))}
      </select>
    );
  }

  return (
    <div className="qe-pe-q">
      <div className="qe-pe-q-head">
        <span className="rf-answer-num qe-question-badge">{number}</span>
        <span className="qe-pe-type">{TYPE_LABELS[q.type] || q.type}</span>
        {onRemove && (
          <button type="button" className="qe-pe-icon qe-pe-remove-q" title="Remove this question" onClick={onRemove}>
            <Trash2 size={14} />
          </button>
        )}
      </div>
      {showPrompt && (
        <>
          <textarea
            className={`field-input textarea qe-pe-short ${promptInvalid ? "is-invalid" : ""}`}
            value={q.prompt}
            onChange={(e) => onPatch({ prompt: e.target.value })}
          />
          {promptInvalid && <div className="field-error">Keep the same number of blanks "___" as before ({countBlanks(orig.prompt)}).</div>}
        </>
      )}
      {!hideChoices && choices.length > 0 && choices.some((c) => c.text) && (
        <div className="qe-pe-options">
          {choices.map((c) => (
            <div key={c.letter} className="qe-pe-choice">
              <span className="qe-pe-letter">{c.letter}</span>
              <input className="field-input" value={c.text} onChange={(e) => onChoice(c.letter, e.target.value)} />
            </div>
          ))}
        </div>
      )}
      <div className={`qe-pe-answer ${keyInvalid ? "is-invalid" : ""} ${keyChanged ? "is-changed" : ""}`}>
        <span className="qe-pe-answer-label">{keysLocked ? <><Lock size={12} /> Correct answer</> : "Correct answer"}</span>
        {answer}
      </div>
      {keyInvalid && <div className="field-error">{q.type === "gap_fill" ? "Every accepted answer needs some text." : "Choose the correct answer."}</div>}
    </div>
  );
}
