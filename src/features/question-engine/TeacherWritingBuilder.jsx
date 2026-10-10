
import React, { useState, useEffect } from "react";
import { ImagePlus, X } from "lucide-react";
import { supabase } from "../../supabaseClient";
import { LoadFailed } from "../../components/shared";
import { uid } from "../../lib/utils";
import { StoredImg, fileRef } from "../../lib/storageFiles";
import { confirmDialog } from "../../lib/confirmDialog";
import { BuilderLayout, PartsNav, Checklist, useBuilderCrumbs, makeLeaveGuard } from "./BuilderLayout";

// Structured Writing — teacher side.
// One assignment = one or two Parts:
//   Part "Writing Task 1" (prompt + optional image)  → exam_sections.task_number = 1
//   Part "Writing Task 2" (prompt only)              → exam_sections.task_number = 2
// The teacher may include only Task 1, only Task 2, or both.
//
// Editing works IN PLACE (update existing rows by task_number) instead of
// delete-and-recreate like Reading/Listening: students' written answers
// will be attached to these sections, and deleting a section would erase
// their work. A section is only deleted if the teacher unticks that task.

const MAX_IMAGE_MB = 10;

function emptyTask() {
  return { include: true, sectionId: null, prompt: "", imageUrl: "", imageFile: null, imagePreview: "" };
}

