import { getServerEnv } from "../src/server/serverEnv.js";

const CYPRUS_TIME_ZONE = "Asia/Nicosia";
const EXCLUDED_STATUSES = new Set([
  "completed",
  "cancelled",
  "canceled",
  "rejected",
  "visited",
]);

export default async function handler(request, response) {
  if (!["GET", "POST"].includes(request.method)) {
    return response.status(405).json({ error: "Method not allowed" });
  }

  const configError = validateCronConfig(request);
  if (configError) {
    return response
      .status(configError.status)
      .json({ error: configError.message });
  }

  const now = new Date();
  const cyprusNow = getCyprusParts(now);
  const appointmentDate = getTomorrowInCyprus(now);

  try {
    const customers = await fetchTomorrowAppointments(appointmentDate);
    const activeAppointments = customers.filter(
      (customer) => !isExcludedStatus(customer.status)
    );
    const results = [];

    console.log("SMS reminder cron checked appointments", {
      appointmentDate,
      foundCustomers: customers.length,
      activeAppointments: activeAppointments.length,
    });

    for (const customer of activeAppointments) {
      const phone = normalizeSmsPhone(customer.phone);

      if (!phone) {
        console.warn(
          "SMS reminder skipped because customer phone is missing or invalid",
          {
            customerId: customer.id,
            customerName: customer.full_name,
            appointmentDate: customer.appointment_date,
            appointmentTime: formatAppointmentTime(customer.appointment_time),
          }
        );

        results.push({
          customerId: customer.id,
          customerName: customer.full_name,
          status: "skipped",
          reason: "missing_mobile_phone",
        });

        continue;
      }

      const existingJob = await findQueueJob(customer);

      if (existingJob) {
        results.push({
          customerId: customer.id,
          jobId: existingJob.id,
          status: "skipped",
          reason: "already_queued",
        });

        continue;
      }

      const job = await insertQueueJob(customer, phone);

      results.push({
        customerId: customer.id,
        jobId: job.id,
        status: "queued",
      });
    }

    return response.status(200).json({
      appointmentDate,
      cyprusTime: `${cyprusNow.date} ${String(cyprusNow.hour).padStart(
        2,
        "0"
      )}:${String(cyprusNow.minute).padStart(2, "0")}`,
      totalAppointments: activeAppointments.length,
      queued: results.filter((result) => result.status === "queued").length,
      skipped: results.filter((result) => result.status === "skipped").length,
      results,
    });
  } catch (error) {
    console.error("SMS queue creation failed", error);

    return response.status(500).json({
      error: error.message || "SMS queue creation failed",
    });
  }
}

function validateCronConfig(request) {
  const cronSecret = getServerEnv("CRON_SECRET");

  if (!cronSecret) {
    return {
      status: 500,
      message:
        "Missing CRON_SECRET. SMS queue creation will not run without cron protection.",
    };
  }

  if (!isAuthorized(request, cronSecret)) {
    return { status: 401, message: "Unauthorized cron request." };
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
      message: `Missing required environment variables: ${missingVariables.join(
        ", "
      )}`,
    };
  }

  return null;
}

async function fetchTomorrowAppointments(appointmentDate) {
  const params = new URLSearchParams({
    select:
      "id,full_name,customer_title,sms_salutation_name,phone,status,appointment_date,appointment_time",
    appointment_date: `eq.${appointmentDate}`,
    order: "appointment_time.asc",
  });

  return supabaseRequest(`/rest/v1/customers?${params.toString()}`);
}

async function findQueueJob(customer) {
  const params = new URLSearchParams({
    select: "id,status",
    customer_id: `eq.${customer.id}`,
    appointment_date: `eq.${customer.appointment_date}`,
    appointment_time: `eq.${formatAppointmentTime(customer.appointment_time)}`,
    limit: "1",
  });

  const jobs = await supabaseRequest(`/rest/v1/sms_queue?${params.toString()}`);

  return jobs[0] || null;
}

async function insertQueueJob(customer, phone) {
  const payload = {
    customer_id: customer.id,
    phone,
    message: buildReminderMessage(customer),
    appointment_date: customer.appointment_date,
    appointment_time: formatAppointmentTime(customer.appointment_time),
    status: "pending",
  };

  const rows = await supabaseRequest("/rest/v1/sms_queue", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: payload,
  });

  return rows[0];
}

async function supabaseRequest(path, options = {}) {
  const supabaseUrl = getSupabaseUrl();
  const serviceRoleKey = getServerEnv("SUPABASE_SERVICE_ROLE_KEY");

  const headers = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  const result = await fetch(`${supabaseUrl}${path}`, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!result.ok) {
    const body = await result.text();
    throw new Error(`Supabase request failed (${result.status}): ${body}`);
  }

  if (result.status === 204) return null;

  return result.json();
}

