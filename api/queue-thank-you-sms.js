import { getServerEnv } from "../src/server/serverEnv.js";

export default async function handler(request, response) {
  if (request.method !== "POST") {
    return response.status(405).json({ error: "Method not allowed" });
  }

  const configError = validateConfig();
  if (configError) {
    return response
      .status(configError.status)
      .json({ error: configError.message });
  }

  try {
    const user = await requireAuthenticatedUser(request);
    const body = await readJsonBody(request);

    const mode = String(body.mode || "").trim();

    if (mode === "route_options") {
      const job = await insertRouteOptionsJob(body, user);

      return response.status(200).json({
        queued: true,
        duplicate: false,
        job,
        message: "Το SMS επιλογών μπήκε στην ουρά.",
      });
    }

    if (mode === "arrival_soon" || mode === "arrival_eta" || mode === "arrival_watch") {
      const result = await queueArrivalSms(body, user, mode);

      return response.status(200).json(result);
    }

    const customerId = body.customerId;

    if (!customerId) {
      return response.status(400).json({ error: "Missing customerId." });
    }

    const customer = await fetchCustomer(customerId);

    if (!customer) {
      return response.status(404).json({ error: "Customer not found." });
    }

    if (customer.user_id && customer.user_id !== user.id) {
      return response.status(403).json({
        error: "You are not allowed to queue SMS for this customer.",
      });
    }

    if (String(customer.status || "").trim().toLowerCase() !== "completed") {
      return response.status(400).json({
        error: "Thank You SMS can only be queued for completed appointments.",
      });
    }

    if (!customer.appointment_date) {
      return response.status(400).json({
        error: "This customer does not have an appointment date.",
      });
    }

    const recipientPhone = normalizeCyprusPhone(customer.phone);

    if (!recipientPhone) {
      return response.status(400).json({
        error: "Customer phone number is missing.",
      });
    }

    const existingJob = await findExistingThankYouJob(customer);

    if (existingJob) {
      const alreadySent =
        String(existingJob.status || "").toLowerCase() === "sent";

      return response.status(200).json({
        queued: false,
        duplicate: true,
        alreadySent,
        job: existingJob,
        message: alreadySent
          ? "A Thank You SMS was already sent for this appointment."
          : "A Thank You SMS is already queued for this appointment.",
      });
    }

    const job = await insertThankYouJob(customer, recipientPhone);

    return response.status(200).json({
      queued: true,
      duplicate: false,
      job,
    });
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("Unable to queue Thank You SMS", error);
    } else {
      console.error("Unable to queue Thank You SMS", error.message || error);
    }

    return response.status(error.status || 500).json({
      error: error.message || "Unable to queue Thank You SMS",
    });
  }
}

