import React from "react";
import { BookOpen, Users, Plus, Check, Clock, AlertTriangle, LogOut, GraduationCap, FileText, ChevronRight, X, Copy, CheckCircle2, Headphones, PenLine, Mic, ListChecks, ArrowLeft, Loader2, Timer, Highlighter } from "lucide-react";
import { isPdfUrl } from "../lib/utils";

export function AttachmentPreview({ url }) {
  if (!url) return null;
  if (isPdfUrl(url)) {
    return (
      <div className="pdf-embed-wrap">
        <iframe src={url} title="Assignment PDF" className="pdf-embed" />
        <a href={url} target="_blank" rel="noreferrer" className="pdf-embed-fallback">
          <FileText size={13} /> Open in a new tab if the preview doesn't load
        </a>
      </div>
    );
  }
  return <img src={url} alt="Assignment attachment" className="asg-image" />;
}

export function PageHeader({ eyebrow, title, action }) {
  return (
    <div className="page-header">
      <div><div className="eyebrow">{eyebrow}</div><h1 className="page-title">{title}</h1></div>
      {action}
    </div>
  );
}

export function EmptyState({ icon, title, body }) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      <div className="empty-title">{title}</div>
      {body && <div className="empty-body">{body}</div>}
    </div>
  );
}

export function CenterSpinner() { return <div className="center-spin"><Loader2 className="spin" size={20} /></div>; }

export function Modal({ title, children, onClose, wide }) {
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

export function StatusBadge({ status }) {
  if (status === "graded") return <span className="status-badge graded"><CheckCircle2 size={13} /> Graded</span>;
  if (status === "submitted") return <span className="status-badge submitted"><Check size={13} /> Submitted</span>;
  if (status === "in-progress") return <span className="status-badge inprogress"><Timer size={13} /> In progress</span>;
  return <span className="status-badge pending"><AlertTriangle size={13} /> Not submitted</span>;
}

// ---------- Student: join class ----------
