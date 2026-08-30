import { isSupabaseConfigured, supabase } from "./supabaseClient.js";

export async function listRouteSmsReplies() {
  assertSupabaseConfigured();

  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError) {
    throw userError;
  }

  const userId = userData.user?.id;

  if (!userId) {
    throw new Error("You must be signed in to view SMS replies.");
  }

  const { data, error } = await supabase
    .from("route_sms_requests")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    throw error;
  }

  return data || [];
}

function assertSupabaseConfigured() {
  if (!isSupabaseConfigured) {
    throw new Error(
      "Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY."
    );
  }
}