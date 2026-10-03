import React, { useState, useEffect, useCallback, useRef } from "react";
import { Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { supabase } from "../../supabaseClient";
import { Breadcrumb } from "../../components/DropMenu";
import "./admin.css";

// The administrator's screen (livraison 60). Since livraison 77 it is a
// page of the app (menu on the left), reached from the administrator's
// Profile: « Profile › Administration ». It only reads, apart from the
// Approve / Decline decisions (unchanged).
//
// Everything shown comes from admin_overview(), which the DATABASE refuses
// to anyone who is not an administrator ("Not allowed"): hiding the menu
// entry is only a convenience, never the protection. Students are only
// counted here — their names never leave the database.

function day(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function lastLogin(iso) {
  if (!iso) return "Never";
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return "Today, " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  }
  return day(iso);
}

export function AdminConsole({ profile, setScreen }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: d, error: e } = await supabase.rpc("admin_overview");
    setLoading(false);
    if (e) {
      setError(/Not allowed/i.test(e.message || "") ? "denied" : "failed");
      setData(null);
      return;
    }
    setError("");
    setData(d);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Livraison 61: Approve / Decline a teacher-access request. The row's
  // buttons are disabled while its decision is on its way, and the
  // DATABASE ignores a second decision on the same request (double click,
  // two tabs): it only acts on a request that is still waiting.
  const [deciding, setDeciding] = useState("");   // user_id being decided
  const [notice, setNotice] = useState("");
  const [decided, setDecided] = useState(new Set());   // decided in this screen
  // A ref, not only the state: a second click can arrive before React has
  // re-rendered the disabled button.
  const decidingRef = useRef(false);
  async function decide(req, approve) {
    if (decidingRef.current) return;
    decidingRef.current = true;
    setDeciding(req.user_id);
    setNotice("");
    const { data: d, error: e } = await supabase.rpc("admin_decide_teacher_request", { p_user_id: req.user_id, p_approve: approve });
    if (e) {
      setDeciding("");
      decidingRef.current = false;
      setNotice("Could not save this decision: " + e.message);
      return;
    }
    // Decided: the row leaves the list at once, and the buttons stay
    // locked until the list has been read again from the database.
    setDecided((prev) => new Set(prev).add(req.user_id));
    const result = d?.result;
    setNotice(
      result === "approved" ? `${req.name} now has teacher access. They see it after reloading the page.`
      : result === "declined" ? `${req.name}'s request was declined. They can ask again in 7 days.`
      : result === "not_student" ? `${req.name} already had teacher access. The request is closed.`
      : `This request had already been decided.`
    );
    await load();
    setDecided(new Set());      // the fresh list from the database is the truth again
    setDeciding("");
    decidingRef.current = false;
  }

  const back = () => setScreen({ name: "profile" });
  const teachers = data?.teacher_list || [];
  const requests = (data?.requests || []).filter((r) => !decided.has(r.user_id));
  const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;

  return (
    <div className="page page-dash adm-page">
      <Breadcrumb items={[{ label: "Profile", onClick: back }, { label: "Administration" }]} />
      <div className="ph">
        <div className="ph-main">
          <span className="ph-icon adm-ic"><ShieldCheck size={21} /></span>
          <div>
            <div className="eyebrow">Administrator</div>
            <h1 className="ph-title">Administration</h1>
            <div className="ph-sub">Albukhary International University. Only the administrator can open this page.</div>
          </div>
        </div>
        {data && (
          <div className="ph-actions">
            <button className="btn-ghost" onClick={load} disabled={loading}>
              <RefreshCw size={14} /> {loading ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        )}
      </div>

      {loading && !data && (
        <div className="adm-center"><Loader2 className="spin" size={20} /></div>
      )}

      {error === "denied" && (
        <div className="panel adm-note" role="alert">
          <strong>This page is for the administrator only.</strong>
          <div><button className="btn-primary" style={{ marginTop: 12 }} onClick={back}>Back to my profile</button></div>
        </div>
      )}
      {error === "failed" && (
        <div className="panel adm-note" role="alert">
          <strong>The figures could not be loaded.</strong> Check your internet connection.
          <div><button className="btn-ghost" style={{ marginTop: 12 }} onClick={load}>Try again</button></div>
        </div>
      )}

      {data && (
        <>
          <div className="stat-grid">
            <div className="stat"><div className="stat-l">Teachers</div><div className="stat-v">{data.teachers}</div><div className="stat-d">with teacher access</div></div>
            <div className="stat"><div className="stat-l">Students</div><div className="stat-v">{data.students}</div><div className="stat-d">active in 30 days: {data.students_active_30d} · in no class: {data.students_no_class}</div></div>
            <div className="stat"><div className="stat-l">Classes</div><div className="stat-v">{data.classes}</div><div className="stat-d">all teachers</div></div>
            <div className={`stat ${requests.length > 0 ? "adm-stat-warn" : ""}`}><div className="stat-l">Teacher access requests</div><div className="stat-v">{requests.length}</div><div className="stat-d">{requests.length ? "waiting for you" : "nothing waiting"}</div></div>
          </div>

          <section className="panel">
            <div className="panel-h"><h2>Teacher access requests</h2>{requests.length > 0 && <span className="pill pill-amber">{plural(requests.length, "request")} waiting</span>}</div>
            {notice && <div className="adm-notice" role="status">{notice}</div>}
            {requests.length === 0 ? (
              <p className="empty-inline">No request waiting.</p>
            ) : (
              <div className="dt-wrap adm-table-wrap">
                <table className="dt adm-dt">
                  <thead>
                    <tr><th>Name</th><th className="hide-sm">Email</th><th>Asked</th><th className="adm-th-act"><span className="sr-only">Decision</span></th></tr>
                  </thead>
                  <tbody>
                    {requests.map((r) => (
                      <tr key={r.user_id} className="adm-req">
                        <td>
                          <span className="adm-person">
                            <span className="adm-req-avatar" aria-hidden="true">{(r.name || "?").slice(0, 1).toUpperCase()}</span>
                            <span className="prow-main"><b>{r.name}</b><span className="dt-sub show-sm adm-mail">{r.email}</span></span>
                          </span>
                        </td>
                        <td className="hide-sm dt-sub adm-mail">{r.email}</td>
                        <td className="dt-nowrap">{lastLogin(r.requested_at)}</td>
                        <td className="adm-act">
                          <button className="btn-ghost" disabled={!!deciding} onClick={() => decide(r, false)}>
                            {deciding === r.user_id ? "…" : "Decline"}
                          </button>
                          <button className="btn-primary" disabled={!!deciding} onClick={() => decide(r, true)}>
                            {deciding === r.user_id ? "Saving…" : "Approve"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="panel-note" style={{ margin: "10px 0 0" }}>Approve gives teacher access. The person reloads the page and sees the teacher space. Declined: they can ask again in 7 days.</p>
          </section>

          <section className="panel">
            <div className="panel-h"><h2>Teachers</h2><span className="panel-note">{plural(teachers.length, "teacher")}</span></div>
            {teachers.length === 0 ? (
              <p className="empty-inline">No teacher yet.</p>
            ) : (
              <div className="dt-wrap adm-table-wrap">
                <table className="dt adm-dt adm-table">
                  <thead>
                    <tr><th>Name</th><th className="hide-sm">Email</th><th>Classes</th><th className="hide-sm">Signed up</th><th>Last login</th></tr>
                  </thead>
                  <tbody>
                    {teachers.map((t, i) => (
                      <tr key={i}>
                        <td>
                          <b>{t.name}</b>
                          {t.admin && <span className="adm-pill">ADMIN</span>}
                          <span className="dt-sub show-sm adm-mail">{t.email}</span>
                        </td>
                        <td className="hide-sm dt-sub adm-mail">{t.email}</td>
                        <td>{t.classes}</td>
                        <td className="hide-sm dt-nowrap">{day(t.signed_up)}</td>
                        <td className="dt-nowrap">{lastLogin(t.last_login)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="panel-note" style={{ margin: "10px 0 0" }}>Students are only counted here, never listed.</p>
          </section>
        </>
      )}
    </div>
  );
}
