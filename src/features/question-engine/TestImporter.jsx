
import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { ArrowLeft, CheckCircle2, AlertTriangle, XCircle, FileText, Pencil, ImagePlus, Upload, Loader2 } from "lucide-react";
import { supabase } from "../../supabaseClient";
import { parseTest, analyseGroup, parseAnswerKey, resolveAnswers, buildGroupRows, defaultImportInstruction, IMPORT_TYPES, analysisSlots } from "./importParse";
import { QuestionRenderer } from "./QuestionRenderer";
import { MatchingGrid } from "./MatchingGrid";
import { SummaryCompletion } from "./SummaryCompletion";
import { NotesCompletion } from "./NotesCompletion";
import { TableCompletion } from "./TableCompletion";
import { SentenceCompletion } from "./SentenceCompletion";
import { FormCompletion, FlowchartCompletion, WordBankCompletion } from "./CompletionExtras";
import { GroupImagePicker, GroupImage } from "./GroupImage";
import { AudioFilePicker } from "./AudioFilePicker";
import { PassageImageTools, PassageView, defaultResolve, imageUrlsIn, imageMarker, stripImageMarkers, uploadPassageImage } from "./PassageImages";

// Test importer (Reading / Listening).
// 1. The teacher pastes the test (and, optionally, the answer key).
// 2. Everything is recognised in the browser and shown as an editable
//    preview, exactly as students will see it, with a status per group.
// 3. Nothing is saved until "Create assignment". Then the questions,
//    their answer keys (question_answer_key, never visible to students),
//    the parts and the groups are created with the teacher's own rights
//    — the same inserts the manual builders already do.

