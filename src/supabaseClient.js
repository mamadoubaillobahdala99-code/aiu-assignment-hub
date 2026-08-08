import { createClient } from "@supabase/supabase-js";

// This is your project's public URL and "publishable" key.
// Both are safe to be visible in the code — Supabase explicitly
// designs the publishable key to be exposed in browser apps.
// Access control is enforced server-side by Row Level Security (RLS).
const SUPABASE_URL = "https://bwfynibzijxuiitmdrtw.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_OgirLeO-Zp5TgMbyq9y4_Q_d6D57sL3";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});
