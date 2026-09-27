import React, { useState, useEffect, useCallback } from "react";
import { ArrowLeft, Loader2, RefreshCw } from "lucide-react";
import { supabase } from "../../supabaseClient";
import "./admin.css";

// The administrator's screen (livraison 60). It is a SEPARATE screen, with
// its own bar, not a page inside the teacher space. It only reads.
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

  const back = () => setScreen({ name: "home" });
  const teachers = data?.teacher_list || [];

  return (
    <div className="adm-root">
      <header className="adm-bar">
        <div className="adm-brand">
          <span className="adm-mark">AIU</span>
          <span className="adm-name">Assignment Hub</span>
          <span className="adm-badge">ADMIN</span>
        </div>
        <nav className="adm-tabs" aria-label="Admin sections">
          <span className="adm-tab active">Overview</span>
        </nav>
        <div className="adm-right">
          <span className="adm-who">{profile?.name}</span>
          <button className="adm-back" onClick={back}>
            <ArrowLeft size={14} /> Back to the app
          </button>
        </div>
      </header>

      <main className="adm-main">
        <div className="adm-head">
          <div>
            <h1 className="adm-title">Admin</h1>
            <p className="adm-sub">Albukhary International University. Only the administrator can open this screen.</p>
          </div>
          {data && (
            <button className="btn-ghost" onClick={load} disabled={loading}>
              <RefreshCw size={13} /> Refresh
            </button>
          )}
        </div>

        {loading && !data && (
          <div className="adm-center"><Loader2 className="spin" size={20} /></div>
        )}

        {error === "denied" && (
          <div className="adm-note" role="alert">
            <strong>This screen is for the administrator only.</strong>
            <button className="btn-primary" style={{ marginTop: 12 }} onClick={back}>Back to the app</button>
          </div>
        )}
        {error === "failed" && (
          <div className="adm-note" role="alert">
            <strong>The figures could not be loaded.</strong> Check your internet connection.
            <div><button className="btn-ghost" style={{ marginTop: 12 }} onClick={load}>Try again</button></div>
          </div>
        )}

        {data && (
          <>
            <div className="adm-tiles">
              <div className="adm-tile">
                <div className="adm-tile-label">Teachers</div>
                <div className="adm-tile-num">{data.teachers}</div>
              </div>
              <div className="adm-tile">
                <div className="adm-tile-label">Students</div>
                <div className="adm-tile-num">{data.students}</div>
                <div className="adm-tile-sub">
                  active in the last 30 days: {data.students_active_30d} · not in any class: {data.students_no_class}
                </div>
              </div>
              <div className="adm-tile">
                <div className="adm-tile-label">Classes</div>
                <div className="adm-tile-num">{data.classes}</div>
              </div>
            </div>

            <h2 className="adm-section">Teachers</h2>
            {teachers.length === 0 ? (
              <p className="adm-sub">No teacher yet.</p>
            ) : (
              <div className="adm-table-wrap">
                <table className="adm-table">
                  <thead>
                    <tr><th>Name</th><th>Email</th><th>Classes</th><th>Signed up</th><th>Last login</th></tr>
                  </thead>
                  <tbody>
                    {teachers.map((t, i) => (
                      <tr key={i}>
                        <td>
                          <strong>{t.name}</strong>
                          {t.admin && <span className="adm-pill">ADMIN</span>}
                        </td>
                        <td className="adm-muted">{t.email}</td>
                        <td>{t.classes}</td>
                        <td>{day(t.signed_up)}</td>
                        <td>{lastLogin(t.last_login)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="adm-foot">Students are only counted here, never listed.</p>
          </>
        )}
      </main>
    </div>
  );
}

