import { getServerEnv } from "../../src/server/serverEnv.js";

export default async function handler(request, response) {
  if (request.method !== "POST") {
    return response.status(405).json({ error: "Method not allowed" });
  }

  const configError = validateConfig(request);
  if (configError) {
    return response
      .status(configError.status)
      .json({ error: configError.message });
  }

  try {
    const body = await readJsonBody(request);

    if (String(body.mode || "").trim() === "route_reply") {
      const result = await handleRouteReply(body);
      return response.status(200).json(result);
    }

    if (!body.id) {
      return response.status(400).json({ error: "Missing SMS queue job id." });
    }

    const updatedRows = await updateQueueJob(body.id, {
      status: "sent",
      sent_at: new Date().toISOString(),
      error: null,
    });

    if (updatedRows.length === 0) {
      return response.status(404).json({ error: "SMS queue job not found." });
    }

    return response.status(200).json({ job: updatedRows[0] });
  } catch (error) {
    console.error("Unable to mark SMS job as sent", error);

    return response.status(500).json({
      error: error.message || "Unable to mark SMS job as sent",
    });
  }
}

async function handleRouteReply(body) {
  const phone = normalizeCyprusPhone(body.phone);
  const replyText = String(body.message || body.replyText || "").trim();

  if (!phone) {
    throw new Error("Missing or invalid reply phone.");
  }

  if (!replyText) {
    throw new Error("Missing reply text.");
  }

  const pendingRequest = await findPendingRouteSmsRequest(phone);

  if (!pendingRequest) {
    return {
      matched: false,
      message: "No active route SMS request found for this phone.",
    };
  }

  const parsed = parseRouteReply(
    replyText,
    pendingRequest.option1_time,
    pendingRequest.option2_time
  );

  let appointmentResult = null;
  let customerId = pendingRequest.customer_id || null;

  if (parsed.status === "confirmed" && parsed.selectedTime) {
    appointmentResult = await createOrUpdateAppointmentFromRouteReply(
      pendingRequest,
      parsed.selectedTime
    );

    customerId = appointmentResult?.customer?.id || customerId;
  }

  const routeUpdates = {
    status: parsed.status,
    reply_text: replyText,
    reply_received_at: normalizeReceivedAt(body.receivedAt),
    selected_time: parsed.selectedTime,
    updated_at: new Date().toISOString(),
  };

  if (customerId) {
    routeUpdates.customer_id = customerId;
  }

  const updatedRows = await updateRouteSmsRequest(
    pendingRequest.id,
    routeUpdates
  );

  return {
    matched: true,
    request: updatedRows[0],
    parsed,
    appointment: appointmentResult,
  };
}

async function createOrUpdateAppointmentFromRouteReply(
  routeRequest,
  selectedTime
) {
  const appointmentDate = String(routeRequest.appointment_date || "").trim();
  const appointmentTime = formatTime(selectedTime);

  if (!appointmentDate) {
    throw new Error("Route SMS request is missing appointment_date.");
  }

  if (!appointmentTime) {
    throw new Error("Route SMS request is missing selected appointment time.");
  }

  const existingCustomerId = String(routeRequest.customer_id || "").trim();

  const appointmentPayload = buildAppointmentPayload(
    routeRequest,
    appointmentDate,
    appointmentTime
  );

  if (existingCustomerId) {
    const updatedCustomers = await updateCustomerAppointment(
      existingCustomerId,
      appointmentPayload
    );

    if (updatedCustomers.length > 0) {
      return {
        action: "updated",
        customer: updatedCustomers[0],
      };
    }
  }

  const createdCustomers = await createCustomerAppointment(appointmentPayload);

  if (!createdCustomers.length) {
    throw new Error("Appointment customer was not created.");
  }

  return {
    action: "created",
    customer: createdCustomers[0],
  };
}

