import React, { lazy } from "react";

// Livraison 83 — the teacher's screens (builders, import, editor, exams,
// class and assignment pages, administration) are no longer part of the
// file every visitor downloads: each is fetched the first time it is
// opened (and, for a teacher, quietly in the background after sign-in).
//
// If that fetch fails twice — usually because the site was updated while
// this tab was open, so the old file no longer exists — the screen says
// so and offers to reload, instead of a blank page.
export function lazyScreen(load, name) {
  const fetchIt = () => load().catch(() => new Promise((r) => setTimeout(r, 800)).then(load));
  const Screen = lazy(() => fetchIt().then((m) => ({ default: m[name] })).catch(() => ({ default: ScreenUnavailable })));
  Screen.preload = () => { fetchIt().catch(() => {}); };
  return Screen;
}

function ScreenUnavailable() {
  return (
    <div className="page narrow" role="alert" style={{ textAlign: "center", paddingTop: 60 }}>
      <h1 className="ph-title" style={{ fontSize: 24 }}>This page could not be loaded</h1>
      <p className="muted-p" style={{ margin: "10px auto 18px", maxWidth: 420 }}>
        The site may have just been updated, or the connection dropped. Reload the page to continue.
      </p>
      <button type="button" className="btn-primary" onClick={() => window.location.reload()}>Reload the page</button>
    </div>
  );
}
