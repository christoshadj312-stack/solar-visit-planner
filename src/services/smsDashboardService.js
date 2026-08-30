import { isSupabaseConfigured, supabase } from "./supabaseClient.js";

export async function listSmsDashboardMessages({ status = "all", limit = 200 } = {}) {
  assertSupabaseConfigured();

  const token = await getAccessToken();

  const params = new URLSearchParams({
    mode: "dashboard",
    status,
    limit: String(limit),
  });

  const response = await fetch(`/api/sms/pending?${params.toString()}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error || "Δεν ήταν δυνατή η φόρτωση των SMS.");
  }

  return {
    jobs: payload.jobs || [],
    summary: payload.summary || {
      total: 0,
      pending: 0,
      sent: 0,
      failed: 0,
      cancelled: 0,
      watching: 0,
      sentToday: 0,
      failedToday: 0,
    },
    generatedAt: payload.generatedAt || "",
  };
}

export async function updateSmsDashboardJobStatus({ jobId, action }) {
  assertSupabaseConfigured();

  const cleanJobId = String(jobId || "").trim();
  const cleanAction = String(action || "").trim();

  if (!cleanJobId) {
    throw new Error("Δεν βρέθηκε το SMS job.");
  }

  if (!["cancel", "send_now", "resend"].includes(cleanAction)) {
    throw new Error("Μη έγκυρη ενέργεια SMS.");
  }

  const token = await getAccessToken();
  const params = new URLSearchParams({ mode: "dashboard" });

  const response = await fetch(`/api/sms/pending?${params.toString()}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      id: cleanJobId,
      action: cleanAction,
    }),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      payload.error || "Δεν ήταν δυνατή η αλλαγή κατάστασης του SMS."
    );
  }

  return payload;
}

async function getAccessToken() {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError) {
    throw sessionError;
  }

  const token = session?.access_token;

  if (!token) {
    throw new Error("Πρέπει να είσαι συνδεδεμένος για να δεις τα SMS.");
  }

  return token;
}

function assertSupabaseConfigured() {
  if (!isSupabaseConfigured) {
    throw new Error(
      "Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY."
    );
  }
}
