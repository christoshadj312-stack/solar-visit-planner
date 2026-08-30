import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import { getServerEnv } from "../src/server/serverEnv.js";

const MODEL = "gemini-3.5-flash";
const FALLBACK_MODEL = "gemini-3.1-flash-lite";
const RETRY_DELAY_MS = 800;
const MAX_MESSAGE_LENGTH = 2000;
const MAX_HISTORY_ITEMS = 12;
const GEMINI_TIMEOUT_MS = 18000;
const TIME_ZONE = "Europe/Nicosia";
const CUSTOMER_APPOINTMENT_COLUMNS =
  "id,full_name,address,appointment_date,appointment_time,status,notes";
const CUSTOMER_SEARCH_COLUMNS =
  "id,full_name,phone,email,address,status,appointment_date,appointment_time,notes,latitude,longitude";
const CALENDAR_EVENT_COLUMNS = "id,title,event_type,start_date,end_date,notes";
const CUSTOMER_SEARCH_LIMIT = 10;
const CUSTOMER_SEARCH_MAX_LIMIT = 20;
const CUSTOMER_FUZZY_CANDIDATE_LIMIT = 500;

const SYSTEM_INSTRUCTION = `
You are Helios AI, a concise, friendly, professional assistant inside an application for managing photovoltaic sales visits in Cyprus.
Answer mainly in Greek unless the user writes in English.
You are especially useful for photovoltaic sales and technical pre-checks: PV panels, inverters, batteries, optimizers, DC/AC cabling, isolators, breakers, SPD, earthing, AHK/EAC meter boxes, shading, roof suitability and on-site inspection questions.
Give practical field advice, but do not present yourself as a licensed electrician, structural engineer, or AHK/EAC inspector.
Never give final electrical approval, final cable sizing, final protection sizing, or final compliance sign-off from chat or from a photo only.
When safety, regulations, exact measurements, structural loads, cable sizing, protection settings, or AHK/EAC approval are involved, explain what must be checked on site by the responsible licensed professional.
If an image is provided, describe only what is visible, state uncertainty clearly, and give a practical checklist of what to inspect next.
You can answer real appointment, calendar event and customer-search questions when the server routes the request through sanitized read-only Supabase data.
For real app data, use only provided database results. If no data is provided or no record is found, say that clearly and do not invent customers, appointments, routes, reports, or database records.
Keep answers practical, clear, and not too long.
`;

const IMAGE_SYSTEM_INSTRUCTION = `
You are Helios AI, an experienced photovoltaic field assistant for Cyprus PV sales visits.
The user may send roof photos, shading photos, AHK/EAC meter box photos, electrical panel photos, inverter/battery areas, or PV equipment photos.
Answer in Greek unless the user writes in English.
Your job is to give practical advice from the photo and the user's question.

Rules:
- Describe what you can actually see.
- Separate visible observations from assumptions.
- Do not claim certainty when the photo is unclear.
- Do not give final electrical approval, final AHK/EAC approval, structural approval, or exact cable/protection sizing from a photo.
- For meter boxes/electrical panels, comment on visible space, access, neatness, possible constraints, and what the electrician should verify.
- For roofs, comment on roof type, visible usable areas, obstacles, shading risks, orientation/tilt clues if visible, access, and what must be measured on site.
- For PV equipment, mention compatibility questions and datasheet checks instead of pretending to know exact specs from the photo if labels are not readable.
- Be practical and direct.

Recommended response format:
1. Τι βλέπω στη φωτογραφία
2. Πιθανά θέματα / ρίσκα
3. Τι να ελέγξεις onsite
4. Πρακτική συμβουλή
5. Τι δεν μπορώ να επιβεβαιώσω μόνο από τη φωτογραφία
`;

const MAX_IMAGE_BASE64_LENGTH = 10 * 1024 * 1024;

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return response.status(500).json({ error: "Missing GEMINI_API_KEY on the server." });
  }

  const authToken = getBearerToken(request);
  if (!authToken) {
    return response.status(401).json({ error: "Authentication is required." });
  }

  const message = String(request.body?.message || "").trim();

  if (!message) {
    return response.status(400).json({ error: "Message is required." });
  }

  if (message.length > MAX_MESSAGE_LENGTH) {
    return response.status(400).json({
      error: `Message must be ${MAX_MESSAGE_LENGTH} characters or fewer.`
    });
  }

  const history = sanitizeConversationHistory(request.body?.history);

  try {
    const supabase = createUserSupabaseClient(authToken);
    await verifySupabaseUser(supabase, authToken);

    const image = sanitizeImagePayload(request.body?.image);

    if (image) {
      const ai = new GoogleGenAI({ apiKey });
      const { reply, model } = await generateImageAdviceWithRetryAndFallback(
        ai,
        message,
        history,
        image
      );

      return response.status(200).json({
        reply,
        model,
        imageAnalyzed: true
      });
    }

    const routeRequest = parseRouteGuidanceRequest(message);

    if (routeRequest) {
      return response.status(200).json({
        reply: formatRouteGuidanceReply(routeRequest),
        model: "supabase-readonly"
      });
    }

    const missingDataRequest = parseMissingDataRequest(message);

    if (missingDataRequest) {
      const customers = await getCustomersWithMissingData(supabase, missingDataRequest.field);

      return response.status(200).json({
        reply: formatMissingDataReply(customers, missingDataRequest),
        model: "supabase-readonly"
      });
    }

    const statisticsRequest = parseAppointmentStatisticsRequest(message);

    if (statisticsRequest?.error) {
      return response.status(400).json({ error: statisticsRequest.error });
    }

    if (statisticsRequest) {
      const appointments = await getAppointments(
        supabase,
        statisticsRequest.startDate,
        statisticsRequest.endDate
      );

      return response.status(200).json({
        reply: formatAppointmentStatisticsReply(appointments, statisticsRequest),
        model: "supabase-readonly"
      });
    }

    const followUpCustomerRequest = parseCustomerFollowUpRequest(message, history);

    if (followUpCustomerRequest) {
      return response.status(200).json({
        reply: formatCustomerFollowUpReply(followUpCustomerRequest.customer, followUpCustomerRequest.language),
        model: "supabase-readonly"
      });
    }

    const calendarEventRequest = parseCalendarEventRequest(message);

    if (calendarEventRequest?.error) {
      return response.status(400).json({ error: calendarEventRequest.error });
    }

    if (calendarEventRequest) {
      const events = await getCalendarEvents(
        supabase,
        calendarEventRequest.startDate,
        calendarEventRequest.endDate,
        calendarEventRequest.eventType
      );

      return response.status(200).json({
        reply: formatCalendarEventReply(events, calendarEventRequest),
        model: "supabase-readonly"
      });
    }

    const appointmentRequest = parseAppointmentRequest(message);

    if (appointmentRequest?.error) {
      return response.status(400).json({ error: appointmentRequest.error });
    }

    if (appointmentRequest) {
      const appointments = await getAppointments(
        supabase,
        appointmentRequest.startDate,
        appointmentRequest.endDate
      );

      return response.status(200).json({
        reply: formatAppointmentReply(appointments, appointmentRequest),
        model: "supabase-readonly"
      });
    }

    const customerSearchRequest = parseCustomerSearchRequest(message);

    if (customerSearchRequest?.needsMoreSpecificQuery) {
      return response.status(200).json({
        reply: customerSearchRequest.language === "en"
          ? "Tell me a more specific customer name, phone number, or area to search."
          : "Ποιον πελάτη θέλεις να βρω; Γράψε όνομα, τηλέφωνο ή περιοχή.",
        model: "supabase-readonly"
      });
    }

    if (customerSearchRequest) {
      const customers = await findCustomers(
        supabase,
        customerSearchRequest.query,
        customerSearchRequest.limit
      );

      return response.status(200).json({
        reply: formatCustomerSearchReply(customers, customerSearchRequest),
        model: "supabase-readonly"
      });
    }

    const ai = new GoogleGenAI({ apiKey });
    const { reply, model } = await generateWithRetryAndFallback(ai, message, history);

    return response.status(200).json({ reply, model });
  } catch (error) {
    if (error?.status === 401) {
      return response.status(401).json({ error: "Authentication is required." });
    }

    if (error?.status === 400) {
      return response.status(400).json({ error: error.message || "Bad request." });
    }

    if (error?.code === "SUPABASE_ENV_MISSING") {
      console.error("Helios AI Supabase configuration missing", {
        missing: error.missing
      });
      return response.status(500).json({
        error: "Helios AI could not connect to appointments right now."
      });
    }

    if (error?.code === "APPOINTMENTS_READ_FAILED") {
      console.error("Helios AI appointment read failed", {
        message: error.message,
        details: error.details
      });
      return response.status(500).json({
        error: "Δεν μπόρεσα να διαβάσω τα ραντεβού σου αυτή τη στιγμή. Δοκίμασε ξανά σε λίγο."
      });
    }

    if (error?.code === "CUSTOMERS_READ_FAILED") {
      console.error("Helios AI customer search failed", {
        message: error.message,
        details: error.details
      });
      return response.status(500).json({
        error: "Δεν μπόρεσα να διαβάσω τους πελάτες αυτή τη στιγμή. Δοκίμασε ξανά σε λίγο."
      });
    }

    if (error?.code === "CALENDAR_EVENTS_READ_FAILED") {
      console.error("Helios AI calendar event read failed", {
        message: error.message,
        details: error.details
      });
      return response.status(500).json({
        error: "Δεν μπόρεσα να διαβάσω τα calendar events αυτή τη στιγμή. Δοκίμασε ξανά σε λίγο."
      });
    }

    console.error("Helios AI request failed", {
      message: error?.message || "Unknown Gemini error",
      status: getErrorStatus(error) || "unknown"
    });

    return response.status(500).json({
      error: "Helios AI could not answer right now. Please try again."
    });
  }
}

