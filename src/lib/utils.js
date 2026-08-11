import { BookOpen, Users, Plus, Check, Clock, AlertTriangle, LogOut, GraduationCap, FileText, ChevronRight, X, Copy, CheckCircle2, Headphones, PenLine, Mic, ListChecks, ArrowLeft, Loader2, Timer, Highlighter } from "lucide-react";

export function uid(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function makeCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 5; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export const TYPES = {
  Reading: { icon: BookOpen, color: "var(--teal)", timeLimit: 60, targetWords: null },
  Listening: { icon: Headphones, color: "var(--teal)", timeLimit: 40, targetWords: null },
  "Writing Task 1": { icon: PenLine, color: "var(--amber)", timeLimit: 20, targetWords: 150 },
  "Writing Task 2": { icon: PenLine, color: "var(--amber)", timeLimit: 40, targetWords: 250 },
  Speaking: { icon: Mic, color: "var(--amber)", timeLimit: null, targetWords: null },
  Other: { icon: ListChecks, color: "var(--ink-soft)", timeLimit: null, targetWords: null },
};

export function fmtDate(iso) {
  if (!iso) return "No due date";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}
export function fmtDueDateTime(iso, time) {
  const datePart = fmtDate(iso);
  if (!iso || !time) return datePart;
  return `${datePart}, ${time}`;
}

export function daysUntil(iso) {
  if (!iso) return null;
  const now = new Date();
  const due = new Date(iso);
  return Math.ceil((due - now) / (1000 * 60 * 60 * 24));
}

export function wordCount(text) {
  const trimmed = (text || "").trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

export function isPdfUrl(url) {
  return /\.pdf(\?|$)/i.test(url || "");
}
export function isAudioUrl(url) {
  return /\.(mp3|wav|m4a|ogg|aac|webm)(\?|$)/i.test(url || "");
}
