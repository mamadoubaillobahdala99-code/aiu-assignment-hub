import React, { useState, useEffect, useCallback } from "react";
import {
  BookOpen, Users, Plus, Check, Clock, AlertTriangle, LogOut,
  GraduationCap, FileText, ChevronRight, X, Copy, CheckCircle2,
  Headphones, PenLine, Mic, ListChecks, ArrowLeft, Loader2, Timer, Highlighter
} from "lucide-react";
import { supabase } from "./supabaseClient";

function uid(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
function makeCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 5; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

const TYPES = {
  Reading: { icon: BookOpen, color: "var(--teal)" },
  Listening: { icon: Headphones, color: "var(--teal)" },
  Writing: { icon: PenLine, color: "var(--amber)" },
  Speaking: { icon: Mic, color: "var(--amber)" },
  Other: { icon: ListChecks, color: "var(--ink-soft)" },
};

function fmtDate(iso) {
  if (!iso) return "No due date";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}
function daysUntil(iso) {
  if (!iso) return null;
  const now = new Date();
  const due = new Date(iso);
  return Math.ceil((due - now) / (1000 * 60 * 60 * 24));
}
function wordCount(text) {
  const trimmed = (text || "").trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

export default function App() {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [screen, setScreen] = useState({ name: "home" });
  const [toast, setToast] = useState(null);

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2400);
  }, []);

  const loadProfile = useCallback(async (userId) => {
    const { data } = await supabase.from("profiles").select("*").eq("id", userId).single();
    setProfile(data || null);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) loadProfile(session.user.id);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) loadProfile(session.user.id);
      else setProfile(null);
    });

    return () => listener.subscription.unsubscribe();
  }, [loadProfile]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    setScreen({ name: "home" });
  }

  return (
    <div className="app-root">
      <style>{CSS}</style>
      {loading ? (
        <div className="boot"><Loader2 className="spin" size={22} /></div>
      ) : !session || !profile ? (
        <AuthScreen showToast={showToast} />
      ) : (
        <Shell profile={profile} userId={session.user.id} onSignOut={handleSignOut} screen={screen} setScreen={setScreen} showToast={showToast} />
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

// ---------- Auth ----------
function AuthScreen({ showToast }) {
  const [mode, setMode] = useState("signup"); // signup | login
  const [name, setName] = useState("");
  const [role, setRole] = useState(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit() {
    setErr("");
    setBusy(true);
    if (mode === "signup") {
      if (!name.trim() || !role || !email.trim() || password.length < 6) {
        setErr("Fill in every field. Password must be at least 6 characters.");
        setBusy(false);
        return;
      }
      const { error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { name: name.trim(), role } },
      });
      if (error) setErr(error.message);
      else showToast("Account created");
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) setErr(error.message);
    }
    setBusy(false);
  }

  return (
    <div className="auth">
      <div className="auth-card">
        <div className="auth-eyebrow">ALBUKHARY INTERNATIONAL UNIVERSITY</div>
        <h1 className="auth-title">Assignment Hub</h1>
        <p className="auth-sub">One place for IELTS prep coursework — no more chasing links across WhatsApp, Drive, and Classroom.</p>

        <div className="auth-tabs">
          <button className={`auth-tab ${mode === "signup" ? "active" : ""}`} onClick={() => setMode("signup")}>Create account</button>
          <button className={`auth-tab ${mode === "login" ? "active" : ""}`} onClick={() => setMode("login")}>Log in</button>
        </div>

        {mode === "signup" && (
          <>
            <label className="field-label">Your name</label>
            <input className="field-input" placeholder="e.g. Mamadou Bailo" value={name} onChange={(e) => setName(e.target.value)} />

            <label className="field-label" style={{ marginTop: 14 }}>I am a…</label>
            <div className="role-row">
              <button className={`role-btn ${role === "teacher" ? "active" : ""}`} onClick={() => setRole("teacher")}>
                <GraduationCap size={20} /><span>Teacher</span>
              </button>
              <button className={`role-btn ${role === "student" ? "active" : ""}`} onClick={() => setRole("student")}>
                <Users size={20} /><span>Student</span>
              </button>
            </div>
          </>
        )}

        <label className="field-label" style={{ marginTop: 14 }}>Email</label>
        <input className="field-input" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />

        <label className="field-label" style={{ marginTop: 14 }}>Password</label>
        <input className="field-input" type="password" placeholder="At least 6 characters" value={password} onChange={(e) => setPassword(e.target.value)} />

        {err && <div className="field-error">{err}</div>}

        <button className="btn-primary auth-submit" disabled={busy} onClick={submit}>
          {busy ? "Please wait…" : mode === "signup" ? "Create account" : "Log in"} <ChevronRight size={16} />
        </button>
        {mode === "signup" && (
          <p className="auth-note">A confirmation email may be sent depending on your project settings — check your inbox if login doesn't work right away.</p>
        )}
      </div>
    </div>
  );
}

// ---------- Shell ----------
function Shell({ profile, userId, onSignOut, screen, setScreen, showToast }) {
  const isTeacher = profile.role === "teacher";
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">AIU</div>
          <div className="brand-text">Assignment Hub</div>
        </div>

        <div className="profile-card">
          <div className="avatar">{profile.name.slice(0, 1).toUpperCase()}</div>
          <div>
            <div className="profile-name">{profile.name}</div>
            <div className="profile-role">{isTeacher ? "Teacher" : "Student"}</div>
          </div>
        </div>

        <nav className="nav">
          <button className={`nav-item ${screen.name === "home" ? "active" : ""}`} onClick={() => setScreen({ name: "home" })}>
            {isTeacher ? <BookOpen size={17} /> : <ListChecks size={17} />}
            {isTeacher ? "My classes" : "My assignments"}
          </button>
          {!isTeacher && (
            <button className={`nav-item ${screen.name === "join" ? "active" : ""}`} onClick={() => setScreen({ name: "join" })}>
              <Plus size={17} /> Join a class
            </button>
          )}
        </nav>

        <button className="nav-item logout" onClick={onSignOut}>
          <LogOut size={16} /> Sign out
        </button>
      </aside>

      <main className="main">
        {screen.name === "home" && isTeacher && <TeacherHome userId={userId} setScreen={setScreen} showToast={showToast} />}
        {screen.name === "home" && !isTeacher && <StudentHome userId={userId} setScreen={setScreen} showToast={showToast} />}
        {screen.name === "join" && !isTeacher && <JoinClass userId={userId} setScreen={setScreen} showToast={showToast} />}
        {screen.name === "class" && isTeacher && <ClassDetail classId={screen.classId} setScreen={setScreen} showToast={showToast} />}
        {screen.name === "assignment-teacher" && isTeacher && (
          <AssignmentTeacher classId={screen.classId} assignmentId={screen.assignmentId} setScreen={setScreen} showToast={showToast} />
        )}
        {screen.name === "assignment-student" && !isTeacher && (
          <AssignmentStudent userId={userId} classId={screen.classId} assignmentId={screen.assignmentId} setScreen={setScreen} showToast={showToast} />
        )}
      </main>
    </div>
  );
}