export function TeacherWritingBuilder({ classId, teacherId, setScreen, showToast, editAssignmentId, returnTo}) {
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("");
  // A time limit is now required: an exam paper without one would run
  // forever. New assignments start at the usual IELTS duration; the
  // teacher can change it, but not leave it empty.
  const [timeLimit, setTimeLimit] = useState(editAssignmentId ? "" : "60");
  const [task1, setTask1] = useState(emptyTask());
  const [task2, setTask2] = useState(emptyTask());
  const [fileInputKey, setFileInputKey] = useState(0);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState("");
  const [loadingExisting, setLoadingExisting] = useState(Boolean(editAssignmentId));
  // Livraison 95: if the saved assignment cannot be read, the form is NOT
  // shown empty (« Save » would replace the title, dates and time limit).
  const [loadFailed, setLoadFailed] = useState("");   // "" | "error" | "gone"
  const [loadTry, setLoadTry] = useState(0);

  useEffect(() => {
    if (!editAssignmentId) return;
    let alive = true;
    (async () => {
      setLoadFailed("");
      const { data: a, error: aErr } = await supabase.from("assignments").select("title, due_date, due_time, time_limit_minutes").eq("id", editAssignmentId).maybeSingle();
      if (!alive) return;
      if (aErr || !a) { setLoadFailed(aErr ? "error" : "gone"); return; }
      setTitle(a.title || "");
      setDueDate(a.due_date || "");
      setDueTime(a.due_time || "");
      setTimeLimit(a.time_limit_minutes ? String(a.time_limit_minutes) : "");
      const { data: sections, error: sErr } = await supabase
        .from("exam_sections")
        .select("id, task_number, passage_text, image_url")
        .eq("assignment_id", editAssignmentId)
        .order("order_index");
      if (!alive) return;
      if (sErr) { setLoadFailed("error"); return; }
      const s1 = (sections || []).find((s) => s.task_number === 1);
      const s2 = (sections || []).find((s) => s.task_number === 2);
      setTask1(s1 ? { ...emptyTask(), sectionId: s1.id, prompt: s1.passage_text || "", imageUrl: s1.image_url || "" } : { ...emptyTask(), include: false });
      setTask2(s2 ? { ...emptyTask(), sectionId: s2.id, prompt: s2.passage_text || "" } : { ...emptyTask(), include: false });
      setLoadingExisting(false);
    })();
    return () => { alive = false; };
  }, [editAssignmentId, loadTry]);

  // Revoke the local preview URL when it's replaced or the screen closes.
  useEffect(() => {
    const url = task1.imagePreview;
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [task1.imagePreview]);

  function pickImage(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file (PNG, JPG, GIF, WebP…).");
      setFileInputKey((k) => k + 1);
      return;
    }
    if (file.size > MAX_IMAGE_MB * 1024 * 1024) {
      setError(`This image is larger than ${MAX_IMAGE_MB} MB — please choose a smaller one.`);
      setFileInputKey((k) => k + 1);
      return;
    }
    setError("");
    setTask1((t) => ({ ...t, imageFile: file, imagePreview: URL.createObjectURL(file) }));
  }

  function removeImage() {
    setTask1((t) => ({ ...t, imageFile: null, imagePreview: "", imageUrl: "" }));
    setFileInputKey((k) => k + 1);
  }

  const included = [task1.include && 1, task2.include && 2].filter(Boolean);
  const canPublish =
    included.length > 0 &&
    (!task1.include || task1.prompt.trim()) &&
    (!task2.include || task2.prompt.trim());

  async function uploadTask1Image() {
    if (!task1.imageFile) return task1.imageUrl || null;
    const ext = (task1.imageFile.name.split(".").pop() || "png").toLowerCase();
    const path = `images/${teacherId}/${uid("writing")}.${ext}`;
    const { error: upError } = await supabase.storage.from("assignment-files").upload(path, task1.imageFile);
    if (upError) throw new Error("Image upload failed: " + upError.message);
    return fileRef(path);
  }

  async function publish() {
    setError("");
    if (!canPublish) return;

    // A paper with no time limit would never end — and inside an exam
    // the next paper would never unlock. Required, for every skill that
    // is actually sat under a clock.
    const minutes = parseInt(timeLimit, 10);
    if (!minutes || minutes < 1) {
      setError("Set a time limit, in minutes. Students need a clock, and an exam paper without one never ends.");
      return;
    }

    const removed = [
      !task1.include && task1.sectionId ? "Task 1" : null,
      !task2.include && task2.sectionId ? "Task 2" : null,
    ].filter(Boolean);
    if (removed.length > 0) {
      const ok = await confirmDialog({
        title: "Remove these tasks?",
        message: `You unticked ${removed.join(" and ")}. Saving will remove ${removed.length > 1 ? "these parts" : "this part"} from the assignment, including anything students have already written for ${removed.length > 1 ? "them" : "it"}. Continue?`,
        confirmLabel: "Remove and save",
        danger: true,
      });
      if (!ok) return;
    }

    const finalTitle =
      title.trim() ||
      `${included.length === 2 ? "Writing Tasks 1 & 2" : `Writing Task ${included[0]}`} — ${new Date().toLocaleDateString()}`;

    setPublishing(true);

    let imageUrl = null;
    if (task1.include) {
      try {
        imageUrl = await uploadTask1Image();
      } catch (e) {
        setPublishing(false);
        setError(e.message);
        return;
      }
    }

    let assignmentId = editAssignmentId;
    const meta = {
      title: finalTitle,
      due_date: dueDate || null,
      due_time: dueTime || null,
      time_limit_minutes: timeLimit ? parseInt(timeLimit, 10) : null,
    };

    if (editAssignmentId) {
      const { error: uError } = await supabase.from("assignments").update(meta).eq("id", editAssignmentId);
      if (uError) {
        setPublishing(false);
        setError("Could not update the assignment: " + uError.message);
        return;
      }
    } else {
      const { data: created, error: aError } = await supabase
        .from("assignments")
        .insert({
          class_id: classId,
          type: "Writing",
          description: null,
          // Writing is always marked by the teacher, never auto-scored.
          auto_release_score: false,
          show_answer_review: false,
          ...meta,
        })
        .select()
        .single();
      if (aError || !created) {
        setPublishing(false);
        setError("Could not create the assignment: " + (aError?.message || "unknown error"));
        return;
      }
      assignmentId = created.id;
    }

    // Parts are numbered by position: if only Task 2 is included it is "Part 1".
    const tasks = [
      { num: 1, t: task1, image: imageUrl },
      { num: 2, t: task2, image: null },
    ];
    let order = 0;
    for (const { num, t, image } of tasks) {
      if (!t.include) {
        if (t.sectionId) {
          const { error: dError } = await supabase.from("exam_sections").delete().eq("id", t.sectionId);
          if (dError) {
            setPublishing(false);
            setError(`Could not remove Task ${num}: ` + dError.message);
            return;
          }
        }
        continue;
      }
      const row = {
        title: `Part ${order + 1}`,
        passage_title: `Writing Task ${num}`,
        passage_text: t.prompt.trim(),
        image_url: image,
        task_number: num,
        order_index: order,
      };
      const { error: sError } = t.sectionId
        ? await supabase.from("exam_sections").update(row).eq("id", t.sectionId)
        : await supabase.from("exam_sections").insert({ assignment_id: assignmentId, ...row });
      if (sError) {
        setPublishing(false);
        setError(`Assignment saved, but Task ${num} failed to save: ` + sError.message);
        return;
      }
      order++;
    }

    setPublishing(false);
    showToast?.(editAssignmentId ? "Writing assignment updated" : "Writing assignment published");
    setScreen(returnTo || { name: "class", classId });
  }

  // Livraison 76 — the same page in the three-column layout (see
  // BuilderLayout). Inputs, buttons and handlers are unchanged.
  const hasWork = Boolean(task1.prompt.trim() || task2.prompt.trim() || task1.imageFile);
  const guard = makeLeaveGuard(hasWork && !publishing);
  const crumbs = useBuilderCrumbs({ classId, returnTo, setScreen, guard, here: editAssignmentId ? "Edit Writing assignment" : "New Writing assignment" });

  if (loadingExisting) {
    return (
      <div className="page page-wide">
        {loadFailed === "gone"
          ? <p className="empty-inline">This assignment no longer exists.</p>
          : loadFailed
            ? <LoadFailed what="this assignment" onRetry={() => setLoadTry((n) => n + 1)} />
            : <p className="empty-inline">Loading assignment…</p>}
      </div>
    );
  }

  const shownImage = task1.imagePreview || task1.imageUrl;

  const minutesOk = parseInt(timeLimit, 10) >= 1;
  const checklist = [
    { label: "At least one task ticked", ok: included.length > 0 },
    ...(task1.include ? [{ label: "Task 1: question", ok: Boolean(task1.prompt.trim()) }] : []),
    ...(task2.include ? [{ label: "Task 2: question", ok: Boolean(task2.prompt.trim()) }] : []),
    { label: "Time limit set", ok: minutesOk },
  ];
  const publishButton = (
    <button className="btn-primary" disabled={!canPublish || publishing} onClick={publish}>
      {publishing ? "Saving…" : editAssignmentId ? "Save changes" : "Publish assignment"}
    </button>
  );

  return (
    <BuilderLayout
      crumbs={crumbs}
      eyebrow={editAssignmentId ? "Structured Writing · editing" : "Structured Writing · not published yet"}
      heading={editAssignmentId ? "Edit Writing assignment" : "New Writing assignment"}
      sub={title.trim() ? title.trim() : "Name it in Settings — or a name is given automatically."}
      actions={publishButton}
      nav={
        <PartsNav
          items={[
            ...(task1.include ? [{ id: "wtask-1", label: "Writing Task 1", sub: `${task1.prompt.trim() ? "question ✓" : "no question yet"}${shownImage ? " · image" : ""}`, ok: Boolean(task1.prompt.trim()) }] : []),
            ...(task2.include ? [{ id: "wtask-2", label: "Writing Task 2", sub: task2.prompt.trim() ? "question ✓" : "no question yet", ok: Boolean(task2.prompt.trim()) }] : []),
          ]}
        />
      }
      settings={
        <>
          <label className="field-label">Title (optional)</label>
          <input className="field-input" placeholder="e.g. IELTS Academic Writing — Practice Test 1" value={title} onChange={(e) => setTitle(e.target.value)} />

          <div className="bl-row2">
            <div>
              <label className="field-label">Due date (optional)</label>
              <input type="date" className="field-input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <div>
              <label className="field-label">Due time (optional)</label>
              <input type="time" className="field-input" value={dueTime} onChange={(e) => setDueTime(e.target.value)} />
            </div>
          </div>
          <label className="field-label">Time limit, minutes</label>
          <input type="number" min="1" className="field-input" placeholder="e.g. 60" value={timeLimit} onChange={(e) => setTimeLimit(e.target.value)} />

          <label className="field-label" style={{ marginTop: 14 }}>Tasks in this assignment</label>
          <label className="checkbox-row">
            <input type="checkbox" checked={task1.include} onChange={(e) => setTask1((t) => ({ ...t, include: e.target.checked }))} />
            Writing Task 1
          </label>
          <label className="checkbox-row" style={{ marginTop: 6 }}>
            <input type="checkbox" checked={task2.include} onChange={(e) => setTask2((t) => ({ ...t, include: e.target.checked }))} />
            Writing Task 2
          </label>
          <p className="field-hint" style={{ marginTop: 2 }}>
            {included.length === 0
              ? "Tick at least one task."
              : included.length === 2
              ? "Students will see two parts (Part 1 = Task 1, Part 2 = Task 2) with a bar to switch between them."
              : `Students will see a single screen with Writing Task ${included[0]} only.`}
          </p>
        </>
      }
      checklist={<Checklist items={checklist} />}
      footer={
        <>
          {error && <div className="field-error" style={{ marginTop: 12 }}>{error}</div>}
          <div className="qe-builder-actions">{publishButton}</div>
        </>
      }
    >
        {task1.include && (
          <div id="wtask-1" className="feedback-panel qe-writing-task-block">
            <h3 className="section-title" style={{ margin: 0 }}>Writing Task 1</h3>

            <label className="field-label" style={{ marginTop: 14 }}>Question shown to students</label>
            <textarea
              className="field-input textarea"
              style={{ minHeight: 140 }}
              placeholder={"e.g. You should spend about 20 minutes on this task.\n\nThe chart below shows… Summarise the information by selecting and reporting the main features, and make comparisons where relevant.\n\nWrite at least 150 words."}
              value={task1.prompt}
              onChange={(e) => setTask1((t) => ({ ...t, prompt: e.target.value }))}
            />

            <label className="field-label" style={{ marginTop: 14 }}>Image (chart, graph, map, diagram…)</label>
            {shownImage ? (
              <div className="qe-writing-image-preview">
                <StoredImg src={shownImage} alt="Writing Task 1" />
                <button type="button" className="btn-ghost" onClick={removeImage}><X size={13} /> Remove image</button>
              </div>
            ) : (
              <label className="qe-writing-image-drop">
                <ImagePlus size={18} />
                <span>Upload image</span>
                <input key={fileInputKey} type="file" accept="image/*" onChange={pickImage} style={{ display: "none" }} />
              </label>
            )}
            <p className="field-hint" style={{ marginTop: 6 }}>Optional. The image fills the left side of the student's screen; they can zoom in and out.</p>
          </div>
        )}

        {task2.include && (
          <div id="wtask-2" className="feedback-panel qe-writing-task-block">
            <h3 className="section-title" style={{ margin: 0 }}>Writing Task 2</h3>

            <label className="field-label" style={{ marginTop: 14 }}>Question shown to students</label>
            <textarea
              className="field-input textarea"
              style={{ minHeight: 140 }}
              placeholder={"e.g. You should spend about 40 minutes on this task.\n\nSome people believe that… To what extent do you agree or disagree?\n\nGive reasons for your answer and include any relevant examples from your own knowledge or experience.\n\nWrite at least 250 words."}
              value={task2.prompt}
              onChange={(e) => setTask2((t) => ({ ...t, prompt: e.target.value }))}
            />
          </div>
        )}
      {included.length === 0 && <p className="empty-inline">Tick at least one task in Settings.</p>}
    </BuilderLayout>
  );
}
