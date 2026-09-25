import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";

// The site's own confirmation window.
//
// window.confirm() / alert() are drawn by the BROWSER, and every browser
// leaves full screen to show them (Chrome prints "… says" at the top).
// This window is part of the page, so full screen stays on.
//
//   const ok = await confirmDialog({ title, message, confirmLabel, danger });
//   await alertDialog({ title, message });
//
// danger: the action deletes or erases something — the button is red and
// "Cancel" has the focus, so a reflex Enter never deletes anything.
// Escape, the ✕ and a click beside the window all mean "Cancel".

let pushRequest = null;
const waiting = [];

function ensureHost() {
  if (pushRequest || typeof document === "undefined") return;
  const el = document.createElement("div");
  el.id = "confirm-dialog-root";
  document.body.appendChild(el);
  createRoot(el).render(<ConfirmHost />);
}

function ask(request) {
  return new Promise((resolve) => {
    const item = { ...request, resolve };
    if (pushRequest) pushRequest(item);
    else {
      waiting.push(item);
      ensureHost();
    }
  });
}

export function confirmDialog({ title = "Are you sure?", message = "", confirmLabel = "Confirm", cancelLabel = "Cancel", danger = false } = {}) {
  return ask({ kind: "confirm", title, message, confirmLabel, cancelLabel, danger });
}

export function alertDialog({ title = "Something went wrong", message = "", okLabel = "OK" } = {}) {
  return ask({ kind: "alert", title, message, confirmLabel: okLabel }).then(() => undefined);
}

function ConfirmHost() {
  const [queue, setQueue] = useState([]);

  useEffect(() => {
    pushRequest = (item) => setQueue((q) => [...q, item]);
    if (waiting.length) setQueue((q) => [...q, ...waiting.splice(0)]);
    return () => {
      pushRequest = null;
    };
  }, []);

  const current = queue[0];
  const answer = (value) => {
    if (!current) return;
    current.resolve(value);
    setQueue((q) => q.slice(1));
  };

  if (!current) return null;
  return <ConfirmWindow key={queue.length + current.title} request={current} onAnswer={answer} />;
}

function ConfirmWindow({ request, onAnswer }) {
  const confirmRef = useRef(null);
  const cancelRef = useRef(null);
  const isAlert = request.kind === "alert";

  useEffect(() => {
    const target = isAlert || !request.danger ? confirmRef.current : cancelRef.current;
    target?.focus();
    function onKey(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        onAnswer(isAlert ? true : false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [request, isAlert, onAnswer]);

  return (
    <div className="modal-overlay" onClick={() => onAnswer(isAlert ? true : false)}>
      <div className="modal confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-dialog-title" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title" id="confirm-dialog-title">{request.title}</div>
          <button className="modal-close" aria-label="Close" onClick={() => onAnswer(isAlert ? true : false)}>✕</button>
        </div>
        <div className="modal-body">
          {request.message && <p className="confirm-dialog-message">{request.message}</p>}
          <div className="confirm-dialog-actions">
            {!isAlert && (
              <button ref={cancelRef} type="button" className="btn-ghost" onClick={() => onAnswer(false)}>
                {request.cancelLabel}
              </button>
            )}
            <button
              ref={confirmRef}
              type="button"
              className={request.danger ? "btn-primary confirm-dialog-danger" : "btn-primary"}
              onClick={() => onAnswer(true)}
            >
              {request.confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