// ---------- Teacher: home ----------
function TeacherHome({ userId, setScreen, showToast }) {
  const [classes, setClasses] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from("classes").select("*").eq("teacher_id", userId).order("created_at", { ascending: false });
    setClasses(data || []);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  async function createClass() {
    if (!name.trim()) return;
    setBusy(true);
    const { error } = await supabase.from("classes").insert({ name: name.trim(), teacher_id: userId, code: makeCode() });
    setBusy(false);
    if (error) { showToast("Could not create class"); return; }
    setShowCreate(false);
    setName("");
    showToast("Class created");
    load();
  }

  if (classes === null) return <CenterSpinner />;

  return (
    <div className="page">
      <PageHeader eyebrow="Teacher" title="My classes" action={
        <button className="btn-primary" onClick={() => setShowCreate(true)}><Plus size={16} /> New class</button>
      } />

      {classes.length === 0 ? (
        <EmptyState icon={<BookOpen size={26} />} title="No classes yet" body="Create a class and share the join code with your students to get started." />
      ) : (
        <div className="grid">
          {classes.map((c) => (
            <button key={c.id} className="class-card" onClick={() => setScreen({ name: "class", classId: c.id })}>
              <div className="class-card-top">
                <div className="class-card-name">{c.name}</div>
                <ChevronRight size={16} className="chev" />
              </div>
              <div className="class-card-code">CODE <span>{c.code}</span></div>
            </button>
          ))}
        </div>
      )}

      {showCreate && (
        <Modal onClose={() => setShowCreate(false)} title="Create a class">
          <label className="field-label">Class name</label>
          <input className="field-input" placeholder="e.g. IELTS Foundation — Batch 3" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          <button className="btn-primary" style={{ marginTop: 16 }} disabled={!name.trim() || busy} onClick={createClass}>
            {busy ? "Creating…" : "Create class"}
          </button>
        </Modal>
      )}
    </div>
  );
}