function buildAppointmentPayload(routeRequest, appointmentDate, appointmentTime) {
  const latitude = normalizeNullableCoordinate(routeRequest.latitude);
  const longitude = normalizeNullableCoordinate(routeRequest.longitude);

  const payload = {
    user_id: routeRequest.user_id,
    full_name:
      String(routeRequest.customer_name || routeRequest.full_name || "").trim() ||
      "Πελάτης",
    customer_title: normalizeCustomerTitle(routeRequest.customer_title),
    sms_salutation_name: String(routeRequest.sms_salutation_name || "").trim(),
    phone: normalizeCyprusPhone(routeRequest.phone),
    address: String(routeRequest.address || "").trim(),
    status: "Scheduled",
    appointment_date: appointmentDate,
    appointment_time: appointmentTime,
    notes: "Δημιουργήθηκε αυτόματα από απάντηση SMS διαδρομής.",
  };

  if (latitude !== null) {
    payload.latitude = latitude;
  }

  if (longitude !== null) {
    payload.longitude = longitude;
  }

  return payload;
}

async function createCustomerAppointment(payload) {
  return supabaseRequest("/rest/v1/customers?select=*", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: payload,
  });
}

async function updateCustomerAppointment(customerId, payload) {
  const params = new URLSearchParams({
    id: `eq.${customerId}`,
    select: "*",
  });

  return supabaseRequest(`/rest/v1/customers?${params.toString()}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: {
      ...payload,
      updated_at: new Date().toISOString(),
    },
  });
}

async function findPendingRouteSmsRequest(phone) {
  const params = new URLSearchParams({
    select: "*",
    phone: `eq.${phone}`,
    status: "in.(waiting_reply,unclear,requested_other)",
    order: "created_at.desc",
    limit: "1",
  });

  const rows = await supabaseRequest(
    `/rest/v1/route_sms_requests?${params.toString()}`
  );

  return rows[0] || null;
}

async function updateRouteSmsRequest(id, updates) {
  const params = new URLSearchParams({
    id: `eq.${id}`,
    select: "*",
  });

  return supabaseRequest(`/rest/v1/route_sms_requests?${params.toString()}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: updates,
  });
}