function createUserSupabaseClient(authToken) {
  const supabaseUrl = getServerEnv("SUPABASE_URL") || getServerEnv("VITE_SUPABASE_URL");
  const supabaseAnonKey =
    getServerEnv("SUPABASE_ANON_KEY") || getServerEnv("VITE_SUPABASE_ANON_KEY");
  const missing = [];

  if (!supabaseUrl) missing.push("SUPABASE_URL or VITE_SUPABASE_URL");
  if (!supabaseAnonKey) missing.push("SUPABASE_ANON_KEY or VITE_SUPABASE_ANON_KEY");

  if (missing.length) {
    const error = new Error("Missing Supabase environment variables");
    error.code = "SUPABASE_ENV_MISSING";
    error.missing = missing;
    throw error;
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    },
    global: {
      headers: {
        Authorization: `Bearer ${authToken}`
      }
    }
  });
}

async function verifySupabaseUser(supabase, authToken) {
  const { data, error } = await supabase.auth.getUser(authToken);

  if (error || !data?.user) {
    const authError = new Error("Invalid Supabase user token");
    authError.status = 401;
    throw authError;
  }

  return data.user;
}

async function getAppointments(supabase, startDate, endDate) {
  const { data, error } = await supabase
    .from("customers")
    .select(CUSTOMER_APPOINTMENT_COLUMNS)
    .not("appointment_date", "is", null)
    .gte("appointment_date", startDate)
    .lte("appointment_date", endDate)
    .order("appointment_date", { ascending: true })
    .order("appointment_time", { ascending: true });

  if (error) {
    const readError = new Error(error.message || "Unable to read appointments");
    readError.code = "APPOINTMENTS_READ_FAILED";
    readError.details = {
      code: error.code,
      hint: error.hint,
      startDate,
      endDate
    };
    throw readError;
  }

  return Array.isArray(data) ? data : [];
}

