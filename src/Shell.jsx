import React, { useState, useEffect } from "react";
import { BookOpen, Users, Plus, Check, Clock, AlertTriangle, LogOut, GraduationCap, FileText, ChevronRight, X, Copy, CheckCircle2, Headphones, PenLine, Mic, ListChecks, ArrowLeft, Loader2, Timer, Highlighter, Maximize, Minimize } from "lucide-react";
import { TeacherHome } from "./features/assignment-hub/TeacherHome";
import { TeacherDashboard } from "./features/assignment-hub/TeacherDashboard";
import { ClassDetail } from "./features/assignment-hub/ClassDetail";
import { AssignmentTeacher } from "./features/assignment-hub/AssignmentTeacher";
import { JoinClass } from "./features/assignment-hub/JoinClass";
import { StudentHome } from "./features/assignment-hub/StudentHome";
import { StudentClasses } from "./features/assignment-hub/StudentClasses";
import { StudentClassDetail } from "./features/assignment-hub/StudentClassDetail";
import { AssignmentStudent } from "./features/assignment-hub/AssignmentStudent";

export function Shell({ profile, userId, onSignOut, screen, setScreen, showToast }) {
  const isTeacher = profile.role === "teacher";
  const [isFullscreen, setIsFullscreen] = useState(false);

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
          {isTeacher && (
            <button className={`nav-item ${screen.name === "dashboard" ? "active" : ""}`} onClick={() => setScreen({ name: "dashboard" })}>
              <Timer size={17} /> Dashboard
            </button>
          )}
          <button className={`nav-item ${screen.name === "home" ? "active" : ""}`} onClick={() => setScreen({ name: "home" })}>
            {isTeacher ? <BookOpen size={17} /> : <ListChecks size={17} />}
            {isTeacher ? "My classes" : "My assignments"}
          </button>
          {!isTeacher && (
            <button className={`nav-item ${screen.name === "student-classes" ? "active" : ""}`} onClick={() => setScreen({ name: "student-classes" })}>
              <BookOpen size={17} /> My Classes
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
        {screen.name === "dashboard" && isTeacher && <TeacherDashboard userId={userId} setScreen={setScreen} />}
        {screen.name === "home" && isTeacher && <TeacherHome userId={userId} setScreen={setScreen} showToast={showToast} />}
        {screen.name === "home" && !isTeacher && <StudentHome userId={userId} setScreen={setScreen} showToast={showToast} />}
        {screen.name === "student-classes" && !isTeacher && <StudentClasses userId={userId} setScreen={setScreen} />}
        {screen.name === "student-class-detail" && !isTeacher && <StudentClassDetail classId={screen.classId} userId={userId} setScreen={setScreen} />}
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