// ---------- Teacher: class detail ----------
function ClassDetail({ classId, setScreen, showToast }) {
  const [cls, setCls] = useState(null);
  const [roster, setRoster] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [tab, setTab] = useState("assignments");
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    const { data: c } = await supabase.from("classes").select("*").eq("id", classId).single();
    setCls(c || null);
    const { data: r } = await supabase.from("roster").select("id, joined_at, profiles(name)").eq("class_id", classId);
    setRoster((r || []).map((x) => ({ name: x.profiles?.name || "Unknown", joined_at: x.joined_at })));
    const { data: a } = await supabase.from("assignments").select("*").eq("class_id", classId).order("created_at", { ascending: false });
    setAssignments(a || []);
  }, [classId]);

  useEffect(() => { load(); }, [load]);

  function copyCode() {
    if (!cls) return;
    navigator.clipboard?.writeText(cls.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (!cls) return <CenterSpinner />;

  return (
    <div className="page">
      <button className="back-link" onClick={() => setScreen({ name: "home" })}><ArrowLeft size={14} /> All classes</button>

      <PageHeader eyebrow="Class" title={cls.name} action={
        <button className="btn-ghost" onClick={copyCode}>
          {copied ? <CheckCircle2 size={15} /> : <Copy size={15} />} Code: {cls.code}
        </button>
      } />

      <div className="tabs">
        <button className={`tab ${tab === "assignments" ? "active" : ""}`} onClick={() => setTab("assignments")}>Assignments ({assignments.length})</button>
        <button className={`tab ${tab === "roster" ? "active" : ""}`} onClick={() => setTab("roster")}>Students ({roster.length})</button>
      </div>

      {tab === "assignments" && (
        <AssignmentsTab classId={classId} assignments={assignments} onCreated={load} onOpen={(a) => setScreen({ name: "assignment-teacher", classId, assignmentId: a.id })} />
      )}

      {tab === "roster" && (
        roster.length === 0 ? (
          <EmptyState icon={<Users size={26} />} title="No students yet" body={`Share the join code "${cls.code}" with your students.`} />
        ) : (
          <div className="roster-list">
            {roster.map((s, i) => (
              <div key={i} className="roster-row">
                <div className="avatar small">{s.name.slice(0, 1).toUpperCase()}</div>
                <div className="roster-name">{s.name}</div>
                <div className="roster-date">Joined {fmtDate(s.joined_at)}</div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}

function AssignmentsTab({ classId, assignments, onCreated, onOpen }) {
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [type, setType] = useState("Reading");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [timeLimit, setTimeLimit] = useState("");
  const [targetWords, setTargetWords] = useState("");
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [uploadPct, setUploadPct] = useState(null);

  function pickImage(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  }

  async function create() {
    if (!title.trim()) return;
    setBusy(true);

    let image_url = null;
    if (imageFile) {
      setUploadPct(0);
      const ext = imageFile.name.split(".").pop();
      const path = `${classId}/${uid("img")}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("assignment-files").upload(path, imageFile);
      setUploadPct(null);
      if (uploadError) {
        setBusy(false);
        alert("Image upload failed: " + uploadError.message);
        return;
      }
      const { data: pub } = supabase.storage.from("assignment-files").getPublicUrl(path);
      image_url = pub.publicUrl;
    }

    const { error } = await supabase.from("assignments").insert({
      class_id: classId,
      title: title.trim(),
      type,
      description: description.trim(),
      due_date: dueDate || null,
      time_limit_minutes: timeLimit ? parseInt(timeLimit, 10) : null,
      target_word_count: targetWords ? parseInt(targetWords, 10) : null,
      image_url,
    });
    setBusy(false);
    if (error) return;
    setShowCreate(false);
    setTitle(""); setDescription(""); setDueDate(""); setType("Reading"); setTimeLimit(""); setTargetWords("");
    setImageFile(null); setImagePreview(null);
    onCreated();
  }

  return (
    <div>
      <div className="row-right">
        <button className="btn-primary" onClick={() => setShowCreate(true)}><Plus size={16} /> New assignment</button>
      </div>

      {assignments.length === 0 ? (
        <EmptyState icon={<FileText size={26} />} title="No assignments posted" body="Create your first task — Reading, Listening, Writing, Speaking, or anything else." />
      ) : (
        <div className="ticket-list">
          {assignments.map((a) => (
            <TicketCard key={a.id} assignment={{ ...a, dueDate: a.due_date, time_limit_minutes: a.time_limit_minutes }} onClick={() => onOpen(a)} />
          ))}
        </div>
      )}

      {showCreate && (
        <Modal onClose={() => setShowCreate(false)} title="New assignment">
          <label className="field-label">Title</label>
          <input className="field-input" placeholder="e.g. Writing Task 2 — Opinion Essay" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />

          <label className="field-label" style={{ marginTop: 14 }}>Type</label>
          <div className="type-row">
            {Object.keys(TYPES).map((t) => (
              <button key={t} className={`type-chip ${type === t ? "active" : ""}`} onClick={() => setType(t)}>{t}</button>
            ))}
          </div>

          <label className="field-label" style={{ marginTop: 14 }}>Instructions</label>
          <textarea className="field-input textarea" placeholder="Task instructions, prompt text, or a link to the material…" value={description} onChange={(e) => setDescription(e.target.value)} />

          <label className="field-label" style={{ marginTop: 14 }}>Due date</label>
          <input type="date" className="field-input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />

          <label className="field-label" style={{ marginTop: 14 }}>Time limit (optional)</label>
          <input
            type="number"
            min="1"
            className="field-input"
            placeholder="e.g. 60 (minutes) — leave empty for no time limit"
            value={timeLimit}
            onChange={(e) => setTimeLimit(e.target.value)}
          />
          <p className="field-hint">If set, the countdown starts the moment the student opens this assignment — just like the real IELTS test.</p>

          <label className="field-label" style={{ marginTop: 14 }}>Target word count (optional)</label>
          <input
            type="number"
            min="1"
            className="field-input"
            placeholder="e.g. 250 (Writing Task 2) — leave empty to skip"
            value={targetWords}
            onChange={(e) => setTargetWords(e.target.value)}
          />
          <p className="field-hint">Students see a live word counter that turns green once they reach this target.</p>

          <label className="field-label" style={{ marginTop: 14 }}>Attach an image (optional)</label>
          <p className="field-hint" style={{ marginTop: 0, marginBottom: 8 }}>Perfect for a Writing Task 1 chart, graph, or table — students will see it above the instructions.</p>
          <input type="file" accept="image/*" className="field-input" onChange={pickImage} style={{ padding: 8 }} />
          {imagePreview && <img src={imagePreview} alt="Preview" className="image-preview" />}
          {uploadPct !== null && <div className="field-hint">Uploading…</div>}

          <button className="btn-primary" style={{ marginTop: 16 }} disabled={!title.trim() || busy} onClick={create}>
            {busy ? "Posting…" : "Post assignment"}
          </button>
        </Modal>
      )}
    </div>
  );
}

function TicketCard({ assignment, onClick, statusBadge }) {
  const meta = TYPES[assignment.type] || TYPES.Other;
  const Icon = meta.icon;
  const d = daysUntil(assignment.dueDate);
  let dueTone = "neutral";
  if (d !== null) { if (d < 0) dueTone = "danger"; else if (d <= 2) dueTone = "warn"; }
  return (
    <button className="ticket" onClick={onClick}>
      <div className="ticket-main">
        <div className="ticket-icon" style={{ color: meta.color }}><Icon size={18} /></div>
        <div>
          <div className="ticket-title">{assignment.title}</div>
          <div className="ticket-type">{assignment.type}{assignment.className ? ` · ${assignment.className}` : ""}</div>
        </div>
      </div>
      <div className="ticket-stub">
        {assignment.time_limit_minutes && (
          <span className="due-badge timed" style={{ marginRight: 8 }}><Timer size={12} /> {assignment.time_limit_minutes} min</span>
        )}
        {statusBadge || (
          <span className={`due-badge ${dueTone}`}><Clock size={12} /> {assignment.dueDate ? fmtDate(assignment.dueDate) : "No due date"}</span>
        )}
      </div>
    </button>
  );
}

// ---------- Teacher: assignment detail (grading) ----------
function AssignmentTeacher({ classId, assignmentId, setScreen, showToast }) {
  const [assignment, setAssignment] = useState(null);
  const [roster, setRoster] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [active, setActive] = useState(null);
  const [gradeDraft, setGradeDraft] = useState("");
  const [feedbackDraft, setFeedbackDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data: a } = await supabase.from("assignments").select("*").eq("id", assignmentId).single();
    setAssignment(a || null);
    const { data: r } = await supabase.from("roster").select("student_id, profiles(name)").eq("class_id", classId);
    setRoster((r || []).map((x) => ({ id: x.student_id, name: x.profiles?.name || "Unknown" })));
    const { data: s } = await supabase.from("submissions").select("*").eq("assignment_id", assignmentId);
    setSubmissions(s || []);
  }, [classId, assignmentId]);

  useEffect(() => { load(); }, [load]);

  function openGrade(student) {
    const sub = submissions.find((s) => s.student_id === student.id);
    setActive(student);
    setGradeDraft(sub?.grade || "");
    setFeedbackDraft(sub?.feedback || "");
  }

  async function saveGrade() {
    setBusy(true);
    const sub = submissions.find((s) => s.student_id === active.id);
    if (sub) {
      await supabase.from("submissions").update({
        grade: gradeDraft.trim(), feedback: feedbackDraft.trim(), graded_at: new Date().toISOString(),
      }).eq("id", sub.id);
    }
    setBusy(false);
    setActive(null);
    showToast("Feedback saved");
    load();
  }

  if (!assignment) return <CenterSpinner />;
  const meta = TYPES[assignment.type] || TYPES.Other;
  const Icon = meta.icon;

  return (
    <div className="page">
      <button className="back-link" onClick={() => setScreen({ name: "class", classId })}><ArrowLeft size={14} /> Back to class</button>

      <div className="asg-header">
        <div className="asg-icon" style={{ color: meta.color }}><Icon size={22} /></div>
        <div>
          <div className="asg-type">{assignment.type}</div>
          <h1 className="asg-title">{assignment.title}</h1>
          <div className="asg-due"><Clock size={13} /> Due {fmtDate(assignment.due_date)}</div>
        </div>
      </div>
      {assignment.image_url && <img src={assignment.image_url} alt="Assignment attachment" className="asg-image" />}
      {assignment.description && <p className="asg-desc">{assignment.description}</p>}

      <h3 className="section-title">Submissions</h3>
      {roster.length === 0 ? (
        <EmptyState icon={<Users size={24} />} title="No students in this class yet" />
      ) : (
        <div className="sub-list">
          {roster.map((s) => {
            const sub = submissions.find((x) => x.student_id === s.id);
            let status = "pending";
            if (sub?.grade) status = "graded";
            else if (sub?.submitted_at) status = "submitted";
            else if (sub?.started_at) status = "in-progress";
            return (
              <div key={s.id} className="sub-row" onClick={() => openGrade(s)}>
                <div className="avatar small">{s.name.slice(0, 1).toUpperCase()}</div>
                <div className="sub-name">{s.name}</div>
                <StatusBadge status={status} />
                <ChevronRight size={15} className="chev" />
              </div>
            );
          })}
        </div>
      )}

      {active && (
        <Modal onClose={() => setActive(null)} title={active.name} wide>
          {(() => {
            const sub = submissions.find((s) => s.student_id === active.id);
            if (sub?.submitted_at) {
              return (
                <>
                  <div className="field-label">Submitted answer</div>
                  <div className="submission-box">{sub.content}</div>
                  <div className="sub-meta">
                    Submitted {new Date(sub.submitted_at).toLocaleString()}
                    {assignment.target_word_count ? ` · ${wordCount(sub.content)} / ${assignment.target_word_count} words` : ` · ${wordCount(sub.content)} words`}
                  </div>
                </>
              );
            }
            if (sub?.started_at) {
              return <div className="empty-inline">This student has opened the timed task but hasn't submitted yet — check back once the clock runs out.</div>;
            }
            return <div className="empty-inline">No submission yet from this student.</div>;
          })()}

          <label className="field-label" style={{ marginTop: 16 }}>Band / grade</label>
          <input className="field-input" placeholder="e.g. 6.5" value={gradeDraft} onChange={(e) => setGradeDraft(e.target.value)} />

          <label className="field-label" style={{ marginTop: 14 }}>Feedback</label>
          <textarea className="field-input textarea" placeholder="Comments for the student…" value={feedbackDraft} onChange={(e) => setFeedbackDraft(e.target.value)} />

          <button className="btn-primary" style={{ marginTop: 16 }} disabled={busy || !submissions.find((s) => s.student_id === active.id && s.submitted_at)} onClick={saveGrade}>
            {busy ? "Saving…" : "Save feedback"}
          </button>
        </Modal>
      )}
    </div>
  );
}

function StatusBadge({ status }) {
  if (status === "graded") return <span className="status-badge graded"><CheckCircle2 size={13} /> Graded</span>;
  if (status === "submitted") return <span className="status-badge submitted"><Check size={13} /> Submitted</span>;
  if (status === "in-progress") return <span className="status-badge inprogress"><Timer size={13} /> In progress</span>;
  return <span className="status-badge pending"><AlertTriangle size={13} /> Not submitted</span>;
}

// ---------- Student: join class ----------
function JoinClass({ userId, setScreen, showToast }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function join() {
    setErr("");
    if (!code.trim()) return;
    setBusy(true);
    const { data: match } = await supabase.from("classes").select("*").ilike("code", code.trim()).maybeSingle();
    if (!match) {
      setErr("No class found with that code. Double-check with your teacher.");
      setBusy(false);
      return;
    }
    const { error } = await supabase.from("roster").insert({ class_id: match.id, student_id: userId });
    setBusy(false);
    if (error && !error.message.includes("duplicate")) {
      setErr("Could not join this class.");
      return;
    }
    showToast(`Joined ${match.name}`);
    setScreen({ name: "home" });
  }

  return (
    <div className="page narrow">
      <PageHeader eyebrow="Student" title="Join a class" />
      <p className="muted-p">Ask your teacher for the class code, then enter it below.</p>
      <label className="field-label">Class code</label>
      <input className="field-input code-input" placeholder="e.g. A2K9Q" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={5} />
      {err && <div className="field-error">{err}</div>}
      <button className="btn-primary" style={{ marginTop: 16 }} disabled={!code.trim() || busy} onClick={join}>
        {busy ? "Joining…" : "Join class"}
      </button>
    </div>
  );
}

// ---------- Student: home ----------
function StudentHome({ userId, setScreen, showToast }) {
  const [items, setItems] = useState(null);
  const [classCount, setClassCount] = useState(0);

  const load = useCallback(async () => {
    const { data: rosterRows } = await supabase.from("roster").select("class_id, classes(id, name)").eq("student_id", userId);
    const classIds = (rosterRows || []).map((r) => r.class_id);
    setClassCount(classIds.length);
    if (classIds.length === 0) { setItems([]); return; }

    const { data: assignments } = await supabase.from("assignments").select("*").in("class_id", classIds);
    const { data: mySubs } = await supabase.from("submissions").select("*").eq("student_id", userId);

    const combined = (assignments || []).map((a) => {
      const cls = rosterRows.find((r) => r.class_id === a.class_id)?.classes;
      const mine = (mySubs || []).find((s) => s.assignment_id === a.id);
      let status = "pending";
      if (mine?.grade) status = "graded";
      else if (mine?.submitted_at) status = "submitted";
      else if (mine?.started_at) status = "in-progress";
      return { ...a, dueDate: a.due_date, className: cls?.name || "Class", status };
    });
    combined.sort((a, b) => {
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return new Date(a.dueDate) - new Date(b.dueDate);
    });
    setItems(combined);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  if (items === null) return <CenterSpinner />;

  return (
    <div className="page">
      <PageHeader eyebrow="Student" title="My assignments" />
      {classCount === 0 ? (
        <EmptyState icon={<Users size={26} />} title="You haven't joined a class yet" body="Get a join code from your teacher, then join from the sidebar." />
      ) : items.length === 0 ? (
        <EmptyState icon={<FileText size={26} />} title="Nothing posted yet" body="Your teacher hasn't added any assignments to your class(es) yet." />
      ) : (
        <div className="ticket-list">
          {items.map((a) => (
            <TicketCard key={a.id} assignment={a} onClick={() => setScreen({ name: "assignment-student", classId: a.class_id, assignmentId: a.id })} statusBadge={<StatusBadge status={a.status} />} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- Student: assignment detail (submit) ----------
// ---------- Reading passage with click-to-highlight ----------
function ReadingPassage({ assignmentId, userId, text }) {
  const [highlighted, setHighlighted] = useState(new Set());
  const [loaded, setLoaded] = useState(false);

  // split into tokens, keeping whitespace as separate tokens so layout stays natural
  const tokens = React.useMemo(() => text.split(/(\s+)/), [text]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("reading_highlights")
        .select("word_indices")
        .eq("assignment_id", assignmentId)
        .eq("student_id", userId)
        .maybeSingle();
      setHighlighted(new Set(data?.word_indices || []));
      setLoaded(true);
    })();
  }, [assignmentId, userId]);

  async function persist(nextSet) {
    await supabase.from("reading_highlights").upsert(
      { assignment_id: assignmentId, student_id: userId, word_indices: Array.from(nextSet), updated_at: new Date().toISOString() },
      { onConflict: "assignment_id,student_id" }
    );
  }

  function toggleWord(i) {
    setHighlighted((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      persist(next);
      return next;
    });
  }

  if (!loaded) return <div className="asg-desc"><Loader2 className="spin" size={14} /></div>;

  return (
    <div className="reading-passage">
      <div className="reading-hint"><Highlighter size={13} /> Click any word to highlight it while you read.</div>
      <p className="asg-desc reading-text">
        {tokens.map((tok, i) =>
          /^\s+$/.test(tok) ? (
            tok
          ) : (
            <span key={i} className={`hl-word ${highlighted.has(i) ? "hl-active" : ""}`} onClick={() => toggleWord(i)}>
              {tok}
            </span>
          )
        )}
      </p>
    </div>
  );
}

function AssignmentStudent({ userId, classId, assignmentId, setScreen, showToast }) {
  const [assignment, setAssignment] = useState(null);
  const [mySub, setMySub] = useState(null);
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [remainingSec, setRemainingSec] = useState(null);
  const autoSubmitted = React.useRef(false);

  const isTimed = !!assignment?.time_limit_minutes;
  const alreadySubmitted = !!mySub?.submitted_at;

  const load = useCallback(async () => {
    const { data: a } = await supabase.from("assignments").select("*").eq("id", assignmentId).single();
    setAssignment(a || null);

    let { data: sub } = await supabase.from("submissions").select("*").eq("assignment_id", assignmentId).eq("student_id", userId).maybeSingle();

    // For timed assignments, the clock starts the instant the student opens it —
    // so we create the row (with started_at) right away if it doesn't exist yet.
    if (a?.time_limit_minutes && !sub) {
      const { data: created } = await supabase
        .from("submissions")
        .insert({ assignment_id: assignmentId, student_id: userId, content: "", started_at: new Date().toISOString() })
        .select()
        .single();
      sub = created;
    }

    setMySub(sub || null);
    setContent(sub?.content || "");
    setInitializing(false);
  }, [assignmentId, userId]);

  useEffect(() => { load(); }, [load]);

  // countdown tick
  useEffect(() => {
    if (!isTimed || !mySub?.started_at || alreadySubmitted) return;
    const deadline = new Date(mySub.started_at).getTime() + assignment.time_limit_minutes * 60 * 1000;

    function tick() {
      const secs = Math.max(0, Math.round((deadline - Date.now()) / 1000));
      setRemainingSec(secs);
      return secs;
    }
    const secs = tick();
    if (secs <= 0) return; // handled by the effect below
    const interval = setInterval(() => {
      const s = tick();
      if (s <= 0) clearInterval(interval);
    }, 1000);
    return () => clearInterval(interval);
  }, [isTimed, mySub?.started_at, alreadySubmitted, assignment?.time_limit_minutes]);

  // auto-submit the instant time hits zero
  useEffect(() => {
    if (!isTimed || alreadySubmitted || remainingSec === null || remainingSec > 0 || autoSubmitted.current) return;
    autoSubmitted.current = true;
    (async () => {
      await supabase.from("submissions").update({
        content: content.trim(), submitted_at: new Date().toISOString(),
      }).eq("id", mySub.id);
      showToast("Time's up — your answer was submitted automatically");
      load();
    })();
  }, [remainingSec, isTimed, alreadySubmitted]); // eslint-disable-line react-hooks/exhaustive-deps

  async function submit() {
    if (!content.trim()) return;
    setBusy(true);
    if (isTimed && mySub) {
      const { error } = await supabase.from("submissions").update({
        content: content.trim(), submitted_at: new Date().toISOString(),
      }).eq("id", mySub.id);
      setBusy(false);
      if (error) { showToast("Could not submit"); return; }
    } else {
      const { error } = await supabase.from("submissions").upsert(
        { assignment_id: assignmentId, student_id: userId, content: content.trim(), submitted_at: new Date().toISOString(), grade: null, feedback: null, graded_at: null },
        { onConflict: "assignment_id,student_id" }
      );
      setBusy(false);
      if (error) { showToast("Could not submit"); return; }
    }
    showToast("Submitted");
    load();
  }

  if (!assignment || initializing) return <CenterSpinner />;
  const meta = TYPES[assignment.type] || TYPES.Other;
  const Icon = meta.icon;
  const locked = isTimed && alreadySubmitted;
  const mm = remainingSec !== null ? String(Math.floor(remainingSec / 60)).padStart(2, "0") : null;
  const ss = remainingSec !== null ? String(remainingSec % 60).padStart(2, "0") : null;
  const urgent = remainingSec !== null && remainingSec <= 60;

  return (
    <div className="page narrow">
      <button className="back-link" onClick={() => setScreen({ name: "home" })}><ArrowLeft size={14} /> All assignments</button>

      <div className="asg-header">
        <div className="asg-icon" style={{ color: meta.color }}><Icon size={22} /></div>
        <div>
          <div className="asg-type">{assignment.type}</div>
          <h1 className="asg-title">{assignment.title}</h1>
          <div className="asg-due"><Clock size={13} /> Due {fmtDate(assignment.due_date)}</div>
        </div>
      </div>
      {assignment.image_url && <img src={assignment.image_url} alt="Assignment attachment" className="asg-image" />}
      {assignment.description && (
        assignment.type === "Reading"
          ? <ReadingPassage assignmentId={assignmentId} userId={userId} text={assignment.description} />
          : <p className="asg-desc">{assignment.description}</p>
      )}

      {isTimed && !alreadySubmitted && (
        <div className={`timer-panel ${urgent ? "urgent" : ""}`}>
          <Timer size={18} />
          <div>
            <div className="timer-label">Time remaining</div>
            <div className="timer-clock">{mm}:{ss}</div>
          </div>
        </div>
      )}
      {isTimed && alreadySubmitted && (
        <div className="timer-panel done">
          <Timer size={18} />
          <div className="timer-label">Timed task — submitted, no further changes possible.</div>
        </div>
      )}

      {mySub?.grade && (
        <div className="feedback-panel">
          <div className="feedback-band">Band {mySub.grade}</div>
          {mySub.feedback && <p className="feedback-text">{mySub.feedback}</p>}
        </div>
      )}

      <h3 className="section-title">{locked ? "Your submission" : "Write your answer"}</h3>
      <textarea
        className="field-input textarea big"
        placeholder="Write your answer, or paste a link to your file/recording…"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        disabled={locked}
      />
      {(assignment.target_word_count || content.trim()) && (
        <div className={`word-count ${assignment.target_word_count && wordCount(content) >= assignment.target_word_count ? "met" : ""}`}>
          {wordCount(content)} {assignment.target_word_count ? `/ ${assignment.target_word_count} words` : "words"}
        </div>
      )}
      {!locked && (
        <button className="btn-primary" style={{ marginTop: 12 }} disabled={!content.trim() || busy} onClick={submit}>
          {busy ? "Submitting…" : isTimed ? "Submit now" : mySub?.submitted_at ? "Resubmit" : "Submit"}
        </button>
      )}
      {mySub?.submitted_at && <div className="sub-meta" style={{ marginTop: 8 }}>Submitted {new Date(mySub.submitted_at).toLocaleString()}</div>}
    </div>
  );
}

// ---------- shared bits ----------
function PageHeader({ eyebrow, title, action }) {
  return (
    <div className="page-header">
      <div><div className="eyebrow">{eyebrow}</div><h1 className="page-title">{title}</h1></div>
      {action}
    </div>
  );
}
function EmptyState({ icon, title, body }) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      <div className="empty-title">{title}</div>
      {body && <div className="empty-body">{body}</div>}
    </div>
  );
}
function CenterSpinner() { return <div className="center-spin"><Loader2 className="spin" size={20} /></div>; }
function Modal({ title, children, onClose, wide }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className={`modal ${wide ? "wide" : ""}`} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">{title}</div>
          <button className="modal-close" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

// ---------- styles ----------
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Public+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500&display=swap');

:root {
  --paper: #EFEDE5;
  --paper-raised: #F8F7F2;
  --ink: #1B2820;
  --ink-soft: #5B6960;
  --teal: #0E6B5C;
  --teal-soft: #DCEAE4;
  --amber: #C97D25;
  --amber-soft: #F3E3CC;
  --rose: #AE3B47;
  --rose-soft: #F1DCDC;
  --line: #D9D4C4;
  --sidebar: #17251F;
  --sidebar-text: #D9E5DE;
}

* { box-sizing: border-box; }
body { margin: 0; }
.app-root { font-family: 'Public Sans', -apple-system, sans-serif; color: var(--ink); background: var(--paper); min-height: 100vh; width: 100%; }
.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.boot, .center-spin { display: flex; align-items: center; justify-content: center; min-height: 300px; color: var(--teal); }

.auth { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
.auth-card { max-width: 420px; width: 100%; background: var(--paper-raised); border: 1px solid var(--line); border-radius: 14px; padding: 36px 32px; }
.auth-eyebrow { font-family: 'IBM Plex Mono', monospace; font-size: 11px; letter-spacing: 0.08em; color: var(--teal); margin-bottom: 10px; }
.auth-title { font-family: 'Fraunces', serif; font-size: 32px; font-weight: 600; margin: 0 0 8px; }
.auth-sub { color: var(--ink-soft); font-size: 14.5px; line-height: 1.5; margin: 0 0 22px; }
.auth-tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--line); margin-bottom: 20px; }
.auth-tab { background: none; border: none; padding: 8px 4px; margin-right: 20px; font-family: inherit; font-size: 13px; font-weight: 600; color: var(--ink-soft); cursor: pointer; border-bottom: 2px solid transparent; }
.auth-tab.active { color: var(--ink); border-bottom-color: var(--teal); }
.auth-submit { width: 100%; justify-content: center; margin-top: 18px; }
.auth-note { font-size: 12px; color: var(--ink-soft); margin-top: 14px; line-height: 1.5; }

.field-label { display: block; font-size: 12px; font-weight: 600; color: var(--ink-soft); text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 6px; }
.field-input { width: 100%; padding: 11px 13px; border: 1px solid var(--line); border-radius: 8px; background: #fff; font-family: inherit; font-size: 14.5px; color: var(--ink); outline: none; transition: border-color .15s; }
.field-input:focus { border-color: var(--teal); }
.field-input.textarea { min-height: 90px; resize: vertical; line-height: 1.5; }
.field-input.textarea.big { min-height: 160px; }
.field-error { color: var(--rose); font-size: 13px; margin-top: 8px; }
.code-input { font-family: 'IBM Plex Mono', monospace; letter-spacing: 0.15em; text-transform: uppercase; font-size: 18px; text-align: center; }

.role-row { display: flex; gap: 10px; }
.role-btn { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 16px 10px; border: 1.5px solid var(--line); border-radius: 10px; background: #fff; cursor: pointer; color: var(--ink-soft); font-size: 13px; font-weight: 600; transition: all .15s; }
.role-btn.active { border-color: var(--teal); color: var(--teal); background: var(--teal-soft); }

.btn-primary { display: inline-flex; align-items: center; gap: 7px; background: var(--ink); color: #fff; border: none; padding: 11px 18px; border-radius: 8px; font-family: inherit; font-size: 14px; font-weight: 600; cursor: pointer; transition: opacity .15s; }
.btn-primary:hover:not(:disabled) { opacity: 0.85; }
.btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }
.btn-ghost { display: inline-flex; align-items: center; gap: 7px; background: var(--paper-raised); border: 1px solid var(--line); padding: 9px 14px; border-radius: 8px; font-family: 'IBM Plex Mono', monospace; font-size: 12.5px; font-weight: 500; color: var(--ink); cursor: pointer; letter-spacing: 0.03em; }

.shell { display: flex; min-height: 100vh; }
.sidebar { width: 240px; background: var(--sidebar); color: var(--sidebar-text); padding: 22px 16px; display: flex; flex-direction: column; flex-shrink: 0; }
.brand { display: flex; align-items: center; gap: 10px; margin-bottom: 26px; padding: 0 4px; }
.brand-mark { width: 32px; height: 32px; border-radius: 7px; background: var(--teal); color: #fff; display: flex; align-items: center; justify-content: center; font-family: 'IBM Plex Mono', monospace; font-size: 11px; font-weight: 700; }
.brand-text { font-family: 'Fraunces', serif; font-size: 16px; font-weight: 600; color: #fff; }

.profile-card { display: flex; align-items: center; gap: 10px; padding: 10px; background: rgba(255,255,255,0.06); border-radius: 10px; margin-bottom: 20px; }
.avatar { width: 34px; height: 34px; border-radius: 50%; background: var(--amber); color: #1B2820; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 14px; flex-shrink: 0; }
.avatar.small { width: 28px; height: 28px; font-size: 12px; }
.profile-name { font-size: 13.5px; font-weight: 600; color: #fff; }
.profile-role { font-size: 11.5px; color: #9FB2A8; }

.nav { display: flex; flex-direction: column; gap: 3px; flex: 1; }
.nav-item { display: flex; align-items: center; gap: 9px; padding: 10px 11px; border-radius: 8px; background: none; border: none; color: #B9C7BE; font-family: inherit; font-size: 13.5px; font-weight: 500; cursor: pointer; text-align: left; transition: background .12s; }
.nav-item:hover { background: rgba(255,255,255,0.06); }
.nav-item.active { background: var(--teal); color: #fff; }
.nav-item.logout { color: #8AA097; margin-top: auto; }

.main { flex: 1; padding: 40px 44px; min-width: 0; }
.page { max-width: 880px; }
.page.narrow { max-width: 560px; }

.page-header { display: flex; align-items: flex-end; justify-content: space-between; margin-bottom: 26px; gap: 16px; flex-wrap: wrap; }
.eyebrow { font-family: 'IBM Plex Mono', monospace; font-size: 11px; letter-spacing: 0.08em; color: var(--teal); margin-bottom: 4px; text-transform: uppercase; }
.page-title { font-family: 'Fraunces', serif; font-size: 28px; font-weight: 600; margin: 0; }
.muted-p { color: var(--ink-soft); font-size: 14px; margin: -10px 0 20px; }
.section-title { font-family: 'Fraunces', serif; font-size: 17px; font-weight: 600; margin: 26px 0 12px; }
.back-link { display: inline-flex; align-items: center; gap: 6px; background: none; border: none; color: var(--ink-soft); font-family: inherit; font-size: 13px; font-weight: 600; cursor: pointer; margin-bottom: 18px; padding: 0; }
.back-link:hover { color: var(--ink); }
.row-right { display: flex; justify-content: flex-end; margin-bottom: 16px; }

.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 14px; }
.class-card { text-align: left; background: var(--paper-raised); border: 1px solid var(--line); border-radius: 12px; padding: 18px; cursor: pointer; font-family: inherit; transition: border-color .15s; }
.class-card:hover { border-color: var(--teal); }
.class-card-top { display: flex; align-items: center; justify-content: space-between; }
.class-card-name { font-weight: 600; font-size: 15px; }
.chev { color: var(--ink-soft); flex-shrink: 0; }
.class-card-code { font-family: 'IBM Plex Mono', monospace; font-size: 11px; color: var(--ink-soft); margin-top: 10px; letter-spacing: 0.04em; }
.class-card-code span { color: var(--teal); font-weight: 600; }

.tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--line); margin-bottom: 20px; }
.tab { background: none; border: none; padding: 10px 4px; margin-right: 22px; font-family: inherit; font-size: 13.5px; font-weight: 600; color: var(--ink-soft); cursor: pointer; border-bottom: 2px solid transparent; }
.tab.active { color: var(--ink); border-bottom-color: var(--teal); }

.ticket-list { display: flex; flex-direction: column; gap: 10px; }
.ticket { display: flex; align-items: center; justify-content: space-between; background: var(--paper-raised); border: 1px solid var(--line); border-radius: 10px; padding: 14px 0; cursor: pointer; font-family: inherit; text-align: left; position: relative; transition: border-color .15s; width: 100%; }
.ticket:hover { border-color: var(--teal); }
.ticket-main { display: flex; align-items: center; gap: 13px; padding: 0 18px; flex: 1; min-width: 0; }
.ticket-icon { flex-shrink: 0; }
.ticket-title { font-weight: 600; font-size: 14.5px; }
.ticket-type { font-size: 12px; color: var(--ink-soft); margin-top: 2px; }
.ticket-stub { flex-shrink: 0; padding: 0 18px; margin-left: 8px; border-left: 1px dashed var(--line); display: flex; align-items: center; height: 100%; }
.due-badge { display: inline-flex; align-items: center; gap: 5px; font-family: 'IBM Plex Mono', monospace; font-size: 11px; font-weight: 500; padding: 5px 9px; border-radius: 20px; background: var(--paper); color: var(--ink-soft); white-space: nowrap; }
.due-badge.warn { background: var(--amber-soft); color: var(--amber); }
.due-badge.danger { background: var(--rose-soft); color: var(--rose); }
.due-badge.timed { background: var(--sidebar); color: #fff; }

.field-hint { font-size: 12px; color: var(--ink-soft); margin: 6px 0 0; line-height: 1.5; }

.word-count { display: inline-flex; align-items: center; font-family: 'IBM Plex Mono', monospace; font-size: 12px; font-weight: 500; color: var(--ink-soft); background: var(--paper-raised); border: 1px solid var(--line); padding: 5px 10px; border-radius: 20px; margin-top: 8px; }
.word-count.met { color: var(--teal); background: var(--teal-soft); border-color: var(--teal); }

.timer-panel { display: flex; align-items: center; gap: 12px; background: var(--sidebar); color: #fff; border-radius: 10px; padding: 14px 18px; margin: 16px 0; }
.timer-panel.urgent { background: var(--rose); animation: pulse 1s infinite; }
.timer-panel.done { background: var(--paper-raised); color: var(--ink-soft); border: 1px solid var(--line); }
@keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.75; } }
.timer-label { font-size: 11.5px; text-transform: uppercase; letter-spacing: 0.05em; opacity: 0.85; }
.timer-clock { font-family: 'IBM Plex Mono', monospace; font-size: 22px; font-weight: 600; }

.status-badge { display: inline-flex; align-items: center; gap: 5px; font-size: 11.5px; font-weight: 600; padding: 5px 10px; border-radius: 20px; white-space: nowrap; }
.status-badge.pending { background: var(--rose-soft); color: var(--rose); }
.status-badge.submitted { background: var(--amber-soft); color: var(--amber); }
.status-badge.graded { background: var(--teal-soft); color: var(--teal); }
.status-badge.inprogress { background: #E4E1D3; color: var(--ink-soft); }

.asg-header { display: flex; gap: 14px; align-items: flex-start; margin-bottom: 6px; }
.asg-icon { margin-top: 3px; flex-shrink: 0; }
.asg-type { font-family: 'IBM Plex Mono', monospace; font-size: 11px; color: var(--ink-soft); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 3px; }
.asg-title { font-family: 'Fraunces', serif; font-size: 24px; font-weight: 600; margin: 0 0 6px; }
.asg-due { display: flex; align-items: center; gap: 5px; font-size: 12.5px; color: var(--ink-soft); }
.asg-desc { color: var(--ink-soft); font-size: 14px; line-height: 1.6; margin: 14px 0 0; padding: 14px 16px; background: var(--paper-raised); border-radius: 8px; border: 1px solid var(--line); white-space: pre-wrap; }
.asg-image { max-width: 100%; border-radius: 10px; border: 1px solid var(--line); margin: 14px 0 0; display: block; }
.image-preview { max-width: 100%; max-height: 160px; border-radius: 8px; border: 1px solid var(--line); margin-top: 10px; }

.reading-passage { margin-top: 14px; }
.reading-hint { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--teal); font-weight: 600; margin-bottom: 8px; }
.reading-text { cursor: default; }
.hl-word { cursor: pointer; border-radius: 3px; padding: 0 1px; transition: background .1s; }
.hl-word:hover { background: rgba(14,107,92,0.12); }
.hl-word.hl-active { background: var(--amber-soft); color: var(--ink); box-shadow: 0 0 0 1px var(--amber); }

.sub-list { display: flex; flex-direction: column; gap: 8px; }
.sub-row { display: flex; align-items: center; gap: 11px; background: var(--paper-raised); border: 1px solid var(--line); border-radius: 9px; padding: 11px 14px; cursor: pointer; transition: border-color .15s; }
.sub-row:hover { border-color: var(--teal); }
.sub-name { flex: 1; font-weight: 500; font-size: 14px; }
.sub-meta { font-size: 12px; color: var(--ink-soft); }

.roster-list { display: flex; flex-direction: column; gap: 8px; }
.roster-row { display: flex; align-items: center; gap: 11px; background: var(--paper-raised); border: 1px solid var(--line); border-radius: 9px; padding: 11px 14px; }
.roster-name { flex: 1; font-weight: 500; font-size: 14px; }
.roster-date { font-size: 12px; color: var(--ink-soft); }

.submission-box { background: var(--paper); border: 1px solid var(--line); border-radius: 8px; padding: 13px 15px; font-size: 13.5px; line-height: 1.55; white-space: pre-wrap; }
.empty-inline { color: var(--ink-soft); font-size: 13.5px; font-style: italic; }

.feedback-panel { background: var(--teal-soft); border: 1px solid var(--teal); border-radius: 10px; padding: 16px 18px; margin: 18px 0; }
.feedback-band { font-family: 'Fraunces', serif; font-size: 20px; font-weight: 600; color: var(--teal); }
.feedback-text { font-size: 13.5px; color: var(--ink); margin: 8px 0 0; line-height: 1.55; }

.type-row { display: flex; gap: 6px; flex-wrap: wrap; }
.type-chip { padding: 7px 12px; border-radius: 20px; border: 1px solid var(--line); background: #fff; font-family: inherit; font-size: 12.5px; font-weight: 600; color: var(--ink-soft); cursor: pointer; }
.type-chip.active { background: var(--ink); color: #fff; border-color: var(--ink); }

.empty-state { text-align: center; padding: 60px 20px; color: var(--ink-soft); }
.empty-icon { display: inline-flex; align-items: center; justify-content: center; width: 52px; height: 52px; border-radius: 50%; background: var(--paper-raised); border: 1px solid var(--line); margin-bottom: 14px; color: var(--teal); }
.empty-title { font-weight: 600; font-size: 15px; color: var(--ink); margin-bottom: 4px; }
.empty-body { font-size: 13px; max-width: 320px; margin: 0 auto; line-height: 1.5; }

.modal-overlay { position: fixed; inset: 0; background: rgba(23,37,31,0.45); display: flex; align-items: center; justify-content: center; z-index: 50; padding: 20px; }
.modal { background: #fff; border-radius: 14px; width: 100%; max-width: 420px; max-height: 88vh; overflow-y: auto; }
.modal.wide { max-width: 520px; }
.modal-header { display: flex; align-items: center; justify-content: space-between; padding: 18px 20px; border-bottom: 1px solid var(--line); }
.modal-title { font-family: 'Fraunces', serif; font-size: 17px; font-weight: 600; }
.modal-close { background: none; border: none; cursor: pointer; color: var(--ink-soft); padding: 4px; }
.modal-body { padding: 20px; }

.toast { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); background: var(--ink); color: #fff; padding: 11px 20px; border-radius: 30px; font-size: 13.5px; font-weight: 500; z-index: 60; box-shadow: 0 8px 24px rgba(0,0,0,0.2); }

@media (max-width: 760px) {
  .shell { flex-direction: column; }
  .sidebar { width: 100%; flex-direction: row; align-items: center; padding: 12px 16px; gap: 14px; }
  .brand { margin-bottom: 0; }
  .profile-card { display: none; }
  .nav { flex-direction: row; }
  .nav-item.logout { margin-top: 0; margin-left: auto; }
  .main { padding: 24px 18px; }
}
`;