async function getCalendarEvents(supabase, startDate, endDate, eventType = "") {
  let query = supabase
    .from("calendar_events")
    .select(CALENDAR_EVENT_COLUMNS)
    .lte("start_date", endDate)
    .gte("end_date", startDate)
    .order("start_date", { ascending: true });

  if (eventType) {
    query = query.eq("event_type", eventType);
  }

  const { data, error } = await query;

  if (error) {
    const readError = new Error(error.message || "Unable to read calendar events");
    readError.code = "CALENDAR_EVENTS_READ_FAILED";
    readError.details = {
      code: error.code,
      hint: error.hint,
      startDate,
      endDate,
      eventType: eventType || "all"
    };
    throw readError;
  }

  return Array.isArray(data) ? data : [];
}
async function findCustomers(supabase, query, limit = CUSTOMER_SEARCH_LIMIT) {
  const normalizedLimit = Math.min(
    Math.max(Number(limit) || CUSTOMER_SEARCH_LIMIT, 1),
    CUSTOMER_SEARCH_MAX_LIMIT
  );

  const searchValue = String(query || "").trim();
  const phoneDigits = searchValue.replace(/\D/g, "");

  let directMatches = [];

  if (searchValue) {
    const searchPatternValue = searchValue.replace(/,/g, " ");
    const pattern = `%${escapeIlikePattern(searchPatternValue)}%`;

    const filters = [
      `full_name.ilike.${pattern}`,
      `phone.ilike.${pattern}`,
      `address.ilike.${pattern}`,
      `email.ilike.${pattern}`,
      `status.ilike.${pattern}`,
      `notes.ilike.${pattern}`,
    ];

    if (phoneDigits && phoneDigits !== searchValue) {
      filters.push(`phone.ilike.%${escapeIlikePattern(phoneDigits)}%`);
    }

    const { data, error } = await supabase
      .from("customers")
      .select(CUSTOMER_SEARCH_COLUMNS)
      .or(filters.join(","))
      .order("appointment_date", { ascending: true })
      .order("appointment_time", { ascending: true })
      .limit(normalizedLimit);

    if (error) {
      const readError = new Error(error.message || "Unable to search customers");
      readError.code = "CUSTOMERS_READ_FAILED";
      readError.details = {
        code: error.code,
        hint: error.hint,
        queryLength: searchValue.length,
      };
      throw readError;
    }

    directMatches = Array.isArray(data) ? data : [];
  }

 const { data: candidates, error: candidateError } = await supabase
  .from("customers")
  .select(CUSTOMER_SEARCH_COLUMNS)
  .order("full_name", { ascending: true })
  .limit(CUSTOMER_FUZZY_CANDIDATE_LIMIT);

  if (candidateError) {
    const readError = new Error(candidateError.message || "Unable to search customers");
    readError.code = "CUSTOMERS_READ_FAILED";
    readError.details = {
      code: candidateError.code,
      hint: candidateError.hint,
      queryLength: searchValue.length,
    };
    throw readError;
  }

  const allCandidates = Array.isArray(candidates) ? candidates : [];

  const mergedCustomers = mergeUniqueCustomers([
    ...directMatches,
    ...allCandidates,
  ]);

  return mergedCustomers
    .map((customer) => ({
      customer,
      score: getCustomerSearchScore(customer, searchValue),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;

      const aDate = a.customer.appointment_date || "9999-12-31";
      const bDate = b.customer.appointment_date || "9999-12-31";
      const dateCompare = aDate.localeCompare(bDate);

      if (dateCompare !== 0) return dateCompare;

      return String(a.customer.appointment_time || "").localeCompare(
        String(b.customer.appointment_time || "")
      );
    })
    .slice(0, normalizedLimit)
    .map((item) => item.customer);
}




function sanitizeConversationHistory(history) {
  if (!Array.isArray(history)) return [];

  return history
    .filter((item) => item?.role === "user" || item?.role === "assistant")
    .slice(-MAX_HISTORY_ITEMS)
    .map((item) => ({
      role: item.role,
      text: String(item.text || "").slice(0, 1200)
    }))
    .filter((item) => item.text.trim());
}

function sanitizeImagePayload(image) {
  if (!image || typeof image !== "object") return null;

  const mimeType = String(image.mimeType || "").trim().toLowerCase();
  const data = String(image.data || "").trim();
  const name = String(image.name || "photo").slice(0, 120);

  if (!mimeType || !data) return null;

  if (!mimeType.startsWith("image/")) {
    const error = new Error("Μπορείς να ανεβάσεις μόνο εικόνα για ανάλυση.");
    error.status = 400;
    throw error;
  }

  if (data.length > MAX_IMAGE_BASE64_LENGTH) {
    const error = new Error("Η φωτογραφία είναι πολύ μεγάλη. Δοκίμασε μικρότερη εικόνα.");
    error.status = 400;
    throw error;
  }

  return { mimeType, data, name };
}

function parseRouteGuidanceRequest(message) {
  const normalized = normalizeGreek(message);

  if (!normalized.includes("\u03b4\u03b9\u03b1\u03b4\u03c1\u03bf\u03bc") && !normalized.includes("route")) {
    return null;
  }

  return { language: hasGreekText(message) ? "el" : "en" };
}

function formatRouteGuidanceReply() {
  return [
    "I cannot optimize or save a route directly from chat yet.",
    "Open the Optimize Route page, choose a starting point and stops, then run the existing optimizer there.",
    "If stops do not have coordinates, reselect their addresses from suggestions first."
  ].join("\n");
}

function parseMissingDataRequest(message) {
  const normalized = normalizeGreek(message);
  const asksMissing =
    normalized.includes("\u03b4\u03b5\u03bd \u03b5\u03c7\u03bf\u03c5\u03bd") ||
    normalized.includes("\u03c7\u03c9\u03c1\u03b9\u03c2") ||
    normalized.includes("missing") ||
    normalized.includes("no ");

  if (!asksMissing) return null;

  if (normalized.includes("\u03c4\u03b7\u03bb\u03b5\u03c6\u03c9\u03bd") || normalized.includes("phone")) {
    return { field: "phone", language: hasGreekText(message) ? "el" : "en" };
  }

  if (normalized.includes("\u03b4\u03b9\u03b5\u03c5\u03b8\u03c5\u03bd") || normalized.includes("address")) {
    return { field: "address", language: hasGreekText(message) ? "el" : "en" };
  }

  if (normalized.includes("coordinate") || normalized.includes("coordinates") || normalized.includes("\u03c3\u03c5\u03bd\u03c4\u03b5\u03c4\u03b1\u03b3")) {
    return { field: "coordinates", language: hasGreekText(message) ? "el" : "en" };
  }

  if (normalized.includes("\u03c1\u03b1\u03bd\u03c4\u03b5\u03b2") || normalized.includes("appointment")) {
    return { field: "appointment", language: hasGreekText(message) ? "el" : "en" };
  }

  return null;
}

async function getCustomersWithMissingData(supabase, field) {
  const { data, error } = await supabase
    .from("customers")
    .select(CUSTOMER_SEARCH_COLUMNS)
    .order("full_name", { ascending: true })
    .limit(200);

  if (error) {
    const readError = new Error(error.message || "Unable to read customers");
    readError.code = "CUSTOMERS_READ_FAILED";
    readError.details = { code: error.code, hint: error.hint, field };
    throw readError;
  }

  const customers = Array.isArray(data) ? data : [];

  return customers.filter((customer) => {
    if (field === "phone") return !String(customer.phone || "").trim();
    if (field === "address") return !String(customer.address || "").trim();
    if (field === "appointment") return !String(customer.appointment_date || "").trim();
    if (field === "coordinates") {
      return !Number.isFinite(Number(customer.latitude)) || !Number.isFinite(Number(customer.longitude));
    }
    return false;
  });
}

function formatMissingDataReply(customers, request) {
  const labels = {
    phone: "phone number",
    address: "address",
    coordinates: "coordinates",
    appointment: "scheduled appointment"
  };
  const label = labels[request.field] || request.field;

  if (!customers.length) {
    return "I did not find customers missing " + label + ".";
  }

  const lines = ["I found " + customers.length + " customers missing " + label + ":"];

  customers.slice(0, 20).forEach((customer, index) => {
    lines.push((index + 1) + ". " + (customer.full_name || "No name") + " - " + (customer.address || "No address"));
  });

  if (customers.length > 20) {
    lines.push("...and " + (customers.length - 20) + " more.");
  }

  return lines.join("\n");
}


function parseRelativeDateRange(normalizedMessage, todayIso) {
  if (normalizedMessage.includes("μεθαυριο") || normalizedMessage.includes("μεθααυριο")) {
    const date = addDaysIso(todayIso, 2);
    return {
      type: "day",
      startDate: date,
      endDate: date,
      label: "μεθαύριο"
    };
  }

  if (normalizedMessage.includes("αυριο")) {
    const date = addDaysIso(todayIso, 1);
    return {
      type: "day",
      startDate: date,
      endDate: date,
      label: "αύριο"
    };
  }

  if (normalizedMessage.includes("σημερα")) {
    return {
      type: "day",
      startDate: todayIso,
      endDate: todayIso,
      label: "σήμερα"
    };
  }

  const asksNextWeek =
    (normalizedMessage.includes("επομεν") && (normalizedMessage.includes("εβδομαδ") || normalizedMessage.includes("βδομαδ"))) ||
    normalizedMessage.includes("next week");

  if (asksNextWeek) {
    const currentWeek = getCurrentWeekRange(todayIso);
    const startDate = addDaysIso(currentWeek.startDate, 7);
    return {
      type: "week",
      startDate,
      endDate: addDaysIso(startDate, 6),
      label: "την επόμενη εβδομάδα"
    };
  }

  const asksThisWeek =
    normalizedMessage.includes("αυτη την εβδομαδ") ||
    normalizedMessage.includes("αυτη τη βδομαδ") ||
    normalizedMessage.includes("this week") ||
    normalizedMessage.includes("προγραμμα εβδομαδας") ||
    (
      (normalizedMessage.includes("εβδομαδ") || normalizedMessage.includes("βδομαδ")) &&
      !normalizedMessage.includes("επομεν")
    );

  if (asksThisWeek) {
    const range = getCurrentWeekRange(todayIso);
    return {
      type: "week",
      startDate: range.startDate,
      endDate: range.endDate,
      label: "αυτή την εβδομάδα"
    };
  }

  return null;
}

function parseAppointmentStatisticsRequest(message) {
  const normalized = normalizeGreek(message);
  const wantsStats =
    normalized.includes("\u03c3\u03c4\u03b1\u03c4\u03b9\u03c3\u03c4\u03b9\u03ba") ||
    normalized.includes("\u03c0\u03bf\u03c3\u03b1") ||
    normalized.includes("\u03c0\u03bf\u03c3\u03bf\u03c3\u03c4\u03b1") ||
    normalized.includes("\u03c6\u03bf\u03c1\u03c4\u03c9\u03bc\u03b5\u03bd\u03b7") ||
    normalized.includes("scheduled") ||
    normalized.includes("completed") ||
    normalized.includes("cancelled") ||
    normalized.includes("canceled") ||
    normalized.includes("\u03bf\u03bb\u03bf\u03ba\u03bb\u03b7\u03c1\u03c9") ||
    normalized.includes("\u03b1\u03ba\u03c5\u03c1\u03c9") ||
    normalized.includes("statistics") ||
    normalized.includes("stats");

  if (!wantsStats) return null;

  const today = getCyprusTodayIso();
  const explicitRange = parseExplicitDateRange(normalized, today);
  if (explicitRange?.error) return explicitRange;

  const relativeRange = parseRelativeDateRange(normalized, today);
  const monthRange = parseMonthOnlyRange(normalized, today);
  const range = explicitRange || relativeRange || monthRange || getCurrentMonthRange(today, "αυτόν τον μήνα");

  return {
    startDate: range.startDate,
    endDate: range.endDate,
    label: range.label || formatDateForDisplay(range.startDate) + " to " + formatDateForDisplay(range.endDate),
    language: hasGreekText(message) ? "el" : "en"
  };
}

function formatAppointmentStatisticsReply(appointments, request) {
  const total = appointments.length;
  const statusCounts = appointments.reduce((counts, appointment) => {
    const key = normalizeStatusKey(appointment.status);
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, { scheduled: 0, completed: 0, cancelled: 0, other: 0 });
  const busiest = getBusiestAppointmentDay(appointments);
  const daysWithoutAppointments = getDaysWithoutAppointments(request.startDate, request.endDate, appointments);

  if (request.language === "en") {
    return [
      "Appointment statistics for " + request.label + ":",
      "Total: " + total,
      "Scheduled: " + statusCounts.scheduled,
      "Completed: " + statusCounts.completed,
      "Cancelled: " + statusCounts.cancelled,
      "Other: " + statusCounts.other,
      "Busiest day: " + (busiest ? formatDateForDisplay(busiest.date) + " (" + busiest.count + ")" : "No appointments"),
      "Days without appointments: " + daysWithoutAppointments.length
    ].join("\n");
  }

  return [
    "Στατιστικά ραντεβού για " + request.label + ":",
    "Σύνολο: " + total,
    "Scheduled: " + statusCounts.scheduled,
    "Completed: " + statusCounts.completed,
    "Cancelled: " + statusCounts.cancelled,
    "Άλλα: " + statusCounts.other,
    "Πιο φορτωμένη μέρα: " + (busiest ? formatDateForDisplay(busiest.date) + " (" + busiest.count + ")" : "Δεν υπάρχουν ραντεβού"),
    "Μέρες χωρίς ραντεβού: " + daysWithoutAppointments.length
  ].join("\n");
}

function normalizeStatusKey(status) {
  const value = String(status || "").trim().toLowerCase();
  if (value === "scheduled" || value === "pending") return "scheduled";
  if (value === "completed" || value === "visited" || value === "done") return "completed";
  if (value === "cancelled" || value === "canceled" || value === "rejected") return "cancelled";
  return "other";
}

function getBusiestAppointmentDay(appointments) {
  const counts = appointments.reduce((acc, appointment) => {
    if (!appointment.appointment_date) return acc;
    acc[appointment.appointment_date] = (acc[appointment.appointment_date] || 0) + 1;
    return acc;
  }, {});

  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([date, count]) => ({ date, count }))[0] || null;
}

function getDaysWithoutAppointments(startDate, endDate, appointments) {
  const appointmentDays = new Set(appointments.map((appointment) => appointment.appointment_date).filter(Boolean));
  const days = [];
  let current = startDate;

  while (current <= endDate) {
    if (!appointmentDays.has(current)) days.push(current);
    current = addDaysIso(current, 1);
  }

  return days;
}

function parseCustomerFollowUpRequest(message, history) {
  const normalized = normalizeGreek(message);
  const asksAboutAppointment = normalized.includes("\u03c1\u03b1\u03bd\u03c4\u03b5\u03b2") || normalized.includes("appointment");
  const hasPronoun = normalized.includes("\u03c4\u03bf\u03c5") || normalized.includes("\u03c4\u03b7\u03c2") || normalized.includes("\u03c4\u03bf\u03c5\u03c2") || normalized.includes("his") || normalized.includes("her");

  if (!asksAboutAppointment || !hasPronoun) return null;

  const customer = extractLastCustomerFromHistory(history);
  if (!customer) return null;

  return { customer, language: hasGreekText(message) ? "el" : "en" };
}

function extractLastCustomerFromHistory(history) {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const item = history[index];
    if (item.role !== "assistant") continue;
    const text = String(item.text || "");
    const nameMatch = text.match(/Name:\s*([^\n]+)/i) || text.match(/\d+\.\s*([^?\n]+)\s*?/);
    if (!nameMatch) continue;
    const appointmentMatch = text.match(/Appointment:\s*([^\n]+)/i) || text.match(/(\d{2}\/\d{2}\/\d{4}[^\n]*)/);
    return {
      full_name: nameMatch[1].trim(),
      appointment: appointmentMatch ? appointmentMatch[1].trim() : ""
    };
  }

  return null;
}

