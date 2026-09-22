import React, { useState, useEffect } from "react";
import { BookOpen, Users, Plus, Check, Clock, AlertTriangle, LogOut, GraduationCap, FileText, ChevronRight, X, Copy, CheckCircle2, Headphones, PenLine, Mic, ListChecks, ArrowLeft, Loader2, Timer, Highlighter, Maximize, Minimize, User, Menu, ShieldCheck } from "lucide-react";
import { TeacherHome } from "./features/assignment-hub/TeacherHome";
import { TeacherDashboard } from "./features/assignment-hub/TeacherDashboard";
import { ClassDetail } from "./features/assignment-hub/ClassDetail";
import { AssignmentTeacher } from "./features/assignment-hub/AssignmentTeacher";
import { JoinClass } from "./features/assignment-hub/JoinClass";
import { StudentHome } from "./features/assignment-hub/StudentHome";
import { StudentClasses } from "./features/assignment-hub/StudentClasses";
import { StudentClassDetail } from "./features/assignment-hub/StudentClassDetail";
import { Profile } from "./features/assignment-hub/Profile";
import { AssignmentOpenBridge } from "./features/question-engine/AssignmentOpenBridge";
import { TeacherReadingBuilder } from "./features/question-engine/TeacherReadingBuilder";
import { TeacherListeningBuilder } from "./features/question-engine/TeacherListeningBuilder";
import { TestImporter } from "./features/question-engine/TestImporter";
import { ExamSessionsHome } from "./features/exam-sessions/ExamSessionsHome";
import { ExamSessionDetail } from "./features/exam-sessions/ExamSessionDetail";
import { StudentExamSession } from "./features/exam-sessions/StudentExamSession";
import { useIsCompact } from "./features/question-engine/useViewport";
import { TeacherWritingBuilder } from "./features/question-engine/TeacherWritingBuilder";
import { TeacherSpeakingBuilder } from "./features/question-engine/TeacherSpeakingBuilder";
import "./features/question-engine/reading-builder.css";
import "./features/question-engine/listening.css";
import "./features/question-engine/writing.css";
import "./features/question-engine/speaking.css";
import "./features/exam-sessions/exam-sessions.css";

