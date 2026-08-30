import { isSupabaseConfigured, supabase } from "./supabaseClient.js";

export async function queueArrivalSoonSms(customerId) {
  return queueArrivalSms({ customerId, mode: "arrival_soon" });
}

export async function queueArrivalEtaSms(customerId, etaTime) {
  return queueArrivalSms({ customerId, mode: "arrival_eta", etaTime });
}

export async function queueArrivalWatchSms(customerId) {
  return queueArrivalSms({ customerId, mode: "arrival_watch" });
}

async function queueArrivalSms({ customerId, mode, etaTime = "" }) {
  if (!isSupabaseConfigured) {
    throw new Error("Supabase is not configured. Arrival SMS cannot be queued.");
  }

  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error) {
    throw error;
  }

  const token = session?.access_token;

  if (!token) {
    throw new Error("Πρέπει να είσαι συνδεδεμένος για να στείλεις SMS άφιξης.");
  }

  const response = await fetch("/api/queue-thank-you-sms", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      mode,
      customerId,
      etaTime,
    }),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      payload.error || "Δεν μπόρεσε να μπει το SMS άφιξης στην ουρά."
    );
  }

  return payload;
}
