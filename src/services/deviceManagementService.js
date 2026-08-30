import { isSupabaseConfigured, supabase } from "./supabaseClient.js";

export async function listSmsSenderDevices() {
  assertSupabaseConfigured();

  const token = await getAccessToken();
  const params = new URLSearchParams({ mode: "devices" });

  const response = await fetch(`/api/sms/pending?${params.toString()}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error || "Δεν ήταν δυνατή η φόρτωση των συσκευών.");
  }

  return {
    devices: payload.devices || [],
    summary: payload.summary || {
      total: 0,
      pending: 0,
      approved: 0,
      rejected: 0,
      disabled: 0,
      active: 0,
    },
    generatedAt: payload.generatedAt || "",
  };
}

export async function submitSmsSenderDeviceRequest({
  deviceId,
  deviceName,
  sellerName,
  senderPhone,
}) {
  assertSupabaseConfigured();

  const cleanDeviceId = String(deviceId || "").trim();
  const cleanDeviceName = String(deviceName || "Android device").trim();
  const cleanSellerName = String(sellerName || "").trim();
  const cleanSenderPhone = normalizeSenderPhone(senderPhone);

  if (!cleanDeviceId) {
    throw new Error("Δεν βρέθηκε η Android συσκευή.");
  }

  if (!cleanSenderPhone) {
    throw new Error("Καταχώρισε έγκυρο τηλέφωνο, π.χ. +35799123456.");
  }

  const token = await getAccessToken();
  const params = new URLSearchParams({ mode: "device_request" });

  const response = await fetch(`/api/sms/pending?${params.toString()}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      deviceId: cleanDeviceId,
      deviceName: cleanDeviceName,
      sellerName: cleanSellerName,
      senderPhone: cleanSenderPhone,
    }),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error || "Δεν στάλθηκε το αίτημα σύνδεσης.");
  }

  return payload;
}

export async function updateSmsSenderDevice({ deviceId, action }) {
  assertSupabaseConfigured();

  const cleanDeviceId = String(deviceId || "").trim();
  const cleanAction = String(action || "").trim().toLowerCase();

  if (!cleanDeviceId) {
    throw new Error("Δεν βρέθηκε η συσκευή.");
  }

  if (!["approve", "reject", "deactivate"].includes(cleanAction)) {
    throw new Error("Μη έγκυρη ενέργεια συσκευής.");
  }

  const token = await getAccessToken();
  const params = new URLSearchParams({ mode: "devices" });

  const response = await fetch(`/api/sms/pending?${params.toString()}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      deviceId: cleanDeviceId,
      action: cleanAction,
    }),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error || "Δεν έγινε η αλλαγή στη συσκευή.");
  }

  return payload;
}

async function getAccessToken() {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error) {
    throw error;
  }

  const token = session?.access_token;

  if (!token) {
    throw new Error("Πρέπει να είσαι συνδεδεμένος.");
  }

  return token;
}

export function normalizeSenderPhone(value) {
  let phone = String(value || "")
    .trim()
    .replace(/[\s()-]/g, "");

  if (/^00\d{8,15}$/.test(phone)) {
    phone = `+${phone.slice(2)}`;
  } else if (/^\d{8}$/.test(phone)) {
    phone = `+357${phone}`;
  } else if (/^357\d{8}$/.test(phone)) {
    phone = `+${phone}`;
  }

  if (!/^\+\d{8,15}$/.test(phone)) {
    return null;
  }

  return phone;
}

function assertSupabaseConfigured() {
  if (!isSupabaseConfigured) {
    throw new Error(
      "Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY."
    );
  }
}
