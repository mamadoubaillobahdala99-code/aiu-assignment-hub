import React, { useState, useEffect, useCallback } from "react";
import { BookOpen, Users, Plus, Check, Clock, AlertTriangle, LogOut, GraduationCap, FileText, ChevronRight, X, Copy, CheckCircle2, Headphones, PenLine, Mic, ListChecks, ArrowLeft, Loader2, Timer, Highlighter } from "lucide-react";
import { supabase } from "../../supabaseClient";
import { uid, makeCode, TYPES, fmtDate, fmtDueDateTime, daysUntil, wordCount, isPdfUrl } from "../../lib/utils";
import { AttachmentPreview, PageHeader, EmptyState, CenterSpinner, Modal, StatusBadge } from "../../components/shared";

export function TicketCard({ assignment, onClick, statusBadge }) {
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
          <span className={`due-badge ${dueTone}`}><Clock size={12} /> {assignment.dueDate ? fmtDueDateTime(assignment.dueDate, assignment.due_time) : "No due date"}</span>
        )}
      </div>
    </button>
  );
}

// ---------- Teacher: assignment detail (grading) ----------