function formatCustomerFollowUpReply(customer) {
  return customer.appointment
    ? customer.full_name + ": " + customer.appointment
    : "I found " + customer.full_name + ", but I do not see an appointment in the recent result.";
}

function parseCalendarEventRequest(message) {
  const original = String(message || "").trim();
  const normalized = normalizeGreek(original);
  const eventType = detectCalendarEventType(normalized);
  const hasEventIntent =
    Boolean(eventType) ||
    normalized.includes("γεγονο") ||
    normalized.includes("calendar event") ||
    normalized.includes("event") ||
    normalized.includes("ημερολογ") ||
    normalized.includes("σημειω") ||
    normalized.includes("καταχωρη");

  if (!hasEventIntent) {
    return null;
  }

  const today = getCyprusTodayIso();
  const dateRange = parseCalendarEventDateRange(normalized, today);

  if (dateRange?.error) {
    return dateRange;
  }

  const range = dateRange || getDefaultCalendarEventRange(today);

  return {
    startDate: range.startDate,
    endDate: range.endDate,
    label: range.label,
    eventType
  };
}

function detectCalendarEventType(normalizedMessage) {
  if (normalizedMessage.includes("αδεια") || normalizedMessage.includes("leave")) return "leave";
  if (normalizedMessage.includes("ταξιδ") || normalizedMessage.includes("trip") || normalizedMessage.includes("travel")) return "trip";
  if (normalizedMessage.includes("εκπαιδευ") || normalizedMessage.includes("training")) return "training";
  if (normalizedMessage.includes("προσωπ") || normalizedMessage.includes("personal")) return "personal";
  if (normalizedMessage.includes("other") || normalizedMessage.includes("αλλο")) return "other";
  return "";
}

function parseCalendarEventDateRange(normalizedMessage, todayIso) {
  const explicitRange = parseExplicitDateRange(normalizedMessage, todayIso);
  if (explicitRange) return explicitRange;

  const monthRange = parseMonthOnlyRange(normalizedMessage, todayIso);
  if (monthRange) return monthRange;

  const relativeRange = parseRelativeDateRange(normalizedMessage, todayIso);
  if (relativeRange) {
    return {
      startDate: relativeRange.startDate,
      endDate: relativeRange.endDate,
      label: relativeRange.label
    };
  }

  if (normalizedMessage.includes("μηνα") || normalizedMessage.includes("μηνας") || normalizedMessage.includes("month")) {
    return getCurrentMonthRange(todayIso, "αυτόν τον μήνα");
  }

  const weekdayDate = parseWeekdayDate(normalizedMessage, todayIso);
  if (weekdayDate) {
    return {
      startDate: weekdayDate.date,
      endDate: weekdayDate.date,
      label: weekdayDate.label
    };
  }

  const parsedDate = parseSpecificDate(normalizedMessage, todayIso);
  if (parsedDate?.error) return parsedDate;
  if (parsedDate?.date) {
    return {
      startDate: parsedDate.date,
      endDate: parsedDate.date,
      label: formatDateForDisplay(parsedDate.date)
    };
  }

  return null;
}