// Drop (or choose) a PDF / Word / text file: its text is read in the
// browser and put into the text box below, where the teacher can check it.
function FileDrop({ label, onText, compact = false }) {
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [message, setMessage] = useState(null); // { kind: "ok" | "error", text }
  const [inputKey, setInputKey] = useState(0);

  async function handle(file) {
    if (!file || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const { extractTextFromFile } = await import("./fileExtract");
      const result = await extractTextFromFile(file);
      onText(result.text, result);
      const pics = result.images?.length || 0;
      const extra = [
        pics ? `${pics} picture${pics > 1 ? "s" : ""} found — placed in the passage or its question group` : "",
        result.skippedImages ? `${result.skippedImages} picture${result.skippedImages > 1 ? "s" : ""} in a format that can't be shown (e.g. Word drawings) — add ${result.skippedImages > 1 ? "them" : "it"} with a screenshot` : "",
      ].filter(Boolean);
      setMessage({ kind: "ok", text: `Text read from "${file.name}"${extra.length ? ` (${extra.join("; ")})` : ""} — check it below, then continue.` });
    } catch (e) {
      setMessage({ kind: "error", text: e?.name === "ExtractError" || e?.constructor?.name === "ExtractError" ? e.message : e?.message || "This file could not be read." });
    } finally {
      setBusy(false);
      setInputKey((k) => k + 1);
    }
  }

  return (
    <div>
      <label
        className={`qe-imp-drop ${compact ? "qe-imp-drop-compact" : ""} ${over ? "is-over" : ""} ${busy ? "is-busy" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          handle(e.dataTransfer.files?.[0]);
        }}
      >
        {busy ? <Loader2 size={18} className="qe-imp-spin" /> : <Upload size={18} />}
        <span>{busy ? "Reading the file…" : label}</span>
        <span className="qe-imp-drop-hint">PDF, Word (.docx) or .txt — read on your computer, never uploaded</span>
        <input key={inputKey} type="file" accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain" style={{ display: "none" }} disabled={busy} onChange={(e) => handle(e.target.files?.[0])} />
      </label>
      {message && <div className={message.kind === "ok" ? "qe-imp-drop-ok" : "field-error"} style={{ marginTop: 8 }}>{message.text}</div>}
    </div>
  );
}

const LAST_LETTERS = "BCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const noop = () => {};

function statusOf(issues) {
  if (issues.some((i) => i.level === "error")) return "error";
  if (issues.some((i) => i.level === "warn")) return "warn";
  return "ok";
}

function StatusChip({ status }) {
  if (status === "ok") return <span className="qe-imp-chip qe-imp-chip-ok"><CheckCircle2 size={13} /> Ready</span>;
  if (status === "warn") return <span className="qe-imp-chip qe-imp-chip-warn"><AlertTriangle size={13} /> Check</span>;
  return <span className="qe-imp-chip qe-imp-chip-error"><XCircle size={13} /> Fix</span>;
}

// Renders a group exactly like the student screen (answers disabled).
function GroupPreview({ analysis, groupId }) {
  const questions = analysis.questions.map((q) => ({ id: `pv-${groupId}-${q.number}`, type: q.dbType, prompt: q.prompt, options: q.options }));
  const common = { questions, answers: {}, onChange: noop, disabled: true, startNumber: analysis.start };
  const p = analysis.payload;
  if (p) {
    if (p.style === "notes") return <NotesCompletion blocks={p.blocks || []} {...common} />;
    if (p.style === "table") return <TableCompletion headers={p.headers || []} rows={p.rows || []} {...common} />;
    if (p.style === "sentences") return <SentenceCompletion sentences={p.sentences || []} {...common} />;
    if (p.style === "form") return <FormCompletion title={p.title} rows={p.rows || []} {...common} />;
    if (p.style === "flowchart") return <FlowchartCompletion title={p.title} steps={p.steps || []} {...common} />;
    if (p.style === "wordbank") return <WordBankCompletion text={p.text} options={p.options || []} {...common} />;
    return <SummaryCompletion text={p.text || ""} {...common} />;
  }
  if (questions.length === 0) return <p className="empty-inline">Nothing recognised yet.</p>;
  if (questions[0].type.startsWith("matching_")) return <MatchingGrid {...common} />;
  return (
    <div className="qe-imp-qlist">
      {analysis.questions.map((q, i) => (
        <div key={q.number} className="qe-imp-q">
          <span className="rf-answer-num">{q.slots > 1 ? `${q.number}–${q.number + q.slots - 1}` : q.number}</span>
          <div className="qe-imp-q-body">
            <QuestionRenderer question={questions[i]} value={q.dbType === "multiple_selection" ? [] : ""} onChange={noop} disabled />
          </div>
        </div>
      ))}
    </div>
  );
}

export function TestImporter({ classId, teacherId, skill: initialSkill = "reading", setScreen, showToast }) {
  const [skill, setSkill] = useState(initialSkill === "listening" ? "listening" : "reading");
  const [step, setStep] = useState("input"); // "input" | "preview"
  const [testText, setTestText] = useState("");
  const [keyText, setKeyText] = useState("");
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("");
  const [timeLimit, setTimeLimit] = useState("");
  const [autoReleaseScore, setAutoReleaseScore] = useState(true);
  const [showAnswerReview, setShowAnswerReview] = useState(true);
  const [parts, setParts] = useState([]);
  const [answers, setAnswers] = useState({});
  const [editing, setEditing] = useState({}); // groupId -> bool (source text open)
  const [instructions, setInstructions] = useState({}); // groupId -> edited instruction
  const [progress, setProgress] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  // Pictures read from a Word file: kept in memory (object URLs) until
  // "Create assignment" uploads the ones still used.
  const [localImages, setLocalImages] = useState({}); // id -> { blob, url }
  // Listening audio: one file for the whole test, or one per part.
  const [audioMode, setAudioMode] = useState("single");
  const [singleAudio, setSingleAudio] = useState(null); // { url, filename }
  const [examMode, setExamMode] = useState(false);
  const [checkMinutes, setCheckMinutes] = useState("2");
  const localRef = useRef({});
  useEffect(() => {
    localRef.current = localImages;
  }, [localImages]);
  useEffect(() => () => Object.values(localRef.current).forEach((im) => URL.revokeObjectURL(im.url)), []);

  function onTestFile(text, result) {
    Object.values(localImages).forEach((im) => URL.revokeObjectURL(im.url));
    const next = {};
    for (const im of result?.images || []) next[im.id] = { blob: im.blob, url: URL.createObjectURL(im.blob) };
    setLocalImages(next);
    setTestText(text);
  }

  const resolveImage = useCallback(
    (url) => {
      const m = /^local:(\d+)$/.exec(url || "");
      if (m) return localImages[m[1]]?.url || "";
      return defaultResolve(url);
    },
    [localImages]
  );

  function analyse() {
    setError("");
    const parsed = parseTest(testText, skill);
    const groupCount = parsed.reduce((a, p) => a + p.groups.length, 0);
    if (groupCount === 0) {
      setError('No question groups found. Each group must start with a line such as "Questions 1-6".');
      return;
    }
    setParts(parsed);
    setAnswers(parseAnswerKey(keyText));
    setEditing({});
    setInstructions({});
    if (!title.trim()) {
      const guess = parsed[0]?.docTitle || (skill === "reading" ? parsed[0]?.passageTitle : "");
      if (guess) setTitle(guess);
    }
    setStep("preview");
    window.scrollTo?.(0, 0);
  }

  function patchPart(partId, patch) {
    setParts((prev) => prev.map((p) => (p.id === partId ? { ...p, ...patch } : p)));
  }
  function patchGroup(partId, groupId, patch) {
    setParts((prev) => prev.map((p) => (p.id !== partId ? p : { ...p, groups: p.groups.map((g) => (g.id === groupId ? { ...g, ...patch } : g)) })));
  }
  function removeGroup(partId, groupId) {
    setParts((prev) => prev.map((p) => (p.id !== partId ? p : { ...p, groups: p.groups.filter((g) => g.id !== groupId) })).filter((p) => p.groups.length > 0));
  }

  // Everything below is recomputed from the editable state.
  const view = useMemo(() => {
    let prevEnd = 0;
    return parts.map((part) => {
      const partIssues = [];
      if (skill === "reading" && !part.passageText.trim()) partIssues.push({ level: "error", msg: "The reading passage is empty — paste it here." });
      if (skill === "listening" && audioMode === "parts" && !part.audioUrl) partIssues.push({ level: "error", msg: "Add the audio file for this part." });
      const groups = part.groups.map((g) => {
        const analysis = analyseGroup(g, skill, { passageText: part.passageText });
        const resolved = resolveAnswers(analysis, answers);
        const issues = [...analysis.issues];
        if (analysis.needsImage && !g.imageUrl) issues.push({ level: "error", msg: "Add the image (map, plan or diagram) — students need it to answer." });
        if (g.imageUrl && !resolveImage(g.imageUrl)) issues.push({ level: "error", msg: "This group's picture is no longer available — upload it again." });
        if (g.extraImages > 0) issues.push({ level: "warn", msg: `The file had ${g.extraImages} more picture${g.extraImages > 1 ? "s" : ""} in this group; only the first one is used.` });
        const missing = resolved.filter((r) => r.error);
        if (missing.length) issues.push({ level: "error", msg: `${missing.length} answer${missing.length > 1 ? "s" : ""} missing or invalid.` });
        if (g.start !== prevEnd + 1) issues.push({ level: "warn", msg: prevEnd === 0 ? `Numbering starts at ${g.start} — students will see it start at 1.` : `Numbering jumps from ${prevEnd} to ${g.start} — students will see continuous numbers.` });
        prevEnd = g.end;
        return { group: g, analysis, resolved, issues, status: statusOf(issues) };
      });
      return { part, partIssues, groups };
    });
  }, [parts, answers, skill, resolveImage, audioMode]);

  const allGroups = view.flatMap((p) => p.groups);
  const counts = {
    ok: allGroups.filter((g) => g.status === "ok").length,
    warn: allGroups.filter((g) => g.status === "warn").length,
    error: allGroups.filter((g) => g.status === "error").length + view.filter((p) => p.partIssues.length).length,
  };
  const totalQuestions = allGroups.reduce((a, g) => a + analysisSlots(g.analysis), 0);
  const audioMissing = skill === "listening" && audioMode === "single" && !singleAudio?.url;
  const canCreate = allGroups.length > 0 && counts.error === 0 && !audioMissing && !creating;

  async function create() {
    if (!canCreate) return;
    setCreating(true);
    setError("");
    const createdQuestionIds = [];
    let assignmentId = null;

    const fail = async (msg) => {
      // Best-effort clean-up so a failed import leaves nothing half-made.
      if (assignmentId) {
        await supabase.from("exam_sections").delete().eq("assignment_id", assignmentId);
        await supabase.from("assignments").delete().eq("id", assignmentId);
      }
      if (createdQuestionIds.length) await supabase.from("questions").delete().in("id", createdQuestionIds);
      setCreating(false);
      setProgress("");
      setError(msg);
    };

    // 0) Pictures read from the Word file: uploaded now (only the ones
    //    still used), then every "local:" reference is replaced.
    const used = new Set();
    for (const pv of view) {
      imageUrlsIn(pv.part.passageText).forEach((u) => u.startsWith("local:") && used.add(u));
      pv.groups.forEach((gv) => String(gv.group.imageUrl || "").startsWith("local:") && used.add(gv.group.imageUrl));
    }
    const uploaded = {};
    let n = 0;
    for (const ref of used) {
      n += 1;
      setProgress(`Uploading picture ${n} of ${used.size}…`);
      const im = localImages[ref.slice(6)];
      if (!im) return fail("A picture from the Word file is missing. Remove it from the passage or add it again.");
      try {
        uploaded[ref] = await uploadPassageImage(teacherId, im.blob);
      } catch (e) {
        return fail(e.message);
      }
    }
    const withUploads = (text) =>
      String(text || "")
        .split("\n")
        .map((l) => {
          const m = /^\[\[image:(local:\d+)\]\]$/.exec(l.trim());
          return m ? (uploaded[m[1]] ? imageMarker(uploaded[m[1]]) : "") : l;
        })
        .join("\n");

    // 1) Questions + answer keys, in order.
    const plan = view.map((pv) => ({
      part: { ...pv.part, passageText: withUploads(pv.part.passageText) },
      groups: pv.groups.map((gv) => {
        const rows = buildGroupRows(gv.analysis, gv.resolved, skill);
        const edited = instructions[gv.group.id];
        return { gv, rows, instruction: edited !== undefined ? edited.trim() || defaultImportInstruction(gv.analysis) : rows.instruction, ids: [] };
      }),
    }));
    const total = plan.reduce((a, p) => a + p.groups.reduce((b, g) => b + g.rows.questions.length, 0), 0);
    let done = 0;
    for (const p of plan) {
      for (const g of p.groups) {
        for (const q of g.rows.questions) {
          done += 1;
          setProgress(`Saving question ${done} of ${total}…`);
          const { data: question, error: qError } = await supabase
            .from("questions")
            .insert({ teacher_id: teacherId, ...q.row })
            .select()
            .single();
          if (qError || !question) return fail("Could not save a question: " + (qError?.message || "unknown error"));
          createdQuestionIds.push(question.id);
          const { error: kError } = await supabase.from("question_answer_key").insert({ question_id: question.id, correct_answer: q.key });
          if (kError) return fail("Could not save an answer: " + kError.message);
          g.ids.push(question.id);
        }
      }
    }

    // 2) The assignment itself.
    setProgress("Creating the assignment…");
    const finalTitle = title.trim() || `${skill === "reading" ? "Reading" : "Listening"} — ${new Date().toLocaleDateString()}`;
    const { data: assignment, error: aError } = await supabase
      .from("assignments")
      .insert({
        class_id: classId,
        title: finalTitle,
        type: skill === "reading" ? "Reading" : "Listening",
        description: skill === "reading" ? stripImageMarkers(plan[0].part.passageText) : null,
        due_date: dueDate || null,
          due_time: dueTime || null,
        time_limit_minutes: timeLimit ? parseInt(timeLimit, 10) : null,
        auto_release_score: autoReleaseScore,
        show_answer_review: showAnswerReview,
        ...(skill === "reading"
          ? { reading_test_type: "academic" }
          : audioMode === "single"
          ? {
              listening_audio_url: singleAudio?.url || null,
              listening_exam_mode: examMode,
              listening_check_minutes: checkMinutes === "" ? 0 : Math.min(30, Math.max(0, parseInt(checkMinutes, 10) || 0)),
            }
          : { listening_audio_url: null, listening_exam_mode: false, listening_check_minutes: 2 }),
      })
      .select()
      .single();
    if (aError || !assignment) return fail("Could not create the assignment: " + (aError?.message || "unknown error"));
    assignmentId = assignment.id;

    // 3) Parts, groups and links.
    for (let pi = 0; pi < plan.length; pi++) {
      const { part, groups } = plan[pi];
      setProgress(`Saving Part ${pi + 1}…`);
      const sectionRow =
        skill === "reading"
          ? { assignment_id: assignmentId, title: `Part ${pi + 1}`, passage_title: part.passageTitle.trim() || null, passage_text: part.passageText.trim(), order_index: pi }
          : {
              assignment_id: assignmentId,
              title: `Part ${pi + 1}`,
              audio_url: audioMode === "single" ? null : part.audioUrl,
              max_plays: audioMode === "single" ? null : part.maxPlays ? parseInt(part.maxPlays, 10) : null,
              order_index: pi,
            };
      const { data: section, error: sError } = await supabase.from("exam_sections").insert(sectionRow).select().single();
      if (sError || !section) return fail(`Could not save Part ${pi + 1}: ` + (sError?.message || "unknown error"));

      for (let gi = 0; gi < groups.length; gi++) {
        const g = groups[gi];
        const { data: groupRow, error: gError } = await supabase
          .from("question_groups")
          .insert({ section_id: section.id, instruction: g.instruction || null, passage_text: g.rows.passageText, image_url: (uploaded[g.gv.group.imageUrl] || g.gv.group.imageUrl) || null, order_index: gi })
          .select()
          .single();
        if (gError || !groupRow) return fail(`Could not save a question group in Part ${pi + 1}: ` + (gError?.message || "unknown error"));
        const links = g.ids.map((id, qi) => ({ section_id: section.id, group_id: groupRow.id, question_id: id, order_index: qi }));
        const { error: lError } = await supabase.from("assignment_questions").insert(links);
        if (lError) return fail("Could not link the questions: " + lError.message);
      }
    }

    setCreating(false);
    setProgress("");
    showToast?.(`${skill === "reading" ? "Reading" : "Listening"} test imported — ${totalQuestions} question${totalQuestions > 1 ? "s" : ""}`);
    setScreen({ name: "class", classId });
  }

  // ------------------------------------------------------------------
  // Step 1 — paste
  // ------------------------------------------------------------------
  if (step === "input") {
    return (
      <div className="page page-wide">
        <button className="btn-ghost" onClick={() => setScreen({ name: "class", classId })}><ArrowLeft size={14} /> Back to class</button>
        <div className="eyebrow" style={{ marginTop: 12 }}>Import a test</div>
        <h1 className="page-title">Import a {skill === "reading" ? "Reading" : "Listening"} test</h1>

        <label className="field-label" style={{ marginTop: 16 }}>Skill</label>
        <div className="type-row">
          <button type="button" className={`type-chip ${skill === "reading" ? "active" : ""}`} onClick={() => setSkill("reading")}>Reading</button>
          <button type="button" className={`type-chip ${skill === "listening" ? "active" : ""}`} onClick={() => setSkill("listening")}>Listening</button>
        </div>

        <label className="field-label" style={{ marginTop: 18 }}>The test</label>
        <p className="field-hint" style={{ marginTop: 0, marginBottom: 8 }}>
          {skill === "reading"
            ? 'Drop your Word or PDF file, or copy the whole test: "READING PASSAGE 1", the passage, then each "Questions 1-6" block with its instructions.'
            : 'Copy the whole test: "SECTION 1" (or "PART 1"), then each "Questions 1-5" block with its instructions. You add the audio files in the next step.'}
        </p>
        <FileDrop label="Drop the test file here, or click to choose it" onText={onTestFile} />
        <p className="field-hint" style={{ marginTop: 8, marginBottom: 6 }}>…or paste the text:</p>
        <textarea
          className="field-input textarea qe-imp-textarea"
          placeholder={skill === "reading" ? "READING PASSAGE 1\nThe History of Glass\n…\nQuestions 1-6\nDo the following statements agree with…" : "SECTION 1\nQuestions 1-5\nComplete the form below.\n…"}
          value={testText}
          onChange={(e) => setTestText(e.target.value)}
        />

        <label className="field-label" style={{ marginTop: 18 }}>Answer key (optional — you can also type the answers in the next step)</label>
        <p className="field-hint" style={{ marginTop: 0, marginBottom: 8 }}>
          One line, or one answer per line. Example: 1 TRUE 2 FALSE 3 NOT GIVEN 4 B 5 river/the river 6 (the) museum. The answers are never shown to students before correction.
        </p>
        <FileDrop compact label="Drop the answer-key file here, or click to choose it" onText={(text) => setKeyText(text)} />
        <textarea
          className="field-input textarea"
          style={{ minHeight: 110 }}
          placeholder={"1 TRUE 2 FALSE 3 NOT GIVEN 4 B 5 river/the river"}
          value={keyText}
          onChange={(e) => setKeyText(e.target.value)}
        />

        {error && <div className="field-error" style={{ marginTop: 14 }}>{error}</div>}

        <button className="btn-primary" style={{ marginTop: 20 }} disabled={!testText.trim()} onClick={analyse}>
          <FileText size={15} /> Analyse the test
        </button>
      </div>
    );
  }

  // ------------------------------------------------------------------
  // Step 2 — preview, fix, create
  // ------------------------------------------------------------------
  return (
    <div className="page page-wide">
      <button className="btn-ghost" onClick={() => setStep("input")} disabled={creating}><ArrowLeft size={14} /> Back to the pasted text</button>
      <div className="eyebrow" style={{ marginTop: 12 }}>Import a test — preview</div>
      <h1 className="page-title">Check the {skill === "reading" ? "Reading" : "Listening"} test</h1>

      <div className="qe-imp-summary">
        <span><strong>{view.length}</strong> part{view.length > 1 ? "s" : ""}</span>
        <span><strong>{allGroups.length}</strong> group{allGroups.length > 1 ? "s" : ""}</span>
        <span><strong>{totalQuestions}</strong> question{totalQuestions > 1 ? "s" : ""}</span>
        <span className="qe-imp-chip qe-imp-chip-ok"><CheckCircle2 size={13} /> {counts.ok} ready</span>
        <span className="qe-imp-chip qe-imp-chip-warn"><AlertTriangle size={13} /> {counts.warn} to check</span>
        <span className="qe-imp-chip qe-imp-chip-error"><XCircle size={13} /> {counts.error} to fix</span>
      </div>
      <p className="field-hint">Nothing is saved yet. Fix every red item, check the orange ones, then create the assignment at the bottom of the page.</p>

      <label className="field-label" style={{ marginTop: 16 }}>Title</label>
      <input className="field-input" placeholder="e.g. IELTS Practice Test 1" value={title} onChange={(e) => setTitle(e.target.value)} />
      <div style={{ display: "flex", gap: 16, marginTop: 14, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 200px" }}>
          <label className="field-label">Due date (optional)</label>
          <input type="date" className="field-input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
        <div style={{ flex: "1 1 200px" }}>
          <label className="field-label">Due time (optional)</label>
          <input type="time" className="field-input" value={dueTime} onChange={(e) => setDueTime(e.target.value)} />
        </div>
        <div style={{ flex: "1 1 200px" }}>
          <label className="field-label">Time limit, minutes (optional)</label>
          <input type="number" min="1" className="field-input" placeholder="No timer" value={timeLimit} onChange={(e) => setTimeLimit(e.target.value)} />
        </div>
      </div>
      <label className="checkbox-row" style={{ marginTop: 14 }}>
        <input type="checkbox" checked={autoReleaseScore} onChange={(e) => setAutoReleaseScore(e.target.checked)} />
        Show students their score right after they submit
      </label>
      <label className="checkbox-row" style={{ marginTop: 8 }}>
        <input type="checkbox" checked={showAnswerReview} onChange={(e) => setShowAnswerReview(e.target.checked)} />
        Let students see which answers were correct/incorrect, with the correct answer
      </label>

      {skill === "listening" && (
        <>
          <label className="field-label" style={{ marginTop: 18 }}>Audio</label>
          <div className="type-row">
            <button type="button" className={`type-chip ${audioMode === "single" ? "active" : ""}`} onClick={() => setAudioMode("single")}>One audio for the whole test</button>
            <button type="button" className={`type-chip ${audioMode === "parts" ? "active" : ""}`} onClick={() => setAudioMode("parts")}>One audio per section</button>
          </div>
          {audioMode === "single" ? (
            <div className="feedback-panel" style={{ marginTop: 10 }}>
              <label className="field-label" style={{ marginTop: 0 }}>Recording for the whole test</label>
              <AudioFilePicker teacherId={teacherId} value={singleAudio} onChange={(f) => setSingleAudio(f || null)} />
              {audioMissing && <div className="qe-imp-issue qe-imp-issue-error"><XCircle size={13} /> Add the recording for this test.</div>}
              <label className="checkbox-row" style={{ marginTop: 14 }}>
                <input type="checkbox" checked={examMode} onChange={(e) => setExamMode(e.target.checked)} />
                Exam mode: one listening only, no pause and no rewind
              </label>
              <label className="field-label" style={{ marginTop: 14 }}>Checking time after the recording (minutes)</label>
              <input type="number" min="0" max="30" className="field-input" style={{ maxWidth: 160 }} value={checkMinutes} onChange={(e) => setCheckMinutes(e.target.value)} />
              <p className="field-hint" style={{ marginTop: 2 }}>0 = students submit when they want.</p>
            </div>
          ) : (
            <p className="field-hint" style={{ marginTop: 2 }}>Each section has its own file, added below.</p>
          )}
        </>
      )}

      {view.map(({ part, partIssues, groups }, pi) => (
        <div key={part.id} className="qe-imp-part">
          <div className="qe-imp-part-head">
            <h3 className="section-title" style={{ margin: 0 }}>Part {pi + 1}</h3>
            {part.heading && <span className="qe-imp-muted">{part.heading}</span>}
          </div>
          {partIssues.map((i, k) => <div key={k} className="qe-imp-issue qe-imp-issue-error"><XCircle size={13} /> {i.msg}</div>)}

          {skill === "reading" ? (
            <>
              <label className="field-label" style={{ marginTop: 12 }}>Passage title</label>
              <input className="field-input" value={part.passageTitle} onChange={(e) => patchPart(part.id, { passageTitle: e.target.value })} />
              <label className="field-label" style={{ marginTop: 12 }}>Passage</label>
              <textarea id={`imp-passage-${part.id}`} className="field-input textarea qe-imp-passage" value={part.passageText} onChange={(e) => patchPart(part.id, { passageText: e.target.value })} />
              <PassageImageTools
                teacherId={teacherId}
                text={part.passageText}
                textareaId={`imp-passage-${part.id}`}
                onChange={(text) => patchPart(part.id, { passageText: text })}
                resolveImage={resolveImage}
              />
              {imageUrlsIn(part.passageText).length > 0 && (
                <div className="qe-builder-preview">
                  <div className="qe-builder-preview-tag">Passage preview</div>
                  <PassageView text={part.passageText} resolveImage={resolveImage} />
                </div>
              )}
            </>
          ) : (
            audioMode === "parts" && (
            <>
              <label className="field-label" style={{ marginTop: 12 }}>Audio file</label>
              <AudioFilePicker
                teacherId={teacherId}
                value={part.audioUrl ? { url: part.audioUrl, filename: part.audioFilename } : null}
                onChange={(f) => patchPart(part.id, { audioUrl: f?.url || "", audioFilename: f?.filename || "" })}
              />
              <label className="field-label" style={{ marginTop: 12 }}>Plays allowed (leave blank for unlimited)</label>
              <input type="number" min="1" className="field-input" style={{ maxWidth: 160 }} placeholder="Unlimited" value={part.maxPlays} onChange={(e) => patchPart(part.id, { maxPlays: e.target.value })} />
            </>
            )
          )}

          {groups.map(({ group, analysis, resolved, issues, status }) => {
            const instrValue = instructions[group.id] !== undefined ? instructions[group.id] : analysis.instruction || defaultImportInstruction(analysis);
            const numbers = [];
            for (let n = group.start; n <= group.end; n++) numbers.push(n);
            const errorByNumber = Object.fromEntries(resolved.map((r) => [r.number, r.error]));
            const multi = analysis.type === "multi";
            return (
              <div key={group.id} className={`qe-imp-group qe-imp-group-${status}`}>
                <div className="qe-imp-group-head">
                  <strong>{group.start === group.end ? `Question ${group.start}` : `Questions ${group.start}–${group.end}`}</strong>
                  <StatusChip status={status} />
                  <select
                    className="field-input qe-imp-type"
                    value={analysis.type}
                    onChange={(e) => patchGroup(part.id, group.id, { type: e.target.value === analysis.detectedType ? null : e.target.value })}
                    aria-label="Question type"
                  >
                    {IMPORT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}{t.value === analysis.detectedType && t.value !== "unknown" ? " (detected)" : ""}</option>)}
                  </select>
                  <button type="button" className="btn-ghost qe-imp-remove" onClick={() => removeGroup(part.id, group.id)}>Remove</button>
                </div>

                {issues.length > 0 && (
                  <div className="qe-imp-issues">
                    {issues.map((i, k) => (
                      <div key={k} className={`qe-imp-issue qe-imp-issue-${i.level}`}>
                        {i.level === "error" ? <XCircle size={13} /> : <AlertTriangle size={13} />} {i.msg}
                      </div>
                    ))}
                  </div>
                )}

                <label className="field-label" style={{ marginTop: 10 }}>Instructions shown to students</label>
                <textarea className="field-input textarea" style={{ minHeight: 70 }} value={instrValue} onChange={(e) => setInstructions((prev) => ({ ...prev, [group.id]: e.target.value }))} />

                {(analysis.type === "info" || analysis.type === "map") && (
                  <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span className="field-label" style={{ margin: 0 }}>Letters: A to</span>
                    <select className="field-input" style={{ maxWidth: 80 }} value={analysis.letters?.[analysis.letters.length - 1] || "H"} onChange={(e) => patchGroup(part.id, group.id, { lastLetter: e.target.value })}>
                      {LAST_LETTERS.map((l) => <option key={l} value={l}>{l}</option>)}
                    </select>
                  </div>
                )}

                {analysis.needsImage || group.imageUrl || group.showImagePicker ? (
                  <GroupImagePicker
                    teacherId={teacherId}
                    value={group.imageUrl}
                    previewUrl={resolveImage(group.imageUrl)}
                    onChange={(url) => patchGroup(part.id, group.id, { imageUrl: url, extraImages: 0 })}
                    label={analysis.needsImage ? "Map / plan / diagram image" : "Image for this group (optional)"}
                    required={analysis.needsImage}
                    hint="Take a screenshot of the image in your file and upload it here."
                  />
                ) : (
                  <button type="button" className="btn-ghost" style={{ marginTop: 8 }} onClick={() => patchGroup(part.id, group.id, { showImagePicker: true })}>
                    <ImagePlus size={13} /> Add an image to this group
                  </button>
                )}

                <div className="qe-builder-preview">
                  <div className="qe-builder-preview-tag">Student preview</div>
                  {group.imageUrl && resolveImage(group.imageUrl) && <GroupImage url={resolveImage(group.imageUrl)} allowBlob />}
                  <GroupPreview analysis={analysis} groupId={group.id} />
                </div>

                <div className="qe-imp-answers">
                  <div className="field-label" style={{ marginTop: 0 }}>Answers {multi ? `(${analysis.questions[0]?.options?.required_count || 2} letters in total)` : ""}</div>
                  <div className="qe-imp-answer-grid">
                    {numbers.map((n) => (
                      <label key={n} className={`qe-imp-answer ${!multi && errorByNumber[n] ? "has-error" : ""}`}>
                        <span className="qe-imp-answer-num">{n}</span>
                        <input
                          className="field-input"
                          value={answers[n] ?? ""}
                          onChange={(e) => setAnswers((prev) => ({ ...prev, [n]: e.target.value }))}
                          placeholder="answer"
                          spellCheck={false}
                        />
                        {!multi && errorByNumber[n] && <span className="qe-imp-answer-err">{errorByNumber[n]}</span>}
                      </label>
                    ))}
                  </div>
                  {multi && errorByNumber[group.start] && <div className="qe-imp-answer-err">{errorByNumber[group.start]}</div>}
                  <p className="field-hint" style={{ marginBottom: 0 }}>
                    {analysis.questions[0]?.dbType === "gap_fill" && !analysis.questions[0]?.options?.word_bank
                      ? "Several accepted answers: separate them with / (e.g. river/the river). Words in brackets are optional: (the) river."
                      : analysis.type === "tfng" || analysis.type === "ynng"
                      ? `Write ${analysis.type === "ynng" ? "YES, NO" : "TRUE, FALSE"} or NOT GIVEN (short forms like T, F, NG also work).`
                      : analysis.type === "headings"
                      ? "Write the heading number: i, ii, iii…"
                      : "Write the correct letter."}
                  </p>
                </div>

                <button type="button" className="btn-ghost" style={{ marginTop: 10 }} onClick={() => setEditing((prev) => ({ ...prev, [group.id]: !prev[group.id] }))}>
                  <Pencil size={13} /> {editing[group.id] ? "Hide the text of this group" : "Edit the text of this group"}
                </button>
                {editing[group.id] && (
                  <>
                    <p className="field-hint" style={{ marginBottom: 6 }}>Fix a line here and the preview updates immediately. Keep the question numbers (e.g. "5 …………").</p>
                    <textarea className="field-input textarea qe-imp-source" value={group.source} onChange={(e) => patchGroup(part.id, group.id, { source: e.target.value })} />
                  </>
                )}
              </div>
            );
          })}
        </div>
      ))}

      {error && <div className="field-error" style={{ marginTop: 16 }}>{error}</div>}

      <div className="qe-imp-footer">
        <button className="btn-primary" disabled={!canCreate} onClick={create}>
          {creating ? progress || "Saving…" : `Create assignment (${totalQuestions} questions)`}
        </button>
        {!creating && counts.error > 0 && <span className="qe-imp-muted">Fix the {counts.error} red item{counts.error > 1 ? "s" : ""} first.</span>}
      </div>
    </div>
  );
}
