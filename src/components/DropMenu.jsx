import React, { useState, useEffect, useRef } from "react";
import { ChevronRight } from "lucide-react";

// Livraison 69 — the two small pieces every teacher page now shares.
//
// DropMenu: a button that opens a short list of actions (the "•••" menu
// and "New assignment ▾"). It closes on a choice, on a click outside and
// on Esc. Dangerous actions go last, in red, and each one still asks for
// confirmation in its own window, as before.
export function DropMenu({ label, className = "btn-ghost", title, align = "right", wide = false, children, disabled }) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);
  return (
    <div className="dm" ref={boxRef}>
      <button type="button" className={className} title={title} aria-label={title} aria-haspopup="menu" aria-expanded={open}
              disabled={disabled} onClick={() => setOpen((v) => !v)}>
        {label}
      </button>
      {open && (
        <div className={`dm-list ${align === "left" ? "dm-left" : ""} ${wide ? "dm-wide" : ""}`} role="menu"
             onClick={(e) => { if (e.target.closest("[data-dm-item]")) setOpen(false); }}>
          {children}
        </div>
      )}
    </div>
  );
}

export function DropMenuItem({ icon, title, hint, danger, onClick, disabled }) {
  return (
    <button type="button" role="menuitem" data-dm-item className={`dm-item ${danger ? "dm-danger" : ""} ${hint ? "dm-rich" : ""}`}
            onClick={onClick} disabled={disabled}>
      {icon && <span className="dm-icon">{icon}</span>}
      <span className="dm-text">
        <span className="dm-title">{title}</span>
        {hint && <span className="dm-hint">{hint}</span>}
      </span>
    </button>
  );
}

export function DropMenuSeparator({ label }) {
  return label ? <div className="dm-label">{label}</div> : <div className="dm-sep" />;
}

// Breadcrumb: "My classes / COGNIS / Honey bees". Every part but the
// last is a link back to that page.
export function Breadcrumb({ items }) {
  return (
    <nav className="crumbs" aria-label="Breadcrumb">
      {items.map((it, i) => (
        <React.Fragment key={i}>
          {i > 0 && <ChevronRight size={13} className="crumb-sep" aria-hidden="true" />}
          {it.onClick && i < items.length - 1
            ? <button type="button" className="crumb-link" onClick={it.onClick}>{it.label}</button>
            : <span className="crumb-here" aria-current={i === items.length - 1 ? "page" : undefined}>{it.label}</span>}
        </React.Fragment>
      ))}
    </nav>
  );
}
