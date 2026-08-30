import { isSupabaseConfigured, supabase } from "./supabaseClient.js";

export async function getCurrentSession() {
  if (!isSupabaseConfigured) {
    return null;
  }

  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    return data.session;
  } catch (error) {
    console.warn("Unable to restore Supabase session", error);
    return null;
  }
}

export async function signIn(email, password) {
  if (!isSupabaseConfigured) {
    throw new Error("Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.session;
}

export async function signOut() {
  if (!isSupabaseConfigured) {
    return;
  }

  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