function validateConfig() {
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

async function requireAuthenticatedUser(request) {
  const authorization =
    request.headers.authorization || request.headers.Authorization || "";

  const token = authorization.startsWith("Bearer ")
    ? authorization.slice(7)
    : "";

  if (!token) {
    throw createHttpError(401, "Missing Supabase authorization token.");
  }

  const result = await fetch(`${getSupabaseUrl()}/auth/v1/user`, {
    headers: {
      apikey: getServerEnv("SUPABASE_SERVICE_ROLE_KEY"),
      Authorization: `Bearer ${token}`,
    },
  });

  if (!result.ok) {
    throw createHttpError(401, "Invalid Supabase authorization token.");
  }

  return result.json();
}

async function readJsonBody(request) {
  if (request.body && typeof request.body === "object") {
    return request.body;
  }

  const chunks = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const rawBody = Buffer.concat(chunks).toString("utf8");

  if (!rawBody) {
    return {};
  }

  try {
    return JSON.parse(rawBody);
  } catch {
    throw createHttpError(400, "Invalid JSON body.");
  }
}

async function fetchCustomer(customerId) {
  const params = new URLSearchParams({
    select:
      "id,user_id,full_name,customer_title,sms_salutation_name,phone,status,appointment_date,appointment_time",
    id: `eq.${customerId}`,
    limit: "1",
  });

  const rows = await supabaseRequest(
    `/rest/v1/customers?${params.toString()}`
  );

  return rows[0] || null;
}

async function findExistingThankYouJob(customer) {
  const params = new URLSearchParams({
    select: "id,status,created_at,message,appointment_time",
    customer_id: `eq.${customer.id}`,
    appointment_date: `eq.${customer.appointment_date}`,
  });

  const rows = await supabaseRequest(
    `/rest/v1/sms_queue?${params.toString()}`
  );

  return rows.find((row) => isThankYouMessage(row.message)) || null;
}

function isThankYouMessage(message = "") {
  const text = String(message || "")
    .trim()
    .toLowerCase();

  return (
    text.includes(
      "σας ευχαριστούμε για τον χρόνο και την εμπιστοσύνη"
    ) ||
    text.includes(
      "thank you for your time and for the trust"
    )
  );
}

function buildThankYouMessage(customer) {
  const language = getCustomerMessageLanguage(customer);
  const greeting = getCustomerGreeting(customer, language);

  if (language === "en") {
    return `${greeting}

Thank you for your time and for the trust you showed in SolarVisit.

We remain at your disposal for any further information or support you may need.

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

Σας ευχαριστούμε για τον χρόνο και την εμπιστοσύνη που δείξατε στην SolarVisit.

Παραμένουμε στη διάθεσή σας για οποιαδήποτε περαιτέρω ενημέρωση ή υποστήριξη.

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

  /*
   * 1η προτεραιότητα:
   * Το πεδίο "Προσφώνηση στο μήνυμα".
   *
   * Αν εδώ υπάρχει τιμή, αυτό αποφασίζει τη γλώσσα.
   */
  if (salutationName) {
    if (/[Α-Ωα-ωΆΈΉΊΌΎΏάέήίόύώΐΰ]/.test(salutationName)) {
      return "el";
    }

    if (/[A-Za-z]/.test(salutationName)) {
      return "en";
    }
  }

  /*
   * Backup:
   * Μόνο αν η προσφώνηση είναι κενή,
   * κοιτάμε το Ονοματεπώνυμο.
   */
  const fullName = String(customer.full_name || "").trim();

  if (/[Α-Ωα-ωΆΈΉΊΌΎΏάέήίόύώΐΰ]/.test(fullName)) {
    return "el";
  }

  if (/[A-Za-z]/.test(fullName)) {
    return "en";
  }

  /*
   * Ασφαλές default για Κύπρο.
   */
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

async function insertThankYouJob(customer, recipientPhone) {
  const basePayload = {
    customer_id: customer.id,
    message: buildThankYouMessage(customer),
    appointment_date: customer.appointment_date,
    appointment_time: formatAppointmentTime(customer.appointment_time),
    status: "pending",
  };

  try {
    const rows = await insertSmsQueuePayload(basePayload, recipientPhone);
    return rows[0];
  } catch (error) {
    if (!isUniqueConflict(error)) {
      throw error;
    }

    const rows = await insertSmsQueuePayload(
      {
        ...basePayload,
        appointment_time: buildThankYouAppointmentTime(
          customer.appointment_time
        ),
      },
      recipientPhone
    );

    return rows[0];
  }
}

async function insertSmsQueuePayload(basePayload, phone) {
  return supabaseRequest("/rest/v1/sms_queue", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: {
      ...basePayload,
      phone,
    },
  });
}

async function queueArrivalSms(body, user, mode) {
  const customerId = String(body.customerId || "").trim();

  if (!customerId) {
    throw createHttpError(400, "Missing customerId.");
  }

  const customer = await fetchCustomer(customerId);

  if (!customer) {
    throw createHttpError(404, "Customer not found.");
  }

  if (customer.user_id && customer.user_id !== user.id) {
    throw createHttpError(403, "You are not allowed to queue SMS for this customer.");
  }

  if (!isScheduledCustomerStatus(customer.status)) {
    throw createHttpError(400, "Arrival SMS can only be queued for scheduled appointments.");
  }

  if (!customer.appointment_date) {
    throw createHttpError(400, "This customer does not have an appointment date.");
  }

  const recipientPhone = normalizeCyprusPhone(customer.phone);

  if (!recipientPhone) {
    throw createHttpError(400, "Customer phone number is missing.");
  }

  const etaTime = formatAppointmentTime(body.etaTime);
  const isWatchMode = mode === "arrival_watch";
  const arrivalMode = mode === "arrival_eta" && etaTime ? "arrival_eta" : "arrival_soon";
  const smsStatus = isWatchMode ? "watching" : "pending";
  const arrivalAppointmentTime = buildArrivalAppointmentTime(
    customer.appointment_time,
    isWatchMode ? "arrival_watch" : arrivalMode,
    etaTime
  );

  const existingJob = await findExistingArrivalJob(customer);

  if (existingJob) {
    const alreadySent = String(existingJob.status || "").toLowerCase() === "sent";

    return {
      queued: false,
      duplicate: true,
      alreadySent,
      job: existingJob,
      message: buildExistingArrivalJobMessage(existingJob),
    };
  }

  const rows = await insertSmsQueuePayload(
    {
      customer_id: customer.id,
      message: buildArrivalMessage(customer, {
        mode: arrivalMode,
        etaTime,
      }),
      appointment_date: customer.appointment_date,
      appointment_time: arrivalAppointmentTime,
      status: smsStatus,
    },
    recipientPhone
  );

  return {
    queued: true,
    duplicate: false,
    watching: isWatchMode,
    job: rows[0],
    message: isWatchMode
      ? "Το SMS άφιξης μπήκε σε GPS παρακολούθηση. Το Android θα το στείλει όταν πλησιάσεις περίπου στα 10 λεπτά."
      : "Το SMS άφιξης μπήκε στην ουρά για αποστολή από Android.",
  };
}

function isScheduledCustomerStatus(status = "") {
  const normalizedStatus = String(status || "").trim().toLowerCase();

  return ![
    "completed",
    "visited",
    "done",
    "accepted",
    "cancelled",
    "canceled",
    "rejected",
  ].includes(normalizedStatus);
}

async function findExistingArrivalJob(customer) {
  const params = new URLSearchParams({
    select: "id,status,created_at,sent_at,error,message,appointment_time",
    customer_id: `eq.${customer.id}`,
    appointment_date: `eq.${customer.appointment_date}`,
    order: "created_at.desc",
  });

  const rows = await supabaseRequest(
    `/rest/v1/sms_queue?${params.toString()}`
  );

  const currentAppointmentTime = formatAppointmentTime(
    customer.appointment_time
  );

  return (
    rows.find((row) => {
      const status = String(row.status || "").trim().toLowerCase();

      if (status === "cancelled" || status === "failed") {
        return false;
      }

      return (
        isArrivalSmsJob(row) &&
        formatAppointmentTime(row.appointment_time) === currentAppointmentTime
      );
    }) || null
  );
}

function isArrivalSmsJob(row = {}) {
  const appointmentTime = String(row.appointment_time || "").toLowerCase();
  const message = String(row.message || "").toLowerCase();

  return (
    appointmentTime.includes("arrival-soon") ||
    appointmentTime.includes("arrival-eta") ||
    appointmentTime.includes("arrival-watch") ||
    appointmentTime.includes("auto-arrival") ||
    message.includes("15 λεπτά") ||
    message.includes("15 λεπτα") ||
    message.includes("30 λεπτά") ||
    message.includes("30 λεπτα") ||
    message.includes("10 λεπτά μακριά") ||
    message.includes("10 λεπτα μακρια") ||
    message.includes("υπολογίζουμε να φτάσουμε") ||
    message.includes("υπολογιζουμε να φτασουμε") ||
    message.includes("estimated arrival time") ||
    message.includes("approximately 15 minutes") ||
    message.includes("approximately 30 minutes") ||
    message.includes("about 10 minutes away")
  );
}

function buildArrivalAppointmentTime(appointmentTime, mode, etaTime) {
  const baseTime = formatAppointmentTime(appointmentTime);
  const suffix =
    mode === "arrival_eta"
      ? `arrival-eta ${etaTime}`
      : mode === "arrival_watch"
        ? "arrival-watch"
        : "arrival-soon";

  return baseTime ? `${baseTime} ${suffix}` : suffix;
}

function buildExistingArrivalJobMessage(existingJob = {}) {
  const status = String(existingJob.status || "").toLowerCase();

  if (status === "sent") {
    return "Το SMS άφιξης έχει ήδη σταλεί για αυτό το ραντεβού.";
  }

  if (status === "watching") {
    return "Το SMS άφιξης παρακολουθείται ήδη από το Android GPS για αυτό το ραντεβού.";
  }

  return "Το SMS άφιξης είναι ήδη στην ουρά για αυτό το ραντεβού.";
}

function buildArrivalMessage(customer, { mode, etaTime }) {
  const language = getCustomerMessageLanguage(customer);
  const greeting = getCustomerGreeting(customer, language);

  if (language === "en") {
    if (mode === "arrival_eta" && etaTime) {
      return `${greeting}

We are on our way and our estimated arrival time is approximately ${etaTime}.

Best regards,
Demo Sales Engineer
Sales Engineer
SolarVisit
www.example.com
T. 00000000
E. engineer@example.com`;
    }

    return `${greeting}

We are about 10 minutes away for your scheduled photovoltaic site visit.

Best regards,
Demo Sales Engineer
Sales Engineer
SolarVisit
www.example.com
T. 00000000
E. engineer@example.com`;
  }

  if (mode === "arrival_eta" && etaTime) {
    return `${greeting}

Ερχόμαστε προς τον χώρο σας και υπολογίζουμε να φτάσουμε περίπου στις ${etaTime}.

Με εκτίμηση,
Demo Sales Engineer
Sales Engineer
SolarVisit
www.example.com
Τ. 00000000
E. engineer@example.com`;
  }

  return `${greeting}

Σας ενημερώνουμε ότι είμαστε περίπου 10 λεπτά μακριά για την προγραμματισμένη επίσκεψη φωτοβολταϊκών.

Με εκτίμηση,
Demo Sales Engineer
Sales Engineer
SolarVisit
www.example.com
Τ. 00000000
E. engineer@example.com`;
}

function validateRouteOptionsBody(body) {
  const customerName = String(body.customerName || "").trim();
  const customerTitle = normalizeCustomerTitle(body.customerTitle);
  const smsSalutationName = String(body.smsSalutationName || "").trim();
  const phone = normalizeCyprusPhone(body.phone);
  const address = String(body.address || "").trim();
  const appointmentDate = String(body.appointmentDate || "").trim();
  const option1Time = formatAppointmentTime(body.option1Time);
  const option2Time = formatAppointmentTime(body.option2Time);

  if (!customerName) {
    throw createHttpError(400, "Missing customer name.");
  }

  if (!phone) {
    throw createHttpError(400, "Customer phone number is missing or invalid.");
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(appointmentDate)) {
    throw createHttpError(400, "Missing or invalid appointment date.");
  }

  if (
    !/^\d{2}:\d{2}$/.test(option1Time) ||
    !/^\d{2}:\d{2}$/.test(option2Time)
  ) {
    throw createHttpError(400, "Missing or invalid route option times.");
  }

  return {
    customerName,
    customerTitle,
    smsSalutationName,
    phone,
    address,
    appointmentDate,
    option1Time,
    option2Time,
  };
}

function normalizeCustomerTitle(value) {
  return isFemaleCustomerTitle(value) ? "ms" : "mr";
}

async function insertRouteOptionsJob(body, user) {
  const routeOptions = validateRouteOptionsBody(body);

  const rows = await insertSmsQueuePayload(
    {
      customer_id: null,
      message: buildRouteOptionsMessage(routeOptions),
      appointment_date: routeOptions.appointmentDate,
      appointment_time: `route-options ${routeOptions.option1Time}/${routeOptions.option2Time}`,
      status: "pending",
    },
    routeOptions.phone
  );

  const smsJob = rows[0];

  await tryInsertRouteSmsRequest({
    userId: user.id,
    smsQueueId: smsJob.id,
    routeOptions,
  });

  return smsJob;
}

async function tryInsertRouteSmsRequest({ userId, smsQueueId, routeOptions }) {
  try {
    const rows = await supabaseRequest("/rest/v1/route_sms_requests", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: {
        user_id: userId,
        sms_queue_id: smsQueueId,
        customer_name: routeOptions.customerName,
        customer_title: routeOptions.customerTitle || null,
        sms_salutation_name: routeOptions.smsSalutationName || null,
        phone: routeOptions.phone,
        address: routeOptions.address || null,
        appointment_date: routeOptions.appointmentDate,
        option1_time: routeOptions.option1Time,
        option2_time: routeOptions.option2Time,
        status: "waiting_reply",
      },
    });

    return rows[0] || null;
  } catch (error) {
    /*
     * Phase 1 safety:
     * The important part is to queue the SMS in sms_queue so the Android
     * Companion can send it. route_sms_requests is only for the later
     * reply-tracking/Gemini flow, so a missing table must not block SMS queueing.
     */
    console.warn(
      "Route SMS request tracking was skipped.",
      error.message || error
    );

    return null;
  }
}

function buildRouteOptionsMessage({
  customerName,
  customerTitle,
  smsSalutationName,
  appointmentDate,
  option1Time,
  option2Time,
}) {
  const customer = {
    full_name: customerName,
    customer_title: customerTitle,
    sms_salutation_name: smsSalutationName,
  };

  const language = getCustomerMessageLanguage(customer);
  const greeting = getCustomerGreeting(customer, language);

  if (language === "en") {
    return `${greeting}

Regarding your photovoltaic site visit on ${formatDateForSms(appointmentDate)}, the following time slots are available:

1) ${option1Time}
2) ${option2Time}

Please reply with 1 or 2 to confirm the time that suits you best. If neither option is convenient, please suggest another suitable time.

Best regards,
Demo Sales Engineer
Sales Engineer
SolarVisit
www.example.com
T. 00000000
E. engineer@example.com`;
  }

  return `${greeting}

Σχετικά με την επίσκεψη για φωτοβολταϊκό σύστημα στις ${formatDateForSms(appointmentDate)}, οι διαθέσιμες ώρες είναι:

1) ${option1Time}
2) ${option2Time}

