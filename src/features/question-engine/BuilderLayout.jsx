import React, { useState, useEffect } from "react";
import { Plus, Check, Circle } from "lucide-react";
import { supabase } from "../../supabaseClient";
import { Breadcrumb } from "../../components/DropMenu";
import { confirmDialog } from "../../lib/confirmDialog";

// Livraison 75 — the page frame shared by the paper builders:
//   header (breadcrumb, title, the main button)
//   left   : the Parts (a click scrolls to that Part; « + Add a part »)
//   centre : the Parts themselves, exactly as before
//   right  : the settings, then « Ready to publish? » and the button again.
// It only ARRANGES what each builder gives it: no state of its own about
// the paper, no database write. Every Part stays on the page (none is
// hidden), so nothing typed in a Part can be lost by moving around.

// Where the breadcrumb leads: the class (or the exam) the paper is built in.
// middle: crumbs between the class (or exam) and this page — e.g. the
// paper being edited.
export function useBuilderCrumbs({ classId, returnTo, setScreen, here, guard, middle = [] }) {
  const [home, setHome] = useState(null);
  useEffect(() => {
    let off = false;
    if (!classId) return;
    supabase.from("classes").select("name, kind").eq("id", classId).maybeSingle().then(({ data }) => {
      if (!off) setHome(data || { name: "", kind: "class" });
    });
    return () => { off = true; };
  }, [classId]);
  const go = (screen) => guard(() => setScreen(screen));
  const inExam = returnTo?.name === "exam-session" || home?.kind === "exam";
  const back = returnTo || { name: "class", classId };
  return inExam
    ? [{ label: "Exams", onClick: go({ name: "exams" }) }, { label: home?.name || "Exam", onClick: go(back) }, ...middle, { label: here }]
    : [{ label: "My classes", onClick: go({ name: "home" }) }, { label: home?.name || "Class", onClick: go(back) }, ...middle, { label: here }];
}

// Leaving a builder with something built asks first (nothing is published
// until « Publish »).
export function makeLeaveGuard(hasWork) {
  return (fn) => async () => {
    if (hasWork && !(await confirmDialog({
      title: "Leave this page?",
      message: "What you built here is not published yet. If you leave now, it will be lost.",
      confirmLabel: "Leave without publishing",
      danger: true,
    }))) return;
    fn();
  };
}

export function PartsNav({ items, onAdd, canAdd, addLabel = "Add a part" }) {
  const [active, setActive] = useState(items[0]?.id || null);
  function go(id) {
    setActive(id);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  return (
    <nav className="bl-parts" aria-label="Parts">
      <div className="bl-label">Parts</div>
      {items.map((it) => (
        <button key={it.id} type="button" className={`bl-part ${active === it.id ? "on" : ""}`} onClick={() => go(it.id)}>
          <span className="bl-part-main">
            <b>{it.label}</b>
            {it.sub && <small>{it.sub}</small>}
          </span>
          {it.ok ? <Check size={14} className="bl-ok" /> : <Circle size={12} className="bl-todo" />}
        </button>
      ))}
      {onAdd && canAdd && (
        <button type="button" className="bl-add" onClick={onAdd}><Plus size={14} /> {addLabel}</button>
      )}
    </nav>
  );
}

export function Checklist({ items }) {
  const done = items.filter((i) => i.ok).length;
  return (
    <div className="bl-check">
      <div className="bl-label">Ready to publish? <span className="bl-count">{done}/{items.length}</span></div>
      {items.map((it, i) => (
        <div key={i} className={`bl-ck ${it.ok ? "ok" : ""}`}>
          <span className="bl-ck-ic">{it.ok ? <Check size={11} /> : null}</span>
          <span>{it.label}</span>
        </div>
      ))}
    </div>
  );
}

export function BuilderLayout({ crumbs, eyebrow, heading, sub, actions, notice, nav, settings, checklist, footer, children }) {
  return (
    <div className="page page-wide bl-page">
      {crumbs && <Breadcrumb items={crumbs} />}
      <div className="ph">
        <div className="ph-main">
          <div>
            <div className="eyebrow">{eyebrow}</div>
            <h1 className="ph-title">{heading}</h1>
            {sub && <div className="ph-sub">{sub}</div>}
          </div>
        </div>
        {actions && <div className="ph-actions">{actions}</div>}
      </div>
      {notice}
      <div className="bl-grid">
        <aside className="bl-left">{nav}</aside>
        <main className="bl-center">{children}</main>
        <aside className="bl-right">
          <div className="panel bl-settings">
            <div className="bl-label">Settings</div>
            {settings}
          </div>
          <div className="panel">
            {checklist}
            {footer}
          </div>
        </aside>
      </div>
    </div>
  );
}

// The steps of a multi-step page (the test import): done ✓, current, next.
export function Stepper({ steps, current }) {
  return (
    <ol className="bl-steps" aria-label="Steps">
      {steps.map((label, i) => (
        <li key={label} className={`bl-step ${i < current ? "done" : i === current ? "now" : ""}`} aria-current={i === current ? "step" : undefined}>
          <span className="bl-step-n">{i < current ? <Check size={12} /> : i + 1}</span>
          <span>{label}</span>
        </li>
      ))}
    </ol>
  );
}
