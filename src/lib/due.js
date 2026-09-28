// Livraison 70 — one rule for due dates, used by the teacher's and (next)
// the student's lists, so both always show the same thing:
//   red    — due today, or already late;
//   orange — due within the next 3 days;
//   plain  — later, or no due date.
// A due date without a time means "until the end of that day".

function endOfDue(dateIso, time) {
  if (!dateIso) return null;
  const [y, m, d] = String(dateIso).slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return null;
  let hh = 23, mm = 59;
  if (time && /^\d{1,2}:\d{2}/.test(time)) [hh, mm] = time.split(":").map(Number);
  return new Date(y, m - 1, d, hh, mm, 59);
}

function dayDiff(a, b) {
  const da = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  const db = new Date(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((db - da) / 86400000);
}

export function dueInfo(dateIso, time, now = new Date()) {
  const end = endOfDue(dateIso, time);
  if (!end) return { label: "No due date", tone: "none", days: null, end: null };
  const days = dayDiff(now, end);
  const clock = time ? `, ${String(time).slice(0, 5)}` : "";
  const dateTxt = end.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  if (end < now) return { label: `Late — was due ${dateTxt}${clock}`, tone: "danger", days, end };
  if (days === 0) return { label: `Due today${clock || ", 23:59"}`, tone: "danger", days, end };
  if (days <= 3) return { label: `Due ${dateTxt}${clock}`, tone: "warn", days, end };
  return { label: `Due ${dateTxt}${clock}`, tone: "neutral", days, end };
}