function parseExplicitDateRange(normalizedMessage, todayIso) {
  const rangeMatch = normalizedMessage.match(
    /(?:απο|from)\s+(\d{1,2})(?:[/. -](\d{1,2}))?(?:[/. -](\d{2,4}))?\s+(?:μεχρι|εως|ως|to|- )\s+(\d{1,2})(?:[/. -](\d{1,2}))?(?:[/. -](\d{2,4}))?(?:\s+([\p{Script=Greek}a-z]+))?/u
  );

  if (!rangeMatch) return null;

  const monthFromText = rangeMatch[7] ? getGreekMonthNumber(rangeMatch[7]) : 0;
  const currentYear = Number(todayIso.slice(0, 4));
  const startMonth = Number(rangeMatch[2]) || monthFromText || Number(todayIso.slice(5, 7));
  const endMonth = Number(rangeMatch[5]) || monthFromText || startMonth;
  const startYear = normalizeYear(rangeMatch[3], todayIso);
  const endYear = rangeMatch[6] ? normalizeYear(rangeMatch[6], todayIso) : startYear || currentYear;
  const start = buildIsoDateResult(startYear || currentYear, startMonth, Number(rangeMatch[1]));
  const end = buildIsoDateResult(endYear, endMonth, Number(rangeMatch[4]));

  if (start.error) return start;
  if (end.error) return end;
  if (start.date > end.date) {
    return { error: "Το εύρος ημερομηνιών που ζήτησες δεν είναι έγκυρο." };
  }

  return {
    startDate: start.date,
    endDate: end.date,
    label: `${formatDateForDisplay(start.date)} έως ${formatDateForDisplay(end.date)}`
  };
}

function parseMonthOnlyRange(normalizedMessage, todayIso) {
  const months = getGreekMonths();
  const matchedMonth = Object.keys(months).find((monthName) =>
    normalizedMessage.includes(monthName)
  );

  if (!matchedMonth) return null;

  const yearMatch = normalizedMessage.match(/\b(20\d{2})\b/);
  const year = yearMatch ? Number(yearMatch[1]) : Number(todayIso.slice(0, 4));
  const month = months[matchedMonth];
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));

  return {
    startDate: toIsoDate(start),
    endDate: toIsoDate(end),
    label: `${padTwo(month)}/${year}`
  };
}

function getDefaultCalendarEventRange(todayIso) {
  const start = todayIso;
  const end = addDaysIso(todayIso, 365);
  return {
    startDate: start,
    endDate: end,
    label: `${formatDateForDisplay(start)} έως ${formatDateForDisplay(end)}`
  };
}

function getCurrentMonthRange(todayIso, label) {
  const [year, month] = todayIso.split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));
  return {
    startDate: toIsoDate(start),
    endDate: toIsoDate(end),
    label
  };
}

function formatCalendarEventReply(events, request) {
  if (!events.length) {
    return "Δεν έχεις καταχωρημένα γεγονότα για αυτή την περίοδο.";
  }

  const typeLabel = request.eventType ? `${formatEventType(request.eventType)} ` : "";
  const lines = [
    `Βρήκα ${events.length} ${typeLabel}γεγονότα για ${request.label}:`
  ];

  events.forEach((event, index) => {
    const notes = event.notes ? `\n   Σημειώσεις: ${event.notes}` : "";
    lines.push(
      `${index + 1}. ${event.title || "Χωρίς τίτλο"}\n   Τύπος: ${formatEventType(event.event_type)}\n   Από: ${formatDateForDisplay(event.start_date)}\n   Μέχρι: ${formatDateForDisplay(event.end_date)}${notes}`
    );
  });

  return lines.join("\n");
}

function formatEventType(eventType) {
  const labels = {
    trip: "Ταξίδι",
    leave: "Άδεια",
    training: "Εκπαίδευση",
    personal: "Προσωπικό",
    other: "Άλλο"
  };

  return labels[eventType] || "Άλλο";
}

function getGreekMonthNumber(value) {
  const normalized = normalizeGreek(value);
  return getGreekMonths()[normalized] || 0;
}

function getGreekMonths() {
  return {
    ιανουαριου: 1,
    ιανουαριος: 1,
    φεβρουαριου: 2,
    φεβρουαριος: 2,
    μαρτιου: 3,
    μαρτιος: 3,
    απριλιου: 4,
    απριλιος: 4,
    μαιου: 5,
    μαιος: 5,
    ιουνιου: 6,
    ιουνιος: 6,
    ιουνη: 6,
    ιουνης: 6,
    ιουλιου: 7,
    ιουλιος: 7,
    ιουλη: 7,
    ιουλης: 7,
    αυγουστου: 8,
    αυγουστος: 8,
    σεπτεμβριου: 9,
    σεπτεμβριος: 9,
    οκτωβριου: 10,
    οκτωβριος: 10,
    νοεμβριου: 11,
    νοεμβριος: 11,
    δεκεμβριου: 12,
    δεκεμβριος: 12
  };
}

function padTwo(value) {
  return String(value).padStart(2, "0");
}
function parseCustomerSearchRequest(message) {
  const original = String(message || "").trim();
  const normalized = normalizeGreek(original);

  if (looksLikePvTechnicalRequest(normalized)) {
    return null;
  }

  const hasExplicitCustomerWord =
    normalized.includes("πελατ") ||
    normalized.includes("customer") ||
    normalized.includes("client");

  const hasCustomerSearchVerb =
    normalized.includes("βρες") ||
    normalized.includes("ψαξε") ||
    normalized.includes("αναζητησε") ||
    normalized.includes("δειξε") ||
    normalized.includes("find") ||
    normalized.includes("search") ||
    normalized.includes("show");

  const hasCustomerFieldClue =
    normalized.includes("τηλεφων") ||
    normalized.includes("ονομα") ||
    normalized.includes("περιοχη") ||
    normalized.includes("διευθυν") ||
    normalized.includes("μενει") ||
    normalized.includes("phone") ||
    normalized.includes("name") ||
    normalized.includes("area") ||
    normalized.includes("address") ||
    /\d{2,}/.test(normalized);

  const hasLocationPhrase =
    normalized.includes("στην ") ||
    normalized.includes("στη ") ||
    normalized.includes("στον ") ||
    normalized.includes("στο ") ||
    normalized.includes("σε ");

  const isCustomerSearch =
    hasExplicitCustomerWord ||
    (hasCustomerSearchVerb && hasCustomerFieldClue) ||
    (hasCustomerSearchVerb && hasLocationPhrase && !looksLikePvTechnicalRequest(normalized));

  if (!isCustomerSearch) {
    return null;
  }

  const language = hasGreekText(original) ? "el" : "en";
  const query = extractCustomerSearchQuery(original);

  if (isTooGeneralCustomerQuery(query)) {
    return { needsMoreSpecificQuery: true, language };
  }

  return {
    query,
    limit: CUSTOMER_SEARCH_LIMIT,
    language,
  };
}

function looksLikePvTechnicalRequest(normalizedMessage) {
  const technicalKeywords = [
    "φβ",
    "φωτοβολταικ",
    "pv",
    "panel",
    "πανελ",
    "inverter",
    "ινβερτερ",
    "αντιστροφεα",
    "αντιστροφεασ",
    "μπαταρια",
    "battery",
    "optimizer",
    "optimiser",
    "βελτιστοποιητη",
    "βελτιστοποιητεσ",
    "καλωδιο",
    "καλωδια",
    "dc",
    "ac",
    "string",
    "strings",
    "mppt",
    "huawei",
    "solaredge",
    "fronius",
    "kstar",
    "jinko",
    "qcells",
    "qcell",
    "solar",
    "κεραμιδι",
    "στεγη",
    "ταρατσα",
    "σκιαση",
    "σκιασεις",
    "ahk",
    "eac",
    "μετρητη",
    "μετρητης",
    "πινακα",
    "πινακας",
    "ασφαλεια",
    "ασφαλειες",
    "spd",
    "γειωση",
    "μονωτη",
    "διακοπτη",
    "παραγωγη",
    "kw",
    "kwh",
    "kwp",
  ];

  return technicalKeywords.some((keyword) =>
    normalizedMessage.includes(keyword)
  );
}