function buildReminderMessage(customer) {
  const language = getCustomerMessageLanguage(customer);
  const greeting = getCustomerGreeting(customer, language);
  const time = formatAppointmentTime(customer.appointment_time);

  if (language === "en") {
    return `${greeting}

We look forward to meeting you tomorrow at ${time}, according to our scheduled appointment.

Thank you for your trust.

Best regards,
Christos Chatzikyriakos
MSc Artificial Intelligence, BSc Mechanical Engineering
Sales Engineer
SolarVisit
www.example.com
T. 00000000
E. engineer@example.com`;
  }

  return `${greeting}

Θα χαρούμε να σας συναντήσουμε αύριο στις ${time}, σύμφωνα με το προγραμματισμένο μας ραντεβού.

Σας ευχαριστούμε για την εμπιστοσύνη σας.

Με εκτίμηση,
Demo Sales Engineer
MSc Artificial Intelligence, BSc Mechanical Engineering
Sales Engineer
SolarVisit
www.example.com
Τ. 00000000
E. engineer@example.com`;
}

function getCustomerMessageLanguage(customer) {
  const salutationName = String(
    customer.sms_salutation_name || ""
  ).trim();

  // 1η προτεραιότητα:
  // Το πεδίο "Προσφώνηση στο μήνυμα"
  if (salutationName) {
    if (/[Α-Ωα-ωΆΈΉΊΌΎΏάέήίόύώΐΰ]/.test(salutationName)) {
      return "el";
    }

    if (/[A-Za-z]/.test(salutationName)) {
      return "en";
    }
  }

  // Backup μόνο όταν η προσφώνηση είναι κενή
  const fullName = String(customer.full_name || "").trim();

  if (/[Α-Ωα-ωΆΈΉΊΌΎΏάέήίόύώΐΰ]/.test(fullName)) {
    return "el";
  }

  if (/[A-Za-z]/.test(fullName)) {
    return "en";
  }

  // Default αν δεν υπάρχουν αναγνωρίσιμοι χαρακτήρες
  return "el";
}

function getCustomerGreeting(customer, language) {
  const salutationName = String(
    customer.sms_salutation_name || getLastName(customer.full_name) || ""
  ).trim();

  if (!salutationName) {
    return language === "en" ? "Dear customer," : "Αγαπητέ πελάτη,";
  }

  const isFemale = isFemaleCustomerTitle(customer.customer_title);

  if (language === "en") {
    return isFemale
      ? `Dear Ms. ${salutationName},`
      : `Dear Mr. ${salutationName},`;
  }

  return isFemale
    ? `Αγαπητή κα ${salutationName},`
    : `Αγαπητέ κ. ${salutationName},`;
}

function isFemaleCustomerTitle(value) {
  const title = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

  return (
    title === "mrs" ||
    title === "ms" ||
    title === "miss" ||
    title === "κυρια" ||
    title === "κα" ||
    title === "female" ||
    title === "woman" ||
    title === "f"
  );
}

function getLastName(fullName) {
  const parts = String(fullName || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  return parts[parts.length - 1] || "";
}

function isAuthorized(request, secret) {
  const authorization =
    request.headers.authorization || request.headers.Authorization;
  const companionHeader = request.headers["x-android-companion-secret"];
  const vercelCronHeader = request.headers["x-vercel-cron"];

  return (
    authorization === `Bearer ${secret}` ||
    companionHeader === secret ||
    vercelCronHeader === "1"
  );
}

function isExcludedStatus(status = "") {
  return EXCLUDED_STATUSES.has(String(status).trim().toLowerCase());
}

function normalizeSmsPhone(phone = "") {
  const digits = String(phone).replace(/\D/g, "");

  if (!digits) return null;

  if (digits.startsWith("00357") && digits.length === 13) {
    return `+357${digits.slice(5)}`;
  }

  if (digits.startsWith("357") && digits.length === 11) {
    return `+${digits}`;
  }

  if (digits.length === 8) {
    return `+357${digits}`;
  }

  return null;
}

function formatAppointmentTime(time) {
  if (!time) return "";

  const [hours = "", minutes = ""] = String(time).split(":");

  if (!hours || !minutes) return String(time);

  return `${hours.padStart(2, "0")}:${minutes.padStart(2, "0")}`;
}

function getSupabaseUrl() {
  return getServerEnv("SUPABASE_URL") || getServerEnv("VITE_SUPABASE_URL");
}

function getTomorrowInCyprus(date) {
  const parts = getCyprusParts(date);
  const utcDate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));

  utcDate.setUTCDate(utcDate.getUTCDate() + 1);

  return [
    utcDate.getUTCFullYear(),
    String(utcDate.getUTCMonth() + 1).padStart(2, "0"),
    String(utcDate.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function getCyprusParts(date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: CYPRUS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const valueByType = Object.fromEntries(
    parts.map((part) => [part.type, part.value])
  );

  return {
    year: Number(valueByType.year),
    month: Number(valueByType.month),
    day: Number(valueByType.day),
    hour: Number(valueByType.hour),
    minute: Number(valueByType.minute),
    date: `${valueByType.year}-${valueByType.month}-${valueByType.day}`,
  };
}