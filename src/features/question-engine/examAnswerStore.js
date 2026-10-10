// =====================================================================
// The answers kept in this browser during an exam (refresh-recovery), and
// the « newest copy wins » merge with the server copy (livraison 88c).
// Livraison 99 — moved out of StudentExamRunner.jsx without any change.
// =====================================================================

const localKey = (userId, assignmentId) => `aiu-exam-answers:${userId}:${assignmentId}`;
export function readLocalAnswers(userId, assignmentId) {
  try {
    const raw = window.localStorage.getItem(localKey(userId, assignmentId));
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}
export function writeLocalAnswers(userId, assignmentId, answers) {
  try {
    window.localStorage.setItem(localKey(userId, assignmentId), JSON.stringify(answers));
  } catch {
    /* storage unavailable: the exam still works, only refresh-recovery is lost */
  }
}
export function clearLocalAnswers(userId, assignmentId) {
  try {
    window.localStorage.removeItem(localKey(userId, assignmentId));
    window.localStorage.removeItem(syncKey(userId, assignmentId));
  } catch {
    /* ignore */
  }
}
// Livraison 88c: what this browser last sent to (or took from) the server:
// the copy, and the SERVER time of that backup. A newer backup on the
// server means another device saved since.
const syncKey = (userId, assignmentId) => `aiu-exam-sync:${userId}:${assignmentId}`;
export function readSync(userId, assignmentId) {
  try {
    const v = JSON.parse(window.localStorage.getItem(syncKey(userId, assignmentId)) || "null");
    return v && typeof v === "object" && typeof v.at === "string" ? { at: v.at, sent: v.sent && typeof v.sent === "object" ? v.sent : {} } : null;
  } catch {
    return null;
  }
}
export function writeSync(userId, assignmentId, at, sent) {
  try {
    if (at) window.localStorage.setItem(syncKey(userId, assignmentId), JSON.stringify({ at, sent: sent || {} }));
  } catch {
    /* storage unavailable */
  }
}
// "2026-10-07T08:13:04.492057+00:00" → milliseconds (fraction cut to 3
// digits, which every browser reads).
export const timeOf = (at) => {
  if (!at || typeof at !== "string") return null;
  const t = Date.parse(at.replace(/(\.\d{3})\d+/, "$1"));
  return Number.isFinite(t) ? t : null;
};
// The same answers always give the same text, whatever the order of the
// keys (the database re-orders them).
export function canon(v) {
  if (Array.isArray(v)) return `[${v.map(canon).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(",")}}`;
  return JSON.stringify(v === undefined ? null : v);
}
// The other device's copy, plus what was changed HERE since this browser
// last synced (base): nothing typed on either device is lost.
export function mergeCopies(server, local, base) {
  const out = { ...server };
  const keys = new Set([...Object.keys(local || {}), ...Object.keys(base || {})]);
  for (const k of keys) {
    if (canon(local?.[k]) === canon(base?.[k])) continue;
    if (local?.[k] === undefined) delete out[k];
    else out[k] = local[k];
  }
  return out;
}
// Only the answers to this paper's questions.
export function onlyKnown(answers, ids) {
  const out = {};
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) return out;
  const known = new Set(ids);
  for (const [qid, v] of Object.entries(answers)) if (known.has(qid)) out[qid] = v;
  return out;
}