function extractCustomerSearchQuery(message) {
  let query = String(message || "").trim();

  query = query
    .replace(/^(βρες|βρειτε|δείξε|δειξε|ψάξε|ψαξε|αναζήτησε|αναζητησε)\s+(μου\s+)?/i, "")
    .replace(/^(find|show|search)\s+(me\s+)?/i, "")
    .replace(/^(θέλω|θελω)\s+(να\s+)?(βρω|δω|ψαξω|ψάξω)\s+/i, "")
    .replace(/^(ποιος|ποια)\s+πελάτης\s+/i, "")
    .replace(/^(ποιος|ποια)\s+πελατης\s+/i, "")
    .replace(/^(ποιος|ποια)\s+/i, "")
    .replace(/^(τον|την|το|τους|τις)\s+/i, "")
    .replace(/^πελάτη\s+με\s+το\s+όνομα\s+/i, "")
    .replace(/^πελατη\s+με\s+το\s+ονομα\s+/i, "")
    .replace(/^πελάτη\s+με\s+όνομα\s+/i, "")
    .replace(/^πελατη\s+με\s+ονομα\s+/i, "")
    .replace(/^πελάτη\s+με\s+/i, "")
    .replace(/^πελατη\s+με\s+/i, "")
    .replace(/^πελάτες\s+με\s+/i, "")
    .replace(/^πελατες\s+με\s+/i, "")
    .replace(/^πελάτες\s+στην\s+/i, "")
    .replace(/^πελατες\s+στην\s+/i, "")
    .replace(/^πελάτη\s+στην\s+/i, "")
    .replace(/^πελατη\s+στην\s+/i, "")
    .replace(/^πελάτης\s+/i, "")
    .replace(/^πελατης\s+/i, "")
    .replace(/^πελάτη\s+/i, "")
    .replace(/^πελατη\s+/i, "")
    .replace(/^πελάτες\s+/i, "")
    .replace(/^πελατες\s+/i, "")
    .replace(/^customer\s+(with\s+)?(name\s+)?/i, "")
    .replace(/^customers\s+(with\s+)?(name\s+)?/i, "")
    .replace(/^client\s+(with\s+)?(name\s+)?/i, "")
    .replace(/^clients\s+(with\s+)?(name\s+)?/i, "")
    .replace(/^(τηλέφωνο|τηλεφωνο|phone)\s*/i, "")
    .replace(/^(όνομα|ονομα|name)\s*/i, "")
    .replace(/^(μένει|μενει)\s+/i, "")
    .replace(/^(στην|στη|στον|στο|σε|in)\s+/i, "")
    .replace(/[?!.]+$/g, "")
    .trim();

  const phoneMatch = query.match(/(?:\+?357)?[\s-]*(\d[\d\s-]{1,})/);

  if (phoneMatch && normalizeGreek(message).includes("τηλεφων")) {
    return phoneMatch[0].trim();
  }

  return query;
}

function isTooGeneralCustomerQuery(query) {
  const value = String(query || "").trim();
  const normalized = normalizeGreek(value);
  const digits = value.replace(/\D/g, "");
  const genericTerms = new Set([
    "",
    "πελατη",
    "πελατες",
    "πελατης",
    "customer",
    "customers",
    "client",
    "clients",
    "τηλεφωνο",
    "phone",
    "ονομα",
    "name",
    "περιοχη",
    "area"
  ]);

  if (genericTerms.has(normalized)) return true;
  if (digits) return digits.length < 2;
  return normalized.length < 3;
}

function formatCustomerSearchReply(customers, request) {
  const english = request.language === "en";

  if (!customers.length) {
    return english
      ? "I could not find a customer matching that search."
      : "Δεν βρήκα πελάτη που να ταιριάζει με αυτή την αναζήτηση.";
  }

  if (customers.length === 1) {
    const customer = customers[0];
    return english
      ? [
          "I found 1 customer:",
          "",
          `Name: ${customer.full_name || "Not available"}`,
          `Phone: ${customer.phone || "Not available"}`,
          `Email: ${customer.email || "Not available"}`,
          `Address: ${customer.address || "Not available"}`,
          `Status: ${customer.status || "Not available"}`,
          `Appointment: ${formatCustomerAppointment(customer, "en")}`,
          customer.notes ? `Notes: ${customer.notes}` : ""
        ].filter(Boolean).join("\n")
      : [
          "Βρήκα 1 πελάτη:",
          "",
          `Όνομα: ${customer.full_name || "Δεν υπάρχει"}`,
          `Τηλέφωνο: ${customer.phone || "Δεν υπάρχει"}`,
          `Email: ${customer.email || "Δεν υπάρχει"}`,
          `Διεύθυνση: ${customer.address || "Δεν υπάρχει"}`,
          `Status: ${customer.status || "Δεν υπάρχει"}`,
          `Ραντεβού: ${formatCustomerAppointment(customer, "el")}`,
          customer.notes ? `Σημειώσεις: ${customer.notes}` : ""
        ].filter(Boolean).join("\n");
  }

  const lines = [
    english
      ? `I found ${customers.length} matching customers:`
      : `Βρήκα ${customers.length} πελάτες που ταιριάζουν:`
  ];

  customers.forEach((customer, index) => {
    const appointment = formatCustomerAppointment(customer, request.language);
    lines.push(
      english
        ? `${index + 1}. ${customer.full_name || "Not available"} — ${customer.phone || "No phone"}\n   Address: ${customer.address || "No address"}\n   Next appointment: ${appointment}`
        : `${index + 1}. ${customer.full_name || "Δεν υπάρχει"} — ${customer.phone || "Χωρίς τηλέφωνο"}\n   Διεύθυνση: ${customer.address || "Χωρίς διεύθυνση"}\n   Επόμενο ραντεβού: ${appointment}`
    );
  });

  return lines.join("\n");
}

function formatCustomerAppointment(customer, language = "el") {
  if (!customer.appointment_date) {
    return language === "en" ? "No appointment" : "Δεν υπάρχει ραντεβού";
  }

  const date = formatDateForDisplay(customer.appointment_date);
  const time = customer.appointment_time ? String(customer.appointment_time).slice(0, 5) : "--:--";
  return `${date} ${time}`;
}



function mergeUniqueCustomers(customers) {
  const map = new Map();

  customers.forEach((customer) => {
    if (!customer?.id) return;
    map.set(customer.id, customer);
  });

  return Array.from(map.values());
}

