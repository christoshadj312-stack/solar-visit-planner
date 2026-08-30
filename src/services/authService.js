import { DEMO_SESSION } from "../demo/demoData.js";
import { isSupabaseConfigured, supabase } from "./supabaseClient.js";

export async function getCurrentSession() {
  if (!isSupabaseConfigured) {
    return DEMO_SESSION;
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
    return DEMO_SESSION;
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