Παρακαλώ απαντήστε με 1 ή 2 για επιβεβαίωση της ώρας που σας εξυπηρετεί. Αν δεν σας εξυπηρετεί καμία από τις δύο επιλογές, μπορείτε να μας προτείνετε άλλη διαθέσιμη ώρα.

Με εκτίμηση,
Demo Sales Engineer
Sales Engineer
SolarVisit
www.example.com
Τ. 00000000
E. engineer@example.com`;
}

function formatDateForSms(value) {
  const [year, month, day] = String(value || "").split("-");

  if (!year || !month || !day) {
    return value;
  }

  return `${day}/${month}/${year}`;
}

async function supabaseRequest(path, options = {}) {
  const serviceRoleKey = getServerEnv("SUPABASE_SERVICE_ROLE_KEY");

  const result = await fetch(`${getSupabaseUrl()}${path}`, {
    method: options.method || "GET",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!result.ok) {
    const body = await result.text();

    throw createHttpError(
      result.status,
      `Supabase request failed (${result.status}): ${body}`
    );
  }

  if (result.status === 204) {
    return null;
  }

  return result.json();
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

function formatAppointmentTime(time) {
  if (!time) {
    return "";
  }

  const [hours = "", minutes = ""] = String(time).split(":");

  if (!hours || !minutes) {
    return String(time);
  }

  return `${hours.padStart(2, "0")}:${minutes.padStart(2, "0")}`;
}

function buildThankYouAppointmentTime(time) {
  const appointmentTime = formatAppointmentTime(time);

  return appointmentTime ? `${appointmentTime} thank-you` : "thank-you";
}

function isUniqueConflict(error) {
  const message = String(error.message || "").toLowerCase();

  return (
    message.includes("23505") ||
    message.includes("duplicate key") ||
    message.includes("unique")
  );
}

function createHttpError(status, message) {
  const error = new Error(message);
  error.status = status;

  return error;
}

function getSupabaseUrl() {
  return getServerEnv("SUPABASE_URL") || getServerEnv("VITE_SUPABASE_URL");
}