function getCustomerSearchScore(customer, query) {
  const normalizedQuery = normalizeSearchText(query);
  const queryTokens = getSearchTokens(normalizedQuery);
  const phoneQuery = String(query || "").replace(/\D/g, "");

  if (!normalizedQuery && !phoneQuery) {
    return 0;
  }

  const normalizedName = normalizeSearchText(customer.full_name);
  const normalizedPhone = String(customer.phone || "").replace(/\D/g, "");
  const normalizedAddress = normalizeSearchText(customer.address);
  const normalizedEmail = normalizeSearchText(customer.email);
  const normalizedStatus = normalizeSearchText(customer.status);
  const normalizedNotes = normalizeSearchText(customer.notes);

  const searchableText = [
    normalizedName,
    normalizedPhone,
    normalizedAddress,
    normalizedEmail,
    normalizedStatus,
    normalizedNotes,
  ]
    .filter(Boolean)
    .join(" ");

  let score = 0;

  if (phoneQuery && normalizedPhone.includes(phoneQuery)) {
    score += 120;
  }

  if (normalizedName === normalizedQuery) {
    score += 100;
  }

  if (normalizedName.includes(normalizedQuery)) {
    score += 80;
  }

  if (normalizedAddress.includes(normalizedQuery)) {
    score += 40;
  }

  if (searchableText.includes(normalizedQuery)) {
    score += 30;
  }

  queryTokens.forEach((token) => {
    if (token.length < 2) return;

    if (normalizedName.includes(token)) {
      score += 35;
    } else if (normalizedAddress.includes(token)) {
      score += 18;
    } else if (searchableText.includes(token)) {
      score += 10;
    }

    const bestNameSimilarity = getBestTokenSimilarity(
      token,
      getSearchTokens(normalizedName)
    );

    if (bestNameSimilarity >= 0.82) {
      score += 32;
    } else if (bestNameSimilarity >= 0.72) {
      score += 18;
    }

    const bestGeneralSimilarity = getBestTokenSimilarity(
      token,
      getSearchTokens(searchableText)
    );

    if (bestGeneralSimilarity >= 0.84) {
      score += 10;
    }
  });

  return score;
}

function normalizeSearchText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/ς/g, "σ")
    .replace(/αι/g, "ε")
    .replace(/ει/g, "ι")
    .replace(/οι/g, "ι")
    .replace(/υι/g, "ι")
    .replace(/γκ/g, "γ")
    .replace(/ντ/g, "δ")
    .replace(/μπ/g, "β")
    .replace(/τσ/g, "τζ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getSearchTokens(value) {
  return String(value || "")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

function getBestTokenSimilarity(token, candidates) {
  if (!token || !Array.isArray(candidates) || !candidates.length) {
    return 0;
  }

  return candidates.reduce((best, candidate) => {
    return Math.max(best, getStringSimilarity(token, candidate));
  }, 0);
}

function getStringSimilarity(a, b) {
  const left = String(a || "");
  const right = String(b || "");

  if (!left || !right) return 0;
  if (left === right) return 1;

  const maxLength = Math.max(left.length, right.length);
  const distance = getLevenshteinDistance(left, right);

  return 1 - distance / maxLength;
}

function getLevenshteinDistance(a, b) {
  const left = String(a || "");
  const right = String(b || "");

  const dp = Array.from({ length: left.length + 1 }, () =>
    Array(right.length + 1).fill(0)
  );

  for (let i = 0; i <= left.length; i += 1) {
    dp[i][0] = i;
  }

  for (let j = 0; j <= right.length; j += 1) {
    dp[0][j] = j;
  }

  for (let i = 1; i <= left.length; i += 1) {
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;

      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }

  return dp[left.length][right.length];
}

function escapeIlikePattern(value) {
  return String(value || "").replace(/[\\%_]/g, (character) => `\\${character}`);
}



function hasGreekText(value) {
  return /[\u0370-\u03FF]/.test(String(value || ""));
}
function parseAppointmentRequest(message) {
  const normalized = normalizeGreek(message);

  if (/\b(βρες|αναζητησε|ψαξε)\b/.test(normalized) && normalized.includes("πελατ")) {
    return null;
  }

  if (normalized.includes("διαδρομ")) {
    return null;
  }

  const today = getCyprusTodayIso();

  const relativeRange = parseRelativeDateRange(normalized, today);

  if (relativeRange) {
    return {
      type: relativeRange.type,
      label: relativeRange.label,
      startDate: relativeRange.startDate,
      endDate: relativeRange.endDate
    };
  }

  const weekdayDate = parseWeekdayDate(normalized, today);

  if (weekdayDate) {
    return {
      type: "day",
      label: weekdayDate.label,
      startDate: weekdayDate.date,
      endDate: weekdayDate.date
    };
  }

  const parsedDate = parseSpecificDate(normalized, today);
  if (parsedDate?.error) {
    return parsedDate;
  }

  if (parsedDate?.date) {
    return {
      type: "day",
      label: formatDateForDisplay(parsedDate.date),
      startDate: parsedDate.date,
      endDate: parsedDate.date
    };
  }

  const looksLikeAppointmentQuestion =
    normalized.includes("ραντεβ") ||
    normalized.includes("τι εχω") ||
    normalized.includes("προγραμμα");

  return looksLikeAppointmentQuestion
    ? {
        error:
          "Πες μου για ποια ημερομηνία θέλεις να δω ραντεβού, π.χ. σήμερα, αύριο ή 18/07/2026."
      }
    : null;
}

function parseSpecificDate(normalizedMessage, todayIso) {
  const isoMatch = normalizedMessage.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (isoMatch) {
    return buildIsoDateResult(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));
  }

  const numericMatch = normalizedMessage.match(/\b(\d{1,2})[/. -](\d{1,2})(?:[/. -](\d{2,4}))?\b/);
  if (numericMatch) {
    const year = normalizeYear(numericMatch[3], todayIso);
    return buildIsoDateResult(year, Number(numericMatch[2]), Number(numericMatch[1]));
  }

  const monthNames = {
    ιανουαριου: 1,
    ιανουαριος: 1,
    φεβρουαριου: 2,
    φεβρουαριος: 2,
    μαρτιου: 3,
    μαρτιος: 3,
    απριλιου: 4,
    απριλιος: 4,
    μαιου: 5,
    μαιος: 5,
    ιουνιου: 6,
    ιουνιος: 6,
    ιουλιου: 7,
    ιουλιος: 7,
    αυγουστου: 8,
    αυγουστος: 8,
    σεπτεμβριου: 9,
    σεπτεμβριος: 9,
    οκτωβριου: 10,
    οκτωβριος: 10,
    νοεμβριου: 11,
    νοεμβριος: 11,
    δεκεμβριου: 12,
    δεκεμβριος: 12
  };
  const monthPattern = Object.keys(monthNames).join("|");
  const greekDateMatch = normalizedMessage.match(
    new RegExp(`\\b(\\d{1,2})(?:η)?\\s+(${monthPattern})(?:\\s+(\\d{4}))?\\b`)
  );

  if (greekDateMatch) {
    const year = normalizeYear(greekDateMatch[3], todayIso);
    return buildIsoDateResult(
      year,
      monthNames[greekDateMatch[2]],
      Number(greekDateMatch[1])
    );
  }

  return null;
}


function parseWeekdayDate(normalizedMessage, todayIso) {
  const weekdays = [
    { name: "\u03ba\u03c5\u03c1\u03b9\u03b1\u03ba\u03b7", day: 0 },
    { name: "\u03b4\u03b5\u03c5\u03c4\u03b5\u03c1\u03b1", day: 1 },
    { name: "\u03c4\u03c1\u03b9\u03c4\u03b7", day: 2 },
    { name: "\u03c4\u03b5\u03c4\u03b1\u03c1\u03c4\u03b7", day: 3 },
    { name: "\u03c0\u03b5\u03bc\u03c0\u03c4\u03b7", day: 4 },
    { name: "\u03c0\u03b1\u03c1\u03b1\u03c3\u03ba\u03b5\u03c5\u03b7", day: 5 },
    { name: "\u03c3\u03b1\u03b2\u03b2\u03b1\u03c4\u03bf", day: 6 },
    { name: "sunday", day: 0 },
    { name: "monday", day: 1 },
    { name: "tuesday", day: 2 },
    { name: "wednesday", day: 3 },
    { name: "thursday", day: 4 },
    { name: "friday", day: 5 },
    { name: "saturday", day: 6 }
  ];
  const matched = weekdays.find((weekday) => normalizedMessage.includes(weekday.name));
  if (!matched) return null;

  const today = dateFromIso(todayIso);
  const todayDay = today.getUTCDay();
  let offset = matched.day - todayDay;
  if (offset < 0) offset += 7;

  return {
    date: addDaysIso(todayIso, offset),
    label: matched.name
  };
}

