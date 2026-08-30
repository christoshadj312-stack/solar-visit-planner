import { supabase } from "./supabaseClient.js";

export async function queueRouteOptionSms({
  stop,
  visitDate,
  option1Time,
  option2Time,
}) {
  const customerName = String(stop?.full_name || "").trim();
  const customerTitle = normalizeCustomerTitle(stop?.customer_title);
  const smsSalutationName = String(stop?.sms_salutation_name || "").trim();
  const phone = normalizeCyprusPhone(stop?.phone);
  const address = String(stop?.address || "").trim();

  if (!customerName) {
    throw new Error("Συμπλήρωσε όνομα πελάτη.");
  }

  if (!phone) {
    throw new Error("Συμπλήρωσε σωστό κυπριακό τηλέφωνο πελάτη.");
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(visitDate || "")) {
    throw new Error("Διάλεξε σωστή ημερομηνία επίσκεψης.");
  }

  if (!isTime(option1Time) || !isTime(option2Time)) {
    throw new Error("Οι προτεινόμενες ώρες δεν είναι σωστές.");
  }

  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError) {
    throw sessionError;
  }

  const token = session?.access_token;

  if (!token) {
    throw new Error("Πρέπει να είσαι συνδεδεμένος για να στείλεις SMS.");
  }

  const response = await fetch("/api/queue-thank-you-sms", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      mode: "route_options",
      customerName,
      customerTitle,
      smsSalutationName,
      phone,
      address,
      appointmentDate: visitDate,
      option1Time,
      option2Time,
    }),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      payload.error || "Δεν μπόρεσε να μπει το SMS στην ουρά."
    );
  }

  return payload;
}

function normalizeCustomerTitle(value) {
  const normalized = String(value || "").trim().toLowerCase();

  if (
    normalized === "ms" ||
    normalized === "mrs" ||
    normalized === "miss" ||
    normalized === "female" ||
    normalized === "woman" ||
    normalized === "κυρια" ||
    normalized === "κυρία"
  ) {
    return "ms";
  }

  return "mr";
}

function normalizeCyprusPhone(phone = "") {
  const digits = String(phone).replace(/\D/g, "");

  if (digits.startsWith("00357") && digits.length === 13) {
    return `+357${digits.slice(5)}`;
  }

  if (digits.startsWith("357") && digits.length === 11) {
    return `+${digits}`;
  }

  if (digits.length === 8) {
    return `+357${digits}`;
  }

  return "";
}

function isTime(value) {
  return /^\d{2}:\d{2}$/.test(String(value || ""));
}
