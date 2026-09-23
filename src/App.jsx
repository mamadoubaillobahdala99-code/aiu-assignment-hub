import React, { useState, useEffect, useCallback, useRef } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "./supabaseClient";
import { CSS } from "./styles";
import { AuthScreen } from "./features/auth/AuthScreen";
import { Shell, SCREEN_ROLES } from "./Shell";import "./features/question-engine/question-engine.css";
import "./features/question-engine/multiple-choice.css";
import "./features/question-engine/bulk-paste.css";
import "./features/question-engine/summary-completion.css";
import "./features/question-engine/notes-table-completion.css";
import "./features/question-engine/review.css";
import "./features/question-engine/matching.css";

// ---------------------------------------------------------------------
// The screen, carried in the address bar
//
// It used to live only in this component's memory: refreshing the page
// threw you back to the first screen — even in the middle of a Reading
// paper — and the browser's Back button did nothing at all, because the
// address never changed. It now travels in the address, so a refresh
// lands where you were, Back walks back through the screens, and a link
// can be sent to someone.
//
// The address is written by anyone, so nothing is trusted on the way in:
// only a plain screen name and plain values are read, and Shell sends
// anything it does not recognise (or that belongs to the other role)
// back to the home screen rather than leaving a blank page.
// ---------------------------------------------------------------------
function screenToHash(s) {
  if (!s || !s.name) return "#/home";
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(s)) {
    if (k === "name" || v === undefined || v === null || typeof v === "object") continue;
    params.set(k, String(v));
  }
  const q = params.toString();
  return `#/${s.name}${q ? `?${q}` : ""}`;
}

function hashToScreen(hash) {
  const raw = String(hash || "").replace(/^#\/?/, "");
  if (!raw) return null;
  const [name, query] = raw.split("?");
  // A sign-in link comes back with its own hash ("#access_token=…").
  // It does not look like a screen name, so it is left alone.
  if (!/^[a-z][a-z-]{0,39}$/.test(name)) return null;
  const s = { name };
  for (const [k, v] of new URLSearchParams(query || "")) {
    if (/^[a-zA-Z]{1,24}$/.test(k) && v.length <= 200) s[k] = v;
  }
  return s;
}

// A screen this account has no business on — or a name that does not
// exist — becomes the home screen. The same object is returned when it
// is fine, so React can skip the update entirely.
function allowedScreen(s, isTeacher) {
  const role = SCREEN_ROLES[s?.name];
  if (!role) return { name: "home" };
  if (role === "both" || (role === "teacher") === isTeacher) return s;
  return { name: "home" };
}

export default function App() {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [screen, setScreen] = useState(() =>
    (typeof window !== "undefined" && hashToScreen(window.location.hash)) || { name: "home" }
  );
  const [toast, setToast] = useState(null);

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2400);
  }, []);

  const loadProfile = useCallback(async (userId) => {
    const { data } = await supabase.from("profiles").select("*").eq("id", userId).single();
    setProfile(data || null);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) loadProfile(session.user.id);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) loadProfile(session.user.id);
      else setProfile(null);
    });

    return () => listener.subscription.unsubscribe();
  }, [loadProfile]);

  // Write the current screen into the address. Held back until the
  // session is in hand: a sign-in link arrives with its token in the
  // hash, and overwriting it before Supabase has read it would lose the
  // sign-in. The first write replaces the entry instead of adding one,
  // so Back never lands on an empty address.
  const firstSyncRef = useRef(true);
  useEffect(() => {
    if (loading || !session || !profile) return;
    const next = screenToHash(screen);
    if (window.location.hash === next) { firstSyncRef.current = false; return; }
    if (firstSyncRef.current) window.history.replaceState(null, "", next);
    else window.history.pushState(null, "", next);
    firstSyncRef.current = false;
  }, [screen, loading, session, profile]);

  // The address may name a screen this account cannot be on — typed by
  // hand, or left over from another account on the same computer. The
  // check waits for the profile, since it is the role that decides.
  useEffect(() => {
    if (!profile) return;
    setScreen((s) => allowedScreen(s, profile.role === "teacher"));
  }, [profile]);

  // Back and Forward in the browser.
  //
  // A fragment typed into the address bar raises popstate AND hashchange,
  // in that order. Both are handled, and both go through allowedScreen:
  // correcting afterwards is not enough, because the second event would
  // simply put the refused screen back.
  useEffect(() => {
    const onPop = () => {
      const next = hashToScreen(window.location.hash) || { name: "home" };
      setScreen(profile ? allowedScreen(next, profile.role === "teacher") : next);
    };
    window.addEventListener("popstate", onPop);
    window.addEventListener("hashchange", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("hashchange", onPop);
    };
  }, [profile]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    setScreen({ name: "home" });
  }

  return (
    <div className="app-root">
      <style>{CSS}</style>
      {loading ? (
        <div className="boot"><Loader2 className="spin" size={22} /></div>
      ) : !session || !profile ? (
        <AuthScreen showToast={showToast} />
      ) : (
        <Shell profile={profile} setProfile={setProfile} userId={session.user.id} onSignOut={handleSignOut} screen={screen} setScreen={setScreen} showToast={showToast} />
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
