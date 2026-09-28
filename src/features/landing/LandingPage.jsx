import React, { useState, useEffect, useRef } from "react";
import { X, Maximize, PenLine, LayoutGrid } from "lucide-react";
import { AuthForm } from "../auth/AuthScreen";
import "./landing.css";

// Livraison 67 — the public home page: what someone who is not logged in
// sees. No logo and no name for now (a real name will come with the
// domain name). "Log in" and "Create account" open the usual form in a
// window over the page; once logged in, nobody sees this page again.
//
// The globe is a drawing in the page itself: no library, no picture to
// download. Its dashed orbits flow and a few dots travel along them;
// everything stands still when the device asks for less motion.

function useReducedMotion() {
  const query = "(prefers-reduced-motion: reduce)";
  const [reduced, setReduced] = useState(() =>
    typeof window !== "undefined" && window.matchMedia ? window.matchMedia(query).matches : false);
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia(query);
    const on = () => setReduced(mq.matches);
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  return reduced;
}

// Two tilted orbits. Each is drawn twice: faint in full behind the globe,
// and its near half again in front of it, so the globe sits inside.
const ORBITS = [
  { cx: 300, cy: 300, rx: 285, ry: 78, tilt: -12, moons: [[0.35, 5], [3.6, 4]] },
  { cx: 300, cy: 280, rx: 250, ry: 120, tilt: 18, moons: [[2.2, 4], [5.2, 3.5]] },
];
const ellipsePath = (o) =>
  `M ${o.cx - o.rx} ${o.cy} a ${o.rx} ${o.ry} 0 1 0 ${2 * o.rx} 0 a ${o.rx} ${o.ry} 0 1 0 ${-2 * o.rx} 0`;

function Globe({ still }) {
  return (
    <div className="lp-globe" aria-hidden="true">
      <svg viewBox="0 0 600 560" fill="none">
        <defs>
          <clipPath id="lp-clip"><circle cx="300" cy="280" r="190" /></clipPath>
          <radialGradient id="lp-shade" cx="40%" cy="35%">
            <stop offset="0" stopColor="#2A5A86" stopOpacity="0.55" />
            <stop offset="1" stopColor="#122A44" stopOpacity="0.15" />
          </radialGradient>
          {ORBITS.map((o, i) => (
            <clipPath key={i} id={`lp-near-${i}`}><rect x="0" y={o.cy} width="600" height="400" /></clipPath>
          ))}
        </defs>
        {ORBITS.map((o, i) => (
          <g key={i} transform={`rotate(${o.tilt} ${o.cx} ${o.cy})`}>
            <path d={ellipsePath(o)} className="lp-orbit lp-orbit-back" />
          </g>
        ))}
        <circle cx="300" cy="280" r="190" fill="url(#lp-shade)" />
        <g clipPath="url(#lp-clip)" className="lp-grid" transform="rotate(-18 300 280)">
          <ellipse cx="300" cy="280" rx="190" ry="40" />
          <ellipse cx="300" cy="200" rx="170" ry="34" />
          <ellipse cx="300" cy="360" rx="170" ry="34" />
          <ellipse cx="300" cy="130" rx="115" ry="22" />
          <ellipse cx="300" cy="430" rx="115" ry="22" />
          <ellipse cx="300" cy="280" rx="30" ry="190" />
          <ellipse cx="300" cy="280" rx="80" ry="190" />
          <ellipse cx="300" cy="280" rx="125" ry="190" />
          <ellipse cx="300" cy="280" rx="162" ry="190" />
          <line x1="300" y1="90" x2="300" y2="470" />
        </g>
        <circle cx="300" cy="280" r="190" className="lp-rim" />
        {ORBITS.map((o, i) => (
          <g key={i} transform={`rotate(${o.tilt} ${o.cx} ${o.cy})`}>
            <path d={ellipsePath(o)} className="lp-orbit lp-orbit-front" clipPath={`url(#lp-near-${i})`} />
            {o.moons.map(([angle, r], k) => (
              still ? (
                <circle key={k} r={r} className="lp-moon"
                        cx={o.cx + o.rx * Math.cos(angle)} cy={o.cy + o.ry * Math.sin(angle)} />
              ) : (
                <circle key={k} r={r} className="lp-moon">
                  <animateMotion dur={`${30 + i * 8}s`} begin={`-${(angle / (2 * Math.PI)) * (30 + i * 8)}s`}
                                 repeatCount="indefinite" path={ellipsePath(o)} />
                </circle>
              )
            ))}
          </g>
        ))}
      </svg>
      <span className="lp-chip" style={{ left: "12%", top: "18%" }}><b style={{ background: "#AE3B47" }}>S</b>Speaking</span>
      <span className="lp-chip" style={{ left: "66%", top: "14%" }}><b style={{ background: "#3D6E8C" }}>R</b>Reading</span>
      <span className="lp-chip" style={{ left: "3%", top: "56%" }}><b style={{ background: "#0E6B5C" }}>L</b>Listening</span>
      <span className="lp-chip" style={{ left: "72%", top: "60%" }}><b style={{ background: "#C97D25" }}>W</b>Writing</span>
    </div>
  );
}