async function updateQueueJob(id, updates) {
  const params = new URLSearchParams({
    id: `eq.${id}`,
    select: "*",
  });

  return supabaseRequest(`/rest/v1/sms_queue?${params.toString()}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: updates,
  });
}

function parseRouteReply(replyText, option1Time, option2Time) {
  const normalizedText = normalizeReplyText(replyText);
  const option1 = formatTime(option1Time);
  const option2 = formatTime(option2Time);

  if (
    /(^|\D)1(\D|$)/.test(normalizedText) ||
    normalizedText.includes("option 1") ||
    normalizedText.includes("επιλογη 1")
  ) {
    return { status: "confirmed", selectedTime: option1 };
  }

  if (
    /(^|\D)2(\D|$)/.test(normalizedText) ||
    normalizedText.includes("option 2") ||
    normalizedText.includes("επιλογη 2")
  ) {
    return { status: "confirmed", selectedTime: option2 };
  }

  const replyTime = extractReplyTime(normalizedText);

  if (replyTime) {
    if (replyTime === option1) {
      return { status: "confirmed", selectedTime: option1 };
    }

    if (replyTime === option2) {
      return { status: "confirmed", selectedTime: option2 };
    }

    return { status: "requested_other", selectedTime: replyTime };
  }

  const unavailableWords = [
    "δεν μπορω",
    "δεν με βολευει",
    "οχι",
    "ακυρο",
    "no",
    "cannot",
    "can't",
    "cant",
    "not available",
    "does not work",
    "doesn't work",
  ];

  if (unavailableWords.some((word) => normalizedText.includes(word))) {
    return { status: "unavailable", selectedTime: null };
  }

  const unclearWords = ["ok", "okay", "ενταξει", "ναι", "yes", "fine"];

  if (unclearWords.some((word) => normalizedText.includes(word))) {
    return { status: "unclear", selectedTime: null };
  }

  return { status: "unclear", selectedTime: null };
}

function normalizeReplyText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.,;:!?()[\]{}]/g, " ")
    .replace(/\s+/g, " ");
}

function extractReplyTime(text) {
  const withMinutes = text.match(/\b([01]?\d|2[0-3])[:.\s]([0-5]\d)\b/);

  if (withMinutes) {
    return `${withMinutes[1].padStart(2, "0")}:${withMinutes[2]}`;
  }

  const compact = text.match(/\b([01]?\d|2[0-3])([0-5]\d)\b/);

  if (compact) {
    return `${compact[1].padStart(2, "0")}:${compact[2]}`;
  }

  const simpleHour = text.match(/\b(στις|at)\s+([01]?\d|2[0-3])\b/);

  if (simpleHour) {
    return `${simpleHour[2].padStart(2, "0")}:00`;
  }

  return null;
}

function formatTime(time) {
  const [hours = "", minutes = ""] = String(time || "").split(":");

  if (!hours || !minutes) {
    return "";
  }

  return `${hours.padStart(2, "0")}:${minutes.padStart(2, "0")}`;
}

function normalizeReceivedAt(value) {
  if (!value) {
    return new Date().toISOString();
  }

  const numericValue = Number(value);

  if (Number.isFinite(numericValue)) {
    return new Date(numericValue).toISOString();
  }

  const parsedDate = new Date(value);

  if (!Number.isNaN(parsedDate.getTime())) {
    return parsedDate.toISOString();
  }

  return new Date().toISOString();
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

  if (!digits) {
    return "";
  }

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

function normalizeNullableCoordinate(value) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return null;
  }

  return numericValue;
}

async function readJsonBody(request) {
  if (!request.body) {
    return {};
  }

  if (typeof request.body === "object") {
    return request.body;
  }

  if (typeof request.body === "string") {
    return JSON.parse(request.body);
  }

  const chunks = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const rawBody = Buffer.concat(chunks).toString("utf8");

  if (!rawBody) {
    return {};
  }

  return JSON.parse(rawBody);
}

function validateConfig(request) {
  const companionSecret = getServerEnv("ANDROID_COMPANION_SECRET");

  if (!companionSecret) {
    return { status: 500, message: "Missing ANDROID_COMPANION_SECRET." };
  }

  if (!isAuthorized(request, companionSecret)) {
    return { status: 401, message: "Unauthorized Android companion request." };
  }

  const missingVariables = [];

  if (!getSupabaseUrl()) {
    missingVariables.push("SUPABASE_URL or VITE_SUPABASE_URL");
  }

  if (!getServerEnv("SUPABASE_SERVICE_ROLE_KEY")) {
    missingVariables.push("SUPABASE_SERVICE_ROLE_KEY");
  }

  if (missingVariables.length > 0) {
    return {
      status: 500,
      message: `Missing required environment variables: ${missingVariables.join(", ")}`,
    };
  }

  return null;
}

async function supabaseRequest(path, options = {}) {
  const serviceRoleKey = getServerEnv("SUPABASE_SERVICE_ROLE_KEY");

  const headers = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  const result = await fetch(`${getSupabaseUrl()}${path}`, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!result.ok) {
    const body = await result.text();
    throw new Error(`Supabase request failed (${result.status}): ${body}`);
  }

  if (result.status === 204) {
    return null;
  }

  return result.json();
}

function isAuthorized(request, secret) {
  const authorization =
    request.headers.authorization || request.headers.Authorization;

  const companionHeader = request.headers["x-android-companion-secret"];

  return authorization === `Bearer ${secret}` || companionHeader === secret;
}

function getSupabaseUrl() {
  return getServerEnv("SUPABASE_URL") || getServerEnv("VITE_SUPABASE_URL");
}