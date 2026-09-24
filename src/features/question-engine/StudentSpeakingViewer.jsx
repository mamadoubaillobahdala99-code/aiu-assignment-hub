
import React, { useState, useEffect, useCallback, useRef } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, Download, FileText, Image as ImageIcon, Music, File, Menu, X } from "lucide-react";
import { supabase } from "../../supabaseClient";
import { SPEAKING_PARTS, cleanDocuments, fmtSize } from "./speaking";
import { useIsCompact, useVisualViewportHeight } from "./useViewport";
import { useSignedUrl } from "../../lib/storageFiles";

// Structured Speaking — student screen. CONSULT ONLY: topics / cue card /
// questions and the teacher's documents. No recording, no submit.
// Opening it records a "viewed" mark (once) so the teacher can see who
// has looked at it — the database lets a student record only their own view.

const KIND_ICON = { pdf: FileText, image: ImageIcon, audio: Music, docx: File };

function DocumentBlock({ doc }) {
  const Icon = KIND_ICON[doc.kind] || File;
  // Signed link (3 hours), shared by the button, the picture, the player
  // and the PDF frame.
  const [url, renew] = useSignedUrl(doc.url);
  const renewed = useRef(false);
  const renewOnce = () => {
    if (renewed.current) return;
    renewed.current = true;
    renew();
  };
  return (
    <div className="qe-sp-doc">
      <div className="qe-sp-doc-head">
        <Icon size={15} />
        <span className="qe-sp-docname">{doc.name}</span>
        {doc.size > 0 && <span className="qe-sp-docmeta">{fmtSize(doc.size)}</span>}
        <a className="btn-ghost qe-sp-download" href={url || undefined} target="_blank" rel="noopener noreferrer" download={doc.name}>
          <Download size={13} /> {doc.kind === "docx" ? "Download" : "Open"}
        </a>
      </div>
      {url && doc.kind === "image" && <img className="qe-sp-doc-img" src={url} alt={doc.name} onError={renewOnce} />}
      {url && doc.kind === "audio" && <audio className="qe-sp-doc-audio" controls preload="metadata" src={url} onError={renewOnce} />}
      {url && doc.kind === "pdf" && <iframe className="qe-sp-doc-pdf" src={url} title={doc.name} />}
      {doc.kind === "docx" && <p className="qe-sp-doc-note">Word document — download it to read it.</p>}
    </div>
  );
}