function normalizeYear(rawYear, todayIso) {
  if (!rawYear) return Number(todayIso.slice(0, 4));
  const year = Number(rawYear);
  return year < 100 ? 2000 + year : year;
}

function buildIsoDateResult(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  const valid =
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;

  if (!valid) {
    return { error: "Η ημερομηνία που ζήτησες δεν είναι έγκυρη." };
  }

  return { date: toIsoDate(date) };
}

function formatAppointmentReply(appointments, request) {
  if (!appointments.length) {
    if (request.type === "week") {
      return `Δεν έχεις προγραμματισμένα ραντεβού για την περίοδο ${formatDateForDisplay(
        request.startDate
      )} έως ${formatDateForDisplay(request.endDate)}.`;
    }

    return "Δεν έχεις προγραμματισμένα ραντεβού για αυτή την ημερομηνία.";
  }

  const grouped = groupAppointmentsByDate(appointments);
  const header =
    request.type === "week"
      ? `Το πρόγραμμα της εβδομάδας (${formatDateForDisplay(request.startDate)} - ${formatDateForDisplay(
          request.endDate
        )}):`
      : `Τα ραντεβού σου για ${request.label} (${formatDateForDisplay(request.startDate)}):`;

  const lines = [header];

  Object.entries(grouped).forEach(([date, dayAppointments]) => {
    lines.push("", formatDateForDisplay(date));
    dayAppointments.forEach((appointment, index) => {
      const time = appointment.appointment_time
        ? String(appointment.appointment_time).slice(0, 5)
        : "Χωρίς ώρα";
      const name = appointment.full_name || "Χωρίς όνομα";
      const address = appointment.address || "Χωρίς διεύθυνση";
      const status = appointment.status ? ` (${appointment.status})` : "";
      const notes = appointment.notes ? `\n   Σημειώσεις: ${appointment.notes}` : "";

      lines.push(`${index + 1}. ${time} — ${name}${status}\n   Διεύθυνση: ${address}${notes}`);
    });
  });

  return lines.join("\n");
}

function groupAppointmentsByDate(appointments) {
  return appointments.reduce((groups, appointment) => {
    const date = appointment.appointment_date;
    if (!date) return groups;
    groups[date] = groups[date] || [];
    groups[date].push(appointment);
    return groups;
  }, {});
}

function getBearerToken(request) {
  const header = request.headers.authorization || request.headers.Authorization || "";
  const match = String(header).match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

function getCyprusTodayIso() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `${values.year}-${values.month}-${values.day}`;
}

function getCurrentWeekRange(todayIso) {
  const today = dateFromIso(todayIso);
  const day = today.getUTCDay();
  const daysSinceMonday = (day + 6) % 7;
  const startDate = addDaysIso(todayIso, -daysSinceMonday);

  return {
    startDate,
    endDate: addDaysIso(startDate, 6)
  };
}

function addDaysIso(isoDate, days) {
  const date = dateFromIso(isoDate);
  date.setUTCDate(date.getUTCDate() + days);
  return toIsoDate(date);
}

function dateFromIso(isoDate) {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function toIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

function formatDateForDisplay(isoDate) {
  const [year, month, day] = isoDate.split("-");
  return `${day}/${month}/${year}`;
}

function normalizeGreek(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

async function generateImageAdviceWithRetryAndFallback(ai, message, history = [], image) {
  try {
    return {
      reply: await generateImageAdvice(ai, MODEL, message, history, image),
      model: MODEL
    };
  } catch (firstError) {
    if (!isRetryableGeminiError(firstError)) {
      throw firstError;
    }

    await delay(RETRY_DELAY_MS);

    try {
      return {
        reply: await generateImageAdvice(ai, MODEL, message, history, image),
        model: MODEL
      };
    } catch (secondError) {
      if (!isRetryableGeminiError(secondError)) {
        throw secondError;
      }

      return {
        reply: await generateImageAdvice(ai, FALLBACK_MODEL, message, history, image),
        model: FALLBACK_MODEL
      };
    }
  }
}

async function generateImageAdvice(ai, model, message, history = [], image) {
  const question = String(message || "").trim() ||
    "Ανάλυσε αυτή τη φωτογραφία για πιθανή φωτοβολταϊκή εγκατάσταση και δώσε μου πρακτική συμβουλή.";

  const contents = [
    ...history.map((item) => ({
      role: item.role === "assistant" ? "model" : "user",
      parts: [{ text: item.text }]
    })),
    {
      role: "user",
      parts: [
        {
          text: [
            `Ερώτηση χρήστη: ${question}`,
            "",
            "Ανάλυσε τη φωτογραφία με πρακτικό τρόπο για φωτοβολταϊκή επίσκεψη/εγκατάσταση."
          ].join("\n")
        },
        {
          inlineData: {
            mimeType: image.mimeType,
            data: image.data
          }
        }
      ]
    }
  ];

  const result = await withTimeout(
    ai.models.generateContent({
      model,
      contents,
      config: {
        systemInstruction: IMAGE_SYSTEM_INSTRUCTION,
        temperature: 0.25
      }
    }),
    GEMINI_TIMEOUT_MS
  );

  const reply = String(result.text || "").trim();

  if (!reply) {
    throw new Error("Empty Gemini image response");
  }

  return reply;
}

async function generateWithRetryAndFallback(ai, message, history = []) {
  try {
    return {
      reply: await generateReply(ai, MODEL, message, history),
      model: MODEL
    };
  } catch (firstError) {
    if (!isRetryableGeminiError(firstError)) {
      throw firstError;
    }

    await delay(RETRY_DELAY_MS);

    try {
      return {
        reply: await generateReply(ai, MODEL, message, history),
        model: MODEL
      };
    } catch (secondError) {
      if (!isRetryableGeminiError(secondError)) {
        throw secondError;
      }

      return {
        reply: await generateReply(ai, FALLBACK_MODEL, message, history),
        model: FALLBACK_MODEL
      };
    }
  }
}

async function generateReply(ai, model, message, history = []) {
  const contents = [
    ...history.map((item) => ({
      role: item.role === "assistant" ? "model" : "user",
      parts: [{ text: item.text }]
    })),
    {
      role: "user",
      parts: [{ text: message }]
    }
  ];

  const result = await withTimeout(
    ai.models.generateContent({
      model,
      contents,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        temperature: 0.4
      }
    }),
    GEMINI_TIMEOUT_MS
  );

  const reply = String(result.text || "").trim();

  if (!reply) {
    throw new Error("Empty Gemini response");
  }

  return reply;
}

function isRetryableGeminiError(error) {
  const status = getErrorStatus(error);

  if ([400, 401, 403].includes(status)) {
    return false;
  }

  if (status === 503) {
    return true;
  }

  const message = String(error?.message || "").toLowerCase();

  return (
    message.includes("high demand") ||
    message.includes("overloaded") ||
    message.includes("temporarily unavailable") ||
    message.includes("service unavailable")
  );
}

function getErrorStatus(error) {
  const candidates = [
    error?.status,
    error?.code,
    error?.response?.status,
    error?.cause?.status,
    error?.cause?.code
  ];

  for (const candidate of candidates) {
    const status = Number(candidate);

    if (Number.isInteger(status)) {
      return status;
    }
  }

  const statusMatch = String(error?.message || "").match(/\b(\d{3})\b/);

  return statusMatch ? Number(statusMatch[1]) : 0;
}

function withTimeout(promise, timeoutMs) {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      const error = new Error("Gemini request timed out");
      error.status = 503;
      reject(error);
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timeoutId);
  });
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}