export function Shell({ profile, setProfile, userId, onSignOut, screen, setScreen, showToast }) {
  const isTeacher = profile.role === "teacher";
  const [isFullscreen, setIsFullscreen] = useState(false);

  // On a phone the blue menu no longer fits across the top: it needed
  // 558px on a 390px screen, so "Join a class", "Full screen" and
  // "Sign out" fell off the right edge with no way to reach them.
  // Below 760px it becomes a drawer opened from the menu button, the
  // same gesture as inside an exam. 760px is the width the old
  // horizontal band already switched at, so nothing changes above it.
  const compactMenu = useIsCompact(760);
  const [menuOpen, setMenuOpen] = useState(false);

  // Leaving a screen (or growing back to a computer-sized window)
  // always closes the drawer, so it can never stay over the page.
  useEffect(() => { setMenuOpen(false); }, [screen.name, compactMenu]);

  useEffect(() => {
    function onFsChange() { setIsFullscreen(!!document.fullscreenElement); }
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  function toggleFullscreen() {
    // Only ever triggered by a real click, per browser security rules —
    // fullscreen can never be activated automatically.
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.();
    }
  }

  return (
    <div className={`shell ${compactMenu && menuOpen ? "menu-open" : ""}`}>
      {compactMenu && menuOpen && <div className="app-menu-backdrop" onClick={() => setMenuOpen(false)} />}
      {/* Any button in the menu closes the drawer, so the page is never
          left hidden behind it after a choice. */}
      <aside className="sidebar" onClick={(e) => { if (compactMenu && e.target.closest("button")) setMenuOpen(false); }}>
        <div className="brand">
          <div className="brand-mark">AIU</div>
          <div className="brand-text">Assignment Hub</div>
          {compactMenu && (
            <button className="app-menu-close" onClick={() => setMenuOpen(false)} title="Close the menu" aria-label="Close the menu">
              <X size={17} />
            </button>
          )}
        </div>

        <button className="profile-card" onClick={() => setScreen({ name: "profile" })} style={{ border: "none", width: "100%", textAlign: "left", cursor: "pointer" }}>
          <div className="avatar">{profile.name.slice(0, 1).toUpperCase()}</div>
          <div>
            <div className="profile-name">{profile.name}</div>
            <div className="profile-role">{isTeacher ? "Teacher" : "Student"}</div>
          </div>
        </button>

        <nav className="nav">
          <button className={`nav-item ${screen.name === "profile" ? "active" : ""}`} onClick={() => setScreen({ name: "profile" })}>
            <User size={17} /> Profile
          </button>
          {isTeacher && (
            <button className={`nav-item ${screen.name === "dashboard" ? "active" : ""}`} onClick={() => setScreen({ name: "dashboard" })}>
              <Timer size={17} /> Dashboard
            </button>
          )}
          <button className={`nav-item ${screen.name === "home" ? "active" : ""}`} onClick={() => setScreen({ name: "home" })}>
            {isTeacher ? <BookOpen size={17} /> : <ListChecks size={17} />}
            {isTeacher ? "My classes" : "My assignments"}
          </button>
          {isTeacher && (
            <button className={`nav-item ${screen.name === "exams" || screen.name === "exam-session" ? "active" : ""}`} onClick={() => setScreen({ name: "exams" })}>
              <ShieldCheck size={17} /> Exams
            </button>
          )}
          {!isTeacher && (
            <button className={`nav-item ${screen.name === "student-classes" ? "active" : ""}`} onClick={() => setScreen({ name: "student-classes" })}>
              <BookOpen size={17} /> My Classes
            </button>
          )}
          {!isTeacher && (
            <button className={`nav-item ${screen.name === "student-exam" ? "active" : ""}`} onClick={() => setScreen({ name: "student-exam" })}>
              <ShieldCheck size={17} /> Exam
            </button>
          )}
          {!isTeacher && (
            <button className={`nav-item ${screen.name === "join" ? "active" : ""}`} onClick={() => setScreen({ name: "join" })}>
              <Plus size={17} /> Join a class
            </button>
          )}
        </nav>

        <button className="nav-item" onClick={toggleFullscreen}>
          {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
          {isFullscreen ? "Exit full screen" : "Full screen"}
        </button>

        <button className="nav-item logout" onClick={onSignOut}>
          <LogOut size={16} /> Sign out
        </button>
      </aside>

      <main className="main">
        <div className="app-topbar">
          {compactMenu && (
            <button className="app-menu-btn" onClick={() => setMenuOpen(true)} title="Menu" aria-label="Open the menu">
              <Menu size={18} />
            </button>
          )}
          Assignment Hub
        </div>
        {screen.name === "dashboard" && isTeacher && <TeacherDashboard userId={userId} setScreen={setScreen} />}
        {screen.name === "reading-builder" && isTeacher && (
          <TeacherReadingBuilder classId={screen.classId} teacherId={userId} setScreen={setScreen} showToast={showToast} editAssignmentId={screen.editAssignmentId} returnTo={screen.returnTo} />
        )}
        {screen.name === "listening-builder" && isTeacher && (
          <TeacherListeningBuilder classId={screen.classId} teacherId={userId} setScreen={setScreen} showToast={showToast} editAssignmentId={screen.editAssignmentId} returnTo={screen.returnTo} />
        )}
        {screen.name === "test-importer" && isTeacher && (
          <TestImporter classId={screen.classId} teacherId={userId} skill={screen.skill} setScreen={setScreen} showToast={showToast} returnTo={screen.returnTo} />
        )}
        {screen.name === "writing-builder" && isTeacher && (
          <TeacherWritingBuilder classId={screen.classId} teacherId={userId} setScreen={setScreen} showToast={showToast} editAssignmentId={screen.editAssignmentId} returnTo={screen.returnTo} />
        )}
        {screen.name === "speaking-builder" && isTeacher && (
          <TeacherSpeakingBuilder classId={screen.classId} teacherId={userId} setScreen={setScreen} showToast={showToast} editAssignmentId={screen.editAssignmentId} returnTo={screen.returnTo} />
        )}
        {screen.name === "exams" && isTeacher && <ExamSessionsHome userId={userId} setScreen={setScreen} showToast={showToast} />}
        {screen.name === "exam-session" && isTeacher && (
          <ExamSessionDetail sessionId={screen.sessionId} userId={userId} setScreen={setScreen} showToast={showToast} />
        )}
        {screen.name === "home" && isTeacher && <TeacherHome userId={userId} setScreen={setScreen} showToast={showToast} />}
        {screen.name === "home" && !isTeacher && <StudentHome userId={userId} setScreen={setScreen} showToast={showToast} />}
        {screen.name === "profile" && (
          <Profile profile={profile} setProfile={setProfile} userId={userId} setScreen={setScreen} showToast={showToast} />
        )}
        {screen.name === "student-classes" && !isTeacher && <StudentClasses userId={userId} setScreen={setScreen} />}
        {screen.name === "student-class-detail" && !isTeacher && <StudentClassDetail classId={screen.classId} userId={userId} setScreen={setScreen} showToast={showToast} />}
        {screen.name === "join" && !isTeacher && <JoinClass userId={userId} setScreen={setScreen} showToast={showToast} />}
        {screen.name === "student-exam" && !isTeacher && <StudentExamSession userId={userId} setScreen={setScreen} showToast={showToast} />}
        {screen.name === "class" && isTeacher && <ClassDetail classId={screen.classId} setScreen={setScreen} showToast={showToast} />}
        {screen.name === "assignment-teacher" && isTeacher && (
          <AssignmentTeacher classId={screen.classId} assignmentId={screen.assignmentId} teacherId={userId} setScreen={setScreen} showToast={showToast} returnTo={screen.returnTo} examLocked={screen.examLocked} />
        )}
        {screen.name === "assignment-student" && !isTeacher && (
          <AssignmentOpenBridge userId={userId} classId={screen.classId} assignmentId={screen.assignmentId} setScreen={setScreen} showToast={showToast} />
        )}
      </main>
    </div>
  );
}