export function StudentSpeakingViewer({ userId, assignmentId, setScreen }) {
  const [assignment, setAssignment] = useState(null);
  const [sections, setSections] = useState(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [className, setClassName] = useState("");
  const [teacherName, setTeacherName] = useState("");

  // Phone / small tablet: the black panel becomes a drawer opened from ☰.
  const compact = useIsCompact();
  useVisualViewportHeight(compact);
  useEffect(() => { setSidebarOpen(!compact); }, [compact]);

  const load = useCallback(async () => {
    const { data: a } = await supabase.from("assignments").select("*").eq("id", assignmentId).single();
    setAssignment(a || null);
    if (a?.class_id) {
      const { data: cls } = await supabase.from("classes").select("name, teacher_id").eq("id", a.class_id).single();
      if (cls?.name) setClassName(cls.name);
      if (cls?.teacher_id) {
        const { data: t } = await supabase.from("profiles").select("name").eq("id", cls.teacher_id).single();
        if (t?.name) setTeacherName(t.name);
      }
    }
    const { data: rows } = await supabase
      .from("exam_sections")
      .select("id, title, passage_text, speaking_part, documents, order_index")
      .eq("assignment_id", assignmentId)
      .order("order_index");
    setSections(
      (rows || [])
        .filter((s) => s.speaking_part)
        .map((s) => ({ id: s.id, part: s.speaking_part, text: s.passage_text || "", documents: cleanDocuments(s.documents) }))
    );

    // "Viewed" mark — recorded once, silently; never blocks the screen.
    await supabase
      .from("speaking_views")
      .upsert({ assignment_id: assignmentId, student_id: userId }, { onConflict: "assignment_id,student_id", ignoreDuplicates: true });
  }, [assignmentId, userId]);

  useEffect(() => { load(); }, [load]);

  if (!assignment || sections === null) {
    return (
      <div className="page">
        <button className="back-link" onClick={() => setScreen({ name: "home" })}><ArrowLeft size={14} /> All assignments</button>
        <p className="empty-inline">Loading…</p>
      </div>
    );
  }

  if (sections.length === 0) {
    return (
      <div className="page">
        <button className="back-link" onClick={() => setScreen({ name: "home" })}><ArrowLeft size={14} /> All assignments</button>
        <p className="empty-inline">This Speaking assignment has no content yet.</p>
      </div>
    );
  }

  const active = sections[Math.min(activeIndex, sections.length - 1)];
  const meta = SPEAKING_PARTS[active.part];

  return (
    <div className={`wf-overlay qe-exam-shell ${compact ? "qe-compact" : ""}`}>
      <div className="qe-exam-layout">
        {compact && sidebarOpen && <div className="qe-exam-drawer-backdrop" onClick={() => setSidebarOpen(false)} />}
        <aside className={`qe-exam-sidebar ${sidebarOpen ? "" : "collapsed"} ${compact ? "qe-exam-drawer" : ""}`}>
          {!compact && (
            <button className="qe-exam-sidebar-toggle" onClick={() => setSidebarOpen((v) => !v)} title={sidebarOpen ? "Hide panel" : "Show panel"}>
              {sidebarOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
            </button>
          )}
          {sidebarOpen && (
            <div className="qe-exam-sidebar-inner">
              {teacherName && <div className="qe-exam-teacher-band">{teacherName}</div>}
              {compact && (
                <button className="qe-exam-drawer-close" onClick={() => setSidebarOpen(false)} title="Close">
                  <X size={16} /> Close
                </button>
              )}
              <div className="qe-exam-sidebar-title">Assignment</div>
              {className && (
                <div className="qe-exam-sidebar-section">
                  <div className="qe-exam-sidebar-label">Class</div>
                  <div className="qe-exam-sidebar-value">{className}</div>
                </div>
              )}
              <div className="qe-exam-sidebar-section">
                <div className="qe-exam-sidebar-label">Speaking</div>
                <div className="qe-exam-sidebar-value qe-sp-sidebar-note">Prepare with these topics. Nothing to record or submit.</div>
              </div>
              <button className="qe-exam-sidebar-exit" style={{ marginTop: "auto" }} onClick={() => setScreen({ name: "home" })}>
                <ArrowLeft size={14} /> Exit
              </button>
            </div>
          )}
        </aside>

        <div className="qe-exam-main">
          <div className="app-topbar qe-exam-topbar">
            {compact && (
              <button className="qe-exam-menu-btn" onClick={() => setSidebarOpen(true)} title="Menu" aria-label="Open the menu">
                <Menu size={18} />
              </button>
            )}
            Assignment
          </div>
          <div className="qe-exam-body qe-listening-body">
            <div className="qe-listening-panel qe-sp-panel">
              <p className="qe-part-tag">{assignment.title}</p>
              <h2 className="qe-passage-title">Speaking {meta.label} — {meta.title}</h2>

              {active.text.trim() && (
                active.part === 2 ? (
                  <div className="qe-sp-cuecard">{active.text}</div>
                ) : (
                  <div className="qe-sp-questions">{active.text}</div>
                )
              )}

              {active.documents.length > 0 && (
                <div className="qe-sp-docs">
                  <div className="qe-sp-docs-title">Documents</div>
                  {active.documents.map((d) => <DocumentBlock key={d.url} doc={d} />)}
                </div>
              )}
            </div>
          </div>

          {sections.length > 1 && (
            <div className="qe-nav-bar">
              {sections.map((s, i) => (
                <div
                  key={s.id}
                  className={`qe-nav-part-segment ${i === activeIndex ? "qe-wr-nav-active" : "inactive-part"}`}
                  onClick={() => setActiveIndex(i)}
                >
                  <button className="qe-nav-part-pill qe-wr-nav-pill">
                    <strong>{SPEAKING_PARTS[s.part].label}</strong> · {SPEAKING_PARTS[s.part].title}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
