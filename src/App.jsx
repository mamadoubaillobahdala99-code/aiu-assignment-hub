import React, { useState, useEffect, useCallback } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "./supabaseClient";
import { CSS } from "./styles";
import { AuthScreen } from "./features/auth/AuthScreen";
import { Shell } from "./Shell";

export default function App() {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [screen, setScreen] = useState({ name: "home" });
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
        <Shell profile={profile} userId={session.user.id} onSignOut={handleSignOut} screen={screen} setScreen={setScreen} showToast={showToast} />
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
