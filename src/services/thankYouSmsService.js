import { isSupabaseConfigured, supabase } from "./supabaseClient.js";

export async function queueThankYouSms(customerId) {
  if (!isSupabaseConfigured) {
    throw new Error("Supabase is not configured. Thank You SMS cannot be queued.");
  }

  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;

  const token = data.session?.access_token;
  if (!token) {
    throw new Error("You must be signed in to queue a Thank You SMS.");
  }

  const response = await fetch("/api/queue-thank-you-sms", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ customerId })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || "Unable to queue Thank You SMS.");
  }

  return payload;
}