export function LandingPage({ showToast }) {
  const still = useReducedMotion();
  const [authMode, setAuthMode] = useState(null);   // null | "login" | "signup"
  const [opened, setOpened] = useState(0);          // a fresh, empty form each time
  const windowRef = useRef(null);
  const lastButtonRef = useRef(null);

  function openAuth(mode, e) {
    lastButtonRef.current = e?.currentTarget || null;
    setOpened((n) => n + 1);
    setAuthMode(mode);
  }
  function closeAuth() {
    setAuthMode(null);
    // Back to the button that opened the window (keyboard users).
    setTimeout(() => lastButtonRef.current?.focus?.(), 0);
  }

  // The window: Esc closes it, the first field gets the focus.
  useEffect(() => {
    if (!authMode) return;
    const onKey = (e) => { if (e.key === "Escape") closeAuth(); };
    window.addEventListener("keydown", onKey);
    const t = setTimeout(() => windowRef.current?.querySelector("input")?.focus(), 30);
    return () => { window.removeEventListener("keydown", onKey); clearTimeout(t); };
  }, [authMode, opened]);

  return (
    <div className={`lp ${still ? "lp-still" : ""}`}>
      <div className="lp-hero">
        <header className="lp-top">
          <div className="lp-descr">IELTS preparation</div>
          <nav className="lp-nav">
            <button className="lp-toplink" onClick={(e) => openAuth("login", e)}>Log in</button>
          </nav>
        </header>

        <main className="lp-main">
          <div className="lp-text">
            <span className="lp-tag">Reading · Listening · Writing · Speaking</span>
            <h1 className="lp-title">Practise IELTS<br />the way you<br />will <em>sit it</em>.</h1>
            <p className="lp-lead">One place for your IELTS coursework — assignments, timed tests and feedback.</p>
            <p className="lp-sub">Your teachers mark your work — you see exactly where to improve.</p>
            <div className="lp-ctas">
              <button className="lp-btn lp-btn-orange lp-big" onClick={(e) => openAuth("signup", e)}>Create an account</button>
            </div>
            <p className="lp-already">
              Already have an account?{" "}
              <button className="lp-inline-link" onClick={(e) => openAuth("login", e)}>Log in</button>
            </p>
            <p className="lp-small">Teachers: create your account, then ask for teacher access.</p>
          </div>
          <Globe still={still} />
        </main>
      </div>

      <section className="lp-cards">
        <div className="lp-card">
          <div className="lp-ic"><Maximize size={18} /></div>
          <div><h3>Real exam conditions</h3><p>Full screen, one timer, the recording played once — like on the day.</p></div>
        </div>
        <div className="lp-card">
          <div className="lp-ic"><PenLine size={18} /></div>
          <div><h3>Marked by your teachers</h3><p>Band scores and comments on every Writing task, corrected answers for the rest.</p></div>
        </div>
        <div className="lp-card">
          <div className="lp-ic"><LayoutGrid size={18} /></div>
          <div><h3>Everything in one place</h3><p>Your classes, your assignments and your results — on any computer.</p></div>
        </div>
      </section>

      <footer className="lp-foot">
        © {new Date().getFullYear()} · IELTS is a registered trademark of the British Council, IDP IELTS and Cambridge
        University Press &amp; Assessment. This site is not affiliated with, approved or endorsed by them.
      </footer>

      {authMode && (
        <div className="lp-veil" onMouseDown={(e) => { if (e.target === e.currentTarget) closeAuth(); }}>
          <div className="lp-window" role="dialog" aria-modal="true"
               aria-label={authMode === "login" ? "Log in" : "Create account"} ref={windowRef}>
            <button className="lp-close" onClick={closeAuth} aria-label="Close" title="Close"><X size={18} /></button>
            <AuthForm key={opened} showToast={showToast} initialMode={authMode} />
          </div>
        </div>
      )}
    </div>
  );
}
