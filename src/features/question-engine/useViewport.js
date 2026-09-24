import { useState, useEffect } from "react";

// Small screens (phones, small tablets in portrait): the exam screen
// switches to one column with tabs, and the black panel becomes a
// drawer. Anything wider keeps the computer layout exactly as it is.
export const COMPACT_MAX_PX = 900;

export function useIsCompact(maxWidth = COMPACT_MAX_PX) {
  const query = `(max-width: ${maxWidth}px)`;
  const [compact, setCompact] = useState(() => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia(query).matches : false));

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia(query);
    const onChange = (e) => setCompact(e.matches);
    setCompact(mq.matches);
    // Safari < 14 only has addListener.
    if (mq.addEventListener) mq.addEventListener("change", onChange);
    else mq.addListener(onChange);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", onChange);
      else mq.removeListener(onChange);
    };
  }, [query]);

  return compact;
}

// On a phone, the on-screen keyboard covers the bottom of the page:
// the window keeps its full height, so an answer box can end up hidden
// behind the keys. visualViewport reports the part that is really
// visible; we publish it as --qe-app-height, and the exam screen uses
// that instead of the full height, so the layout shrinks above the
// keyboard and the answer stays in sight.
export function useVisualViewportHeight(enabled = true) {
  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    const vv = window.visualViewport;
    const root = document.documentElement;
    let lastH = null;

    const apply = () => {
      const h = Math.round(vv ? vv.height : window.innerHeight);
      // Only write when the height really changed: on a phone this
      // runs on every small scroll (the browser's address bar sliding
      // in and out), and rewriting the style each time makes the page
      // flicker.
      if (h !== lastH) {
        lastH = h;
        root.style.setProperty("--qe-app-height", `${h}px`);
      }
      // True while the keyboard (or another overlay) hides part of the
      // page. 120px is well above the height of a browser address bar,
      // so a scroll never looks like a keyboard.
      const shrunk = vv ? window.innerHeight - vv.height > 120 : false;
      root.classList.toggle("qe-keyboard-open", shrunk);
    };

    apply();
    if (vv) {
      vv.addEventListener("resize", apply);
      vv.addEventListener("scroll", apply);
    }
    window.addEventListener("resize", apply);
    window.addEventListener("orientationchange", apply);

    return () => {
      if (vv) {
        vv.removeEventListener("resize", apply);
        vv.removeEventListener("scroll", apply);
      }
      window.removeEventListener("resize", apply);
      window.removeEventListener("orientationchange", apply);
      root.style.removeProperty("--qe-app-height");
      root.classList.remove("qe-keyboard-open");
    };
  }, [enabled]);
}

// Keeps the field being typed in visible above the keyboard.
export function useKeepFocusVisible(containerRef, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const node = containerRef?.current;
    if (!node) return;

    let timer = null;
    const onFocusIn = (e) => {
      const el = e.target;
      if (!el || !/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      // Wait for the keyboard animation before scrolling.
      clearTimeout(timer);
      timer = setTimeout(() => {
        try {
          el.scrollIntoView({ block: "center", behavior: "smooth" });
        } catch {
          el.scrollIntoView(false);
        }
      }, 300);
    };

    node.addEventListener("focusin", onFocusIn);
    return () => {
      clearTimeout(timer);
      node.removeEventListener("focusin", onFocusIn);
    };
  }, [containerRef, enabled]);
}

// A phone, in either orientation.
//
// Deliberately NOT the width alone: a phone held sideways is 844px wide
// and would pass for a small laptop. The smallest side is what gives it
// away. Same rule as isPhoneScreen() in useInvigilation.js, which is how
// a phone is kept out of a real exam.
export function useIsPhone() {
  const read = () => (typeof window === "undefined" ? false : Math.min(window.innerWidth, window.innerHeight) < 600);
  const [phone, setPhone] = useState(read);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const check = () => setPhone(read());
    check();
    window.addEventListener("resize", check);
    window.addEventListener("orientationchange", check);
    return () => {
      window.removeEventListener("resize", check);
      window.removeEventListener("orientationchange", check);
    };
  }, []);

  return phone;
}

// Reports the width of one element, live — for a layout that has to
// follow a panel the student can resize (the exam splitter changes the
// panel, never the window, so a media query cannot see it). Returns null
// until the first measurement.
export function useElementWidth(ref) {
  const [width, setWidth] = useState(null);

  useEffect(() => {
    const el = ref?.current;
    if (!el) return;
    if (typeof ResizeObserver === "undefined") {
      setWidth(el.getBoundingClientRect().width);
      return;
    }
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect?.width;
      if (typeof w === "number") setWidth(w);
    });
    ro.observe(el);
    setWidth(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, [ref]);

  return width;
}
