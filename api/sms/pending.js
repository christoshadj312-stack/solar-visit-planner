import { getServerEnv } from "../../src/server/serverEnv.js";

const ALLOWED_DASHBOARD_STATUSES = new Set([
  "pending",
  "sent",
  "failed",
  "cancelled",
  "watching",
]);

export default async function handler(request, response) {
  if (request.query?.mode === "arrival_watches") {
    if (request.method === "GET") {
      return handleArrivalWatchesRequest(request, response);
    }

    return response.status(405).json({
      error: "Method not allowed",
    });
  }

  if (request.query?.mode === "auto_arrival_sent") {
    if (request.method === "POST") {
      return handleAutoArrivalSentRequest(request, response);
    }

    return response.status(405).json({
      error: "Method not allowed",
    });
  }

  if (request.query?.mode === "validate_arrival") {
    if (request.method === "POST") {
      return handleValidateArrivalRequest(request, response);
    }

    return response.status(405).json({
      error: "Method not allowed",
    });
  }

  if (request.query?.mode === "claim_auto_arrival") {
    if (request.method === "POST") {
      return handleClaimAutoArrivalRequest(request, response);
    }

    return response.status(405).json({
      error: "Method not allowed",
    });
  }


  if (request.query?.mode === "device_request") {
    if (request.method === "POST") {
      return handleDeviceApprovalRequest(request, response);
    }

    return response.status(405).json({
      error: "Method not allowed",
    });
  }

  if (request.query?.mode === "devices") {
    if (request.method === "GET") {
      return handleDevicesDashboardRequest(request, response);
    }

    if (request.method === "POST") {
      return handleDevicesDashboardActionRequest(request, response);
    }

    return response.status(405).json({
      error: "Method not allowed",
    });
  }

  if (request.query?.mode === "dashboard") {
    if (request.method === "GET") {
      return handleDashboardRequest(request, response);
    }

    if (request.method === "POST") {
      return handleDashboardActionRequest(request, response);
    }

    return response.status(405).json({
      error: "Method not allowed",
    });
  }

  if (request.method !== "GET") {
    return response.status(405).json({
      error: "Method not allowed",
    });
  }

  return handleAndroidRequest(request, response);
}


async function handleDeviceApprovalRequest(request, response) {
  const serverConfigError = validateServerConfig();

  if (serverConfigError) {
    return response.status(serverConfigError.status).json({
      error: serverConfigError.message,
    });
  }

  try {
    await authenticateDashboardUser(request);

    const body = await readJsonBody(request);
    const deviceId = String(body.deviceId || body.device_id || "").trim();
    const deviceName = String(body.deviceName || body.device_name || "Android device")
      .trim()
      .slice(0, 160);
    const sellerName = String(body.sellerName || body.seller_name || "")
      .trim()
      .slice(0, 120);
    const senderPhone = normalizeDevicePhone(
      body.senderPhone || body.sender_phone || body.phone
    );

    if (!deviceId) {
      return response.status(400).json({
        error: "Δεν βρέθηκε η συσκευή Android.",
      });
    }

    if (!senderPhone) {
      return response.status(400).json({
        error: "Καταχώρισε έγκυρο τηλέφωνο, π.χ. +35799123456.",
      });
    }

    const now = new Date().toISOString();

    const rows = await supabaseRequest("/rest/v1/sms_sender_devices", {
      method: "POST",
      headers: {
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      body: {
        device_id: deviceId,
        device_name: deviceName || "Android device",
        seller_name: sellerName || null,
        sender_phone: senderPhone,
        is_active: false,
        approval_status: "pending",
        requested_at: now,
        approved_at: null,
        rejected_at: null,
        disabled_at: null,
        last_seen_at: now,
        updated_at: now,
      },
    });

    return response.status(200).json({
      device: mapSenderDevice(rows?.[0] || null),
      message: "Το αίτημα σύνδεσης στάλθηκε για έγκριση.",
    });
  } catch (error) {
    console.error("Unable to submit device approval request", error);

    return response.status(error.status || 500).json({
      error: error.message || "Δεν στάλθηκε το αίτημα σύνδεσης συσκευής.",
    });
  }
}

async function handleDevicesDashboardRequest(request, response) {
  const serverConfigError = validateServerConfig();

  if (serverConfigError) {
    return response.status(serverConfigError.status).json({
      error: serverConfigError.message,
    });
  }

  try {
    await authenticateDashboardUser(request);

    const devices = await loadSenderDevices();

    return response.status(200).json({
      devices: (devices || []).map(mapSenderDevice),
      summary: buildSenderDevicesSummary(devices || []),
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Unable to load sender devices", error);

    return response.status(error.status || 500).json({
      error: error.message || "Δεν ήταν δυνατή η φόρτωση των συσκευών.",
    });
  }
}

async function handleDevicesDashboardActionRequest(request, response) {
  const serverConfigError = validateServerConfig();

  if (serverConfigError) {
    return response.status(serverConfigError.status).json({
      error: serverConfigError.message,
    });
  }

  try {
    await authenticateDashboardUser(request);

    const body = await readJsonBody(request);
    const deviceId = String(body.deviceId || body.device_id || "").trim();
    const action = String(body.action || "").trim().toLowerCase();

    if (!deviceId) {
      return response.status(400).json({
        error: "Δεν βρέθηκε συσκευή.",
      });
    }

    if (!["approve", "reject", "deactivate"].includes(action)) {
      return response.status(400).json({
        error: "Μη έγκυρη ενέργεια συσκευής.",
      });
    }

    const existingDevice = await loadSenderDevice(deviceId);

    if (!existingDevice) {
      return response.status(404).json({
        error: "Δεν βρέθηκε η συσκευή.",
      });
    }

    if (action === "approve" && !normalizeDevicePhone(existingDevice.sender_phone)) {
      return response.status(400).json({
        error: "Δεν υπάρχει έγκυρος αριθμός για έγκριση.",
      });
    }

    const now = new Date().toISOString();
    const updates = buildSenderDeviceActionUpdates(action, now);
    const params = new URLSearchParams({
      device_id: `eq.${deviceId}`,
      select: "*",
    });

    const rows = await supabaseRequest(
      `/rest/v1/sms_sender_devices?${params.toString()}`,
      {
        method: "PATCH",
        headers: {
          Prefer: "return=representation",
        },
        body: updates,
      }
    );

    return response.status(200).json({
      device: mapSenderDevice(rows?.[0] || null),
      action,
      message: getSenderDeviceActionMessage(action),
    });
  } catch (error) {
    console.error("Unable to update sender device", error);

    return response.status(error.status || 500).json({
      error: error.message || "Δεν έγινε η αλλαγή στη συσκευή.",
    });
  }
}

async function handleDashboardRequest(request, response) {
  const serverConfigError = validateServerConfig();

  if (serverConfigError) {
    return response.status(serverConfigError.status).json({
      error: serverConfigError.message,
    });
  }

  try {
    const user = await authenticateDashboardUser(request);

    const requestedStatus = String(request.query?.status || "all")
      .trim()
      .toLowerCase();

    const requestedLimit = Number.parseInt(
      String(request.query?.limit || "200"),
      10
    );

    const limit = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(requestedLimit, 1), 500)
      : 200;

    const result = await loadDashboardMessages({
      userId: user.id,
      status: requestedStatus,
      limit,
    });

    return response.status(200).json({
      ...result,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Unable to load SMS dashboard", error);

    return response.status(error.status || 500).json({
      error: error.message || "Δεν ήταν δυνατή η φόρτωση των SMS.",
    });
  }
}

async function handleDashboardActionRequest(request, response) {
  const serverConfigError = validateServerConfig();

  if (serverConfigError) {
    return response.status(serverConfigError.status).json({
      error: serverConfigError.message,
    });
  }

  try {
    const user = await authenticateDashboardUser(request);
    const body = await readJsonBody(request);
    const action = String(body.action || "").trim().toLowerCase();
    const jobId = String(body.id || body.jobId || "").trim();

    if (!jobId) {
      return response.status(400).json({
        error: "Missing SMS job id.",
      });
    }

    const allowedActions = new Set(["cancel", "send_now", "resend"]);

    if (!allowedActions.has(action)) {
      return response.status(400).json({
        error: "Invalid SMS action.",
      });
    }

    const ownedJob = await findDashboardJobForUser({
      jobId,
      userId: user.id,
    });

    if (!ownedJob) {
      return response.status(404).json({
        error: "Δεν βρέθηκε SMS που να ανήκει στον χρήστη.",
      });
    }

    const now = new Date().toISOString();
    const updates =
      action === "cancel"
        ? {
            status: "cancelled",
            error: "Ακυρώθηκε χειροκίνητα από το Κέντρο Μηνυμάτων.",
          }
        : {
            status: "pending",
            sent_at: null,
            error: null,
          };

    const updatedRows = await updateSmsQueueJob(jobId, updates);
    await syncRouteRequestForSmsAction({
      smsQueueId: jobId,
      action,
      now,
    });

    return response.status(200).json({
      job: updatedRows[0] || null,
      action,
      message:
        action === "cancel"
          ? "Η αποστολή ακυρώθηκε."
          : "Το SMS μπήκε ξανά στην ουρά για αποστολή.",
    });
  } catch (error) {
    console.error("Unable to update SMS dashboard job", error);

    return response.status(error.status || 500).json({
      error: error.message || "Δεν ήταν δυνατή η αλλαγή κατάστασης του SMS.",
    });
  }
}

async function handleArrivalWatchesRequest(request, response) {
  const configError = validateCompanionConfig(request);

  if (configError) {
    return response.status(configError.status).json({
      error: configError.message,
    });
  }

  const deviceId = getHeaderValue(request, "x-android-device-id");
  const deviceName =
    getHeaderValue(request, "x-android-device-name") || "Android device";

  if (!deviceId) {
    return response.status(400).json({
      error: "Missing Android device ID.",
    });
  }

  try {
    const date = getRequestedDate(request);
    const senderDevice = await registerOrRefreshSenderDevice(deviceId, deviceName);

    if (!senderDevice.isActive) {
      return response.status(200).json({
        watches: [],
        date,
        senderDevice: {
          isActive: false,
          phone: senderDevice.senderPhone,
          deviceName: senderDevice.deviceName,
          lastSeenAt: senderDevice.lastSeenAt,
        },
      });
    }

    const [watches, appointments] = await Promise.all([
  loadArrivalWatchJobs(date),
  loadTodayArrivalAppointments(date),
]);

return response.status(200).json({
  watches,
  appointments,
  date,
  senderDevice: {
    isActive: senderDevice.isActive,
    phone: senderDevice.senderPhone,
    deviceName: senderDevice.deviceName,
    lastSeenAt: senderDevice.lastSeenAt,
  },
});

  } catch (error) {
    console.error("Unable to load arrival watch jobs", error);

    return response.status(500).json({
      error: error.message || "Unable to load arrival watch jobs",
    });
  }
}

async function handleAndroidRequest(request, response) {
  const configError = validateCompanionConfig(request);

  if (configError) {
    return response.status(configError.status).json({
      error: configError.message,
    });
  }

  const deviceId = getHeaderValue(request, "x-android-device-id");
  const deviceName =
    getHeaderValue(request, "x-android-device-name") || "Android device";

  if (!deviceId) {
    return response.status(400).json({
      error: "Missing Android device ID.",
    });
  }

  try {
    const date = getRequestedDate(request);
    const appointmentsOnly = request.query?.mode === "appointments";

    const senderDevice = await registerOrRefreshSenderDevice(
      deviceId,
      deviceName
    );

    let appointments = [];

    if (appointmentsOnly) {
      const appointmentParams = new URLSearchParams({
        select: "id,full_name,address,appointment_date,appointment_time,status",
        appointment_date: `eq.${date}`,
        order: "appointment_time.asc",
        limit: "20",
      });

      appointments = await supabaseRequest(
        `/rest/v1/customers?${appointmentParams.toString()}`
      );
    }

    let jobs = [];

    if (!appointmentsOnly && senderDevice.isActive) {
      const smsParams = new URLSearchParams({
        select:
          "id,customer_id,phone,message,appointment_date,appointment_time,status,created_at",
        status: "eq.pending",
        order: "created_at.asc",
        limit: "50",
      });

      jobs = await supabaseRequest(
        `/rest/v1/sms_queue?${smsParams.toString()}`
      );
    }

    return response.status(200).json({
      jobs,
      appointments,
      date,
      senderDevice: {
        isActive: senderDevice.isActive,
        phone: senderDevice.senderPhone,
        deviceName: senderDevice.deviceName,
        lastSeenAt: senderDevice.lastSeenAt,
      },
    });
  } catch (error) {
    console.error("Unable to load pending SMS jobs or appointments", error);

    return response.status(500).json({
      error:
        error.message || "Unable to load pending SMS jobs or appointments",
    });
  }
}


async function handleClaimAutoArrivalRequest(request, response) {
  const configError = validateCompanionConfig(request);

  if (configError) {
    return response.status(configError.status).json({ error: configError.message });
  }

  const deviceId = getHeaderValue(request, "x-android-device-id");
  const deviceName =
    getHeaderValue(request, "x-android-device-name") || "Android device";

  if (!deviceId) {
    return response.status(400).json({ error: "Missing Android device ID." });
  }

  try {
    const senderDevice = await registerOrRefreshSenderDevice(deviceId, deviceName);

    if (!senderDevice.isActive) {
      return response.status(403).json({
        error: "This Android device is not approved for sending SMS.",
      });
    }

    const body = await readJsonBody(request);
    const customerId = String(body.customerId || body.customer_id || "").trim();
    const phone = normalizeDevicePhone(body.phone);
    const message = String(body.message || "").trim();
    const appointmentDate = String(
      body.appointmentDate || body.appointment_date || ""
    ).trim();
    const baseTime = normalizeBaseAppointmentTime(
      body.appointmentTime || body.appointment_time
    );

    if (!customerId || !phone || !message || !appointmentDate || !baseTime) {
      return response.status(400).json({ error: "Missing auto-arrival claim fields." });
    }

    // Final appointment validation before a claim can be created.
    const customerParams = new URLSearchParams({
      select: "id,phone,status,appointment_date,appointment_time",
      id: `eq.${customerId}`,
      limit: "1",
    });
    const customerRows = await supabaseRequest(
      `/rest/v1/customers?${customerParams.toString()}`
    );
    const customer = customerRows?.[0] || null;

    if (
      !customer ||
      !isScheduledStatusForArrival(customer.status) ||
      String(customer.appointment_date || "") !== appointmentDate ||
      normalizeBaseAppointmentTime(customer.appointment_time) !== baseTime ||
      normalizeDevicePhone(customer.phone) !== phone
    ) {
      return response.status(200).json({
        claimed: false,
        reason: "appointment_changed",
      });
    }

    // Do not allow a second arrival message if ANY arrival job for this exact
    // appointment has already been sent/pending/watching.
    const existingParams = new URLSearchParams({
      select: "id,status,appointment_time,message,sent_at",
      customer_id: `eq.${customerId}`,
      appointment_date: `eq.${appointmentDate}`,
      order: "created_at.desc",
    });
    const existingRows = await supabaseRequest(
      `/rest/v1/sms_queue?${existingParams.toString()}`
    );

    const existingArrival = (existingRows || []).find((row) => {
      const status = String(row.status || "").trim().toLowerCase();
      if (["cancelled", "failed"].includes(status)) return false;
      if (normalizeBaseAppointmentTime(row.appointment_time) !== baseTime) return false;
      return isAnyArrivalQueueRow(row);
    });

    if (existingArrival) {
      return response.status(200).json({
        claimed: false,
        reason: "arrival_already_exists",
        job: existingArrival,
      });
    }

    const claimAppointmentTime = `${baseTime} auto-arrival`;

    const exactClaimParams = new URLSearchParams({
      select: "id,status",
      customer_id: `eq.${customerId}`,
      appointment_date: `eq.${appointmentDate}`,
      appointment_time: `eq.${claimAppointmentTime}`,
      limit: "1",
    });
    const exactClaimRows = await supabaseRequest(
      `/rest/v1/sms_queue?${exactClaimParams.toString()}`
    );
    const exactClaim = exactClaimRows?.[0] || null;

    if (
      exactClaim &&
      ["failed", "cancelled"].includes(
        String(exactClaim.status || "").trim().toLowerCase()
      )
    ) {
      const retryParams = new URLSearchParams({
        id: `eq.${exactClaim.id}`,
        select: "id,status,appointment_time",
      });
      const retryRows = await supabaseRequest(
        `/rest/v1/sms_queue?${retryParams.toString()}`,
        {
          method: "PATCH",
          headers: { Prefer: "return=representation" },
          body: {
            phone,
            message,
            status: "watching",
            sent_at: null,
            error: null,
          },
        }
      );

      return response.status(200).json({
        claimed: true,
        retried: true,
        job: retryRows?.[0] || null,
      });
    }

    try {
      const rows = await supabaseRequest("/rest/v1/sms_queue", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: {
          customer_id: customerId,
          phone,
          message,
          appointment_date: appointmentDate,
          appointment_time: claimAppointmentTime,
          status: "watching",
        },
      });

      return response.status(200).json({
        claimed: true,
        job: rows?.[0] || null,
      });
    } catch (error) {
      if (error.status === 409) {
        return response.status(200).json({
          claimed: false,
          reason: "claim_conflict",
        });
      }
      throw error;
    }
  } catch (error) {
    console.error("Unable to claim auto arrival", error);
    return response.status(error.status || 500).json({
      error: error.message || "Unable to claim auto arrival.",
    });
  }
}

function isAnyArrivalQueueRow(row = {}) {
  const appointmentTime = String(row.appointment_time || "").toLowerCase();
  const message = String(row.message || "").toLowerCase();

  return (
    appointmentTime.includes("arrival-soon") ||
    appointmentTime.includes("arrival-eta") ||
    appointmentTime.includes("arrival-watch") ||
    appointmentTime.includes("auto-arrival") ||
    message.includes("υπολογίζουμε να φτάσουμε") ||
    message.includes("υπολογιζουμε να φτασουμε") ||
    message.includes("15 λεπτά") ||
    message.includes("15 λεπτα") ||
    message.includes("30 λεπτά") ||
    message.includes("30 λεπτα") ||
    message.includes("estimated arrival time") ||
    message.includes("approximately 15 minutes") ||
    message.includes("approximately 30 minutes")
  );
}

async function handleValidateArrivalRequest(request, response) {
  const configError = validateCompanionConfig(request);

  if (configError) {
    return response.status(configError.status).json({
      error: configError.message,
    });
  }

  const deviceId = getHeaderValue(request, "x-android-device-id");
  const deviceName =
    getHeaderValue(request, "x-android-device-name") || "Android device";

  if (!deviceId) {
    return response.status(400).json({
      error: "Missing Android device ID.",
    });
  }

  try {
    const senderDevice = await registerOrRefreshSenderDevice(deviceId, deviceName);

    if (!senderDevice.isActive) {
      return response.status(403).json({
        error: "This Android device is not approved for sending SMS.",
      });
    }

    const body = await readJsonBody(request);
    const customerId = String(body.customerId || body.customer_id || "").trim();
    const jobId = String(body.jobId || body.job_id || "").trim();
    const appointmentDate = String(
      body.appointmentDate || body.appointment_date || ""
    ).trim();
    const appointmentTime = normalizeBaseAppointmentTime(
      body.appointmentTime || body.appointment_time
    );
    const phone = normalizeDevicePhone(body.phone);

    if (!customerId || !appointmentDate || !appointmentTime || !phone) {
      return response.status(400).json({
        error: "Missing arrival validation fields.",
      });
    }

    const customerParams = new URLSearchParams({
      select: "id,phone,status,appointment_date,appointment_time",
      id: `eq.${customerId}`,
      limit: "1",
    });

    const customerRows = await supabaseRequest(
      `/rest/v1/customers?${customerParams.toString()}`
    );

    const customer = customerRows?.[0] || null;

    let valid = true;
    let reason = "ok";

    if (!customer) {
      valid = false;
      reason = "customer_not_found";
    } else if (!isScheduledStatusForArrival(customer.status)) {
      valid = false;
      reason = "appointment_not_scheduled";
    } else if (String(customer.appointment_date || "") !== appointmentDate) {
      valid = false;
      reason = "appointment_date_changed";
    } else if (
      normalizeBaseAppointmentTime(customer.appointment_time) !== appointmentTime
    ) {
      valid = false;
      reason = "appointment_time_changed";
    } else if (normalizeDevicePhone(customer.phone) !== phone) {
      valid = false;
      reason = "customer_phone_changed";
    }

    if (!valid && jobId) {
      await cancelArrivalQueueJob(jobId, reason);
    }

    return response.status(200).json({
      valid,
      reason,
      customer: customer
        ? {
            id: customer.id,
            phone: customer.phone || "",
            status: customer.status || "",
            appointmentDate: customer.appointment_date || "",
            appointmentTime: customer.appointment_time || "",
          }
        : null,
    });
  } catch (error) {
    console.error("Unable to validate arrival SMS", error);

    return response.status(error.status || 500).json({
      error: error.message || "Unable to validate arrival SMS.",
    });
  }
}

async function handleAutoArrivalSentRequest(request, response) {
  const configError = validateCompanionConfig(request);

  if (configError) {
    return response.status(configError.status).json({
      error: configError.message,
    });
  }

  const deviceId = getHeaderValue(request, "x-android-device-id");
  const deviceName =
    getHeaderValue(request, "x-android-device-name") || "Android device";

  if (!deviceId) {
    return response.status(400).json({
      error: "Missing Android device ID.",
    });
  }

  try {
    const senderDevice = await registerOrRefreshSenderDevice(deviceId, deviceName);

    if (!senderDevice.isActive) {
      return response.status(403).json({
        error: "This Android device is not approved for sending SMS.",
      });
    }

    const body = await readJsonBody(request);

    const customerId = String(body.customerId || body.customer_id || "").trim();
    const phone = normalizeDevicePhone(body.phone);
    const message = String(body.message || "").trim();
    const appointmentDate = String(
      body.appointmentDate || body.appointment_date || ""
    ).trim();
    const appointmentTime = String(
      body.appointmentTime || body.appointment_time || ""
    ).trim();

    if (!customerId) {
      return response.status(400).json({
        error: "Missing customer id.",
      });
    }

    if (!phone) {
      return response.status(400).json({
        error: "Missing valid phone.",
      });
    }

    if (!message) {
      return response.status(400).json({
        error: "Missing message.",
      });
    }

    if (!appointmentDate) {
      return response.status(400).json({
        error: "Missing appointment date.",
      });
    }

    const duplicateParams = new URLSearchParams({
      select: "id,status,sent_at",
      customer_id: `eq.${customerId}`,
      appointment_date: `eq.${appointmentDate}`,
      appointment_time: `eq.auto-arrival:${appointmentTime || "unknown"}`,
      limit: "1",
    });

    const existingRows = await supabaseRequest(
      `/rest/v1/sms_queue?${duplicateParams.toString()}`
    );

    if (existingRows?.[0]) {
      return response.status(200).json({
        duplicate: true,
        job: existingRows[0],
        message: "Auto arrival SMS was already logged.",
      });
    }

    const now = new Date().toISOString();

    const rows = await supabaseRequest("/rest/v1/sms_queue", {
      method: "POST",
      headers: {
        Prefer: "return=representation",
      },
      body: {
        customer_id: customerId,
        phone,
        message,
        appointment_date: appointmentDate,
        appointment_time: `auto-arrival:${appointmentTime || "unknown"}`,
        status: "sent",
        created_at: now,
        sent_at: now,
        error: null,
      },
    });

    return response.status(200).json({
      duplicate: false,
      job: rows?.[0] || null,
      message: "Auto arrival SMS logged.",
    });
  } catch (error) {
    console.error("Unable to log auto arrival SMS", error);

    return response.status(error.status || 500).json({
      error: error.message || "Unable to log auto arrival SMS.",
    });
  }
}

async function loadTodayArrivalAppointments(date) {
  const params = new URLSearchParams();

  params.set(
    "select",
    [
      "id",
      "full_name",
      "address",
      "phone",
      "appointment_date",
      "appointment_time",
      "status",
      "latitude",
      "longitude",
      "customer_title",
      "sms_salutation_name",
    ].join(",")
  );

  params.set("appointment_date", `eq.${date}`);
  params.set("order", "appointment_time.asc");
  params.set("limit", "20");

  const rows = await supabaseRequest(`/rest/v1/customers?${params.toString()}`);

  return (rows || [])
    .map(mapTodayArrivalAppointment)
    .filter((appointment) => appointment && appointment.id);
}

function mapTodayArrivalAppointment(row = {}) {
  return {
    id: row.id || "",
    customerId: row.id || "",
    customerName: row.full_name || "Πελάτης",
    address: row.address || "",
    phone: row.phone || "",
    appointmentDate: row.appointment_date || "",
    appointmentTime: row.appointment_time || "",
    latitude: normalizeNumber(row.latitude),
    longitude: normalizeNumber(row.longitude),
    customerTitle: row.customer_title || "mr",
    smsSalutationName: row.sms_salutation_name || "",
    status: row.status || "Scheduled",
  };
}

async function loadArrivalWatchJobs(date) {
  const params = new URLSearchParams();

  params.set(
    "select",
    [
      "id",
      "customer_id",
      "phone",
      "message",
      "appointment_date",
      "appointment_time",
      "status",
      "created_at",
      "customers!inner(id,full_name,address,phone,status,appointment_date,appointment_time,latitude,longitude)",
    ].join(",")
  );

  params.set("status", "eq.watching");
  params.set("appointment_date", `eq.${date}`);
  params.set("order", "created_at.asc");
  params.set("limit", "50");

  const rows = await supabaseRequest(`/rest/v1/sms_queue?${params.toString()}`);

  for (const row of rows || []) {
    const appointmentTime = String(row.appointment_time || "").toLowerCase();

    // auto-arrival rows are short-lived server-side send claims, not GPS watches.
    if (appointmentTime.includes("auto-arrival")) {
      continue;
    }

    // Legacy manual GPS watches are deliberately disabled by the new business
    // rules. Normal gaps now create one immediate ETA SMS after Complete Visit.
    await cancelArrivalQueueJob(row.id, "legacy_manual_arrival_watch_disabled");
  }

  return [];
}

function mapArrivalWatchJob(row = {}) {
  const customer = Array.isArray(row.customers)
    ? row.customers[0] || {}
    : row.customers || {};

  return {
    id: row.id,
    customerId: row.customer_id || customer.id || "",
    customerName: customer.full_name || "Πελάτης",
    address: customer.address || "",
    phone: row.phone || customer.phone || "",
    message: row.message || "",
    appointmentDate: row.appointment_date || customer.appointment_date || "",
    appointmentTime: row.appointment_time || customer.appointment_time || "",
    latitude: normalizeNumber(customer.latitude),
    longitude: normalizeNumber(customer.longitude),
    status: row.status || "watching",
    createdAt: row.created_at || "",
  };
}

function hasValidCoordinates(watch = {}) {
  return Number.isFinite(watch.latitude) && Number.isFinite(watch.longitude);
}

function normalizeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}


function getArrivalWatchStaleReason(row = {}, customer = {}) {
  if (!customer?.id) {
    return "customer_not_found";
  }

  if (!isScheduledStatusForArrival(customer.status)) {
    return "appointment_not_scheduled";
  }

  if (
    String(row.appointment_date || "") !==
    String(customer.appointment_date || "")
  ) {
    return "appointment_date_changed";
  }

  if (
    normalizeBaseAppointmentTime(row.appointment_time) !==
    normalizeBaseAppointmentTime(customer.appointment_time)
  ) {
    return "appointment_time_changed";
  }

  if (
    normalizeDevicePhone(row.phone) !==
    normalizeDevicePhone(customer.phone)
  ) {
    return "customer_phone_changed";
  }

  return "";
}

function isScheduledStatusForArrival(status = "") {
  const normalized = String(status || "").trim().toLowerCase();

  return ["", "scheduled", "pending", "active"].includes(normalized);
}

function normalizeBaseAppointmentTime(value = "") {
  const match = String(value || "").trim().match(/^(\d{1,2}):(\d{2})/);

  if (!match) return "";

  return `${String(Number(match[1])).padStart(2, "0")}:${match[2]}`;
}

async function cancelArrivalQueueJob(jobId, reason) {
  if (!jobId) return [];

  const params = new URLSearchParams({
    id: `eq.${jobId}`,
    status: "in.(pending,watching)",
    select: "id,status,error",
  });

  return supabaseRequest(`/rest/v1/sms_queue?${params.toString()}`, {
    method: "PATCH",
    headers: {
      Prefer: "return=representation",
    },
    body: {
      status: "cancelled",
      error: `Cancelled stale arrival job: ${reason}`,
    },
  });
}

async function loadDashboardMessages({ userId, status, limit }) {
  const [customerLinkedRows, routeLinkedRows] = await Promise.all([
    loadCustomerLinkedSmsRows({ userId, status, limit }),
    loadRouteLinkedSmsRows({ userId, status, limit }),
  ]);

  const jobsById = new Map();

  for (const row of customerLinkedRows || []) {
    jobsById.set(row.id, mapDashboardJob(row));
  }

  for (const routeItem of routeLinkedRows || []) {
    if (!routeItem.smsRow) {
      continue;
    }

    jobsById.set(
      routeItem.smsRow.id,
      mapDashboardJob(routeItem.smsRow, routeItem.routeRequest)
    );
  }

  const jobs = Array.from(jobsById.values())
    .sort((first, second) => {
      return new Date(second.createdAt || 0) - new Date(first.createdAt || 0);
    })
    .slice(0, limit);

  const summary = buildDashboardSummary(jobs);

  return {
    jobs,
    summary,
  };
}

async function loadCustomerLinkedSmsRows({ userId, status, limit }) {
  const jobsParams = new URLSearchParams();

  jobsParams.set(
    "select",
    [
      "id",
      "customer_id",
      "phone",
      "message",
      "appointment_date",
      "appointment_time",
      "status",
      "created_at",
      "sent_at",
      "error",
      "customers!inner(full_name,address,user_id)",
    ].join(",")
  );

  jobsParams.set("customers.user_id", `eq.${userId}`);
  jobsParams.set("order", "created_at.desc");
  jobsParams.set("limit", String(limit));

  if (ALLOWED_DASHBOARD_STATUSES.has(status)) {
    jobsParams.set("status", `eq.${status}`);
  }

  return supabaseRequest(`/rest/v1/sms_queue?${jobsParams.toString()}`);
}

async function loadRouteLinkedSmsRows({ userId, status, limit }) {
  const routeParams = new URLSearchParams({
    select: "*",
    user_id: `eq.${userId}`,
    order: "created_at.desc",
    limit: String(Math.max(limit, 200)),
  });

  const routeRows = await supabaseRequest(
    `/rest/v1/route_sms_requests?${routeParams.toString()}`
  ).catch((error) => {
    console.warn(
      "Route SMS request dashboard data was skipped.",
      error.message || error
    );

    return [];
  });

  const smsQueueIds = Array.from(
    new Set(
      (routeRows || [])
        .map((row) => String(row.sms_queue_id || "").trim())
        .filter(Boolean)
    )
  );

  if (smsQueueIds.length === 0) {
    return [];
  }

  const smsParams = new URLSearchParams();

  smsParams.set(
    "select",
    [
      "id",
      "customer_id",
      "phone",
      "message",
      "appointment_date",
      "appointment_time",
      "status",
      "created_at",
      "sent_at",
      "error",
    ].join(",")
  );

  smsParams.set("id", `in.(${smsQueueIds.join(",")})`);
  smsParams.set("order", "created_at.desc");
  smsParams.set("limit", String(Math.max(limit, 200)));

  if (ALLOWED_DASHBOARD_STATUSES.has(status)) {
    smsParams.set("status", `eq.${status}`);
  }

  const smsRows = await supabaseRequest(
    `/rest/v1/sms_queue?${smsParams.toString()}`
  );

  const routeBySmsQueueId = new Map(
    (routeRows || []).map((row) => [String(row.sms_queue_id || ""), row])
  );

  return (smsRows || []).map((smsRow) => ({
    smsRow,
    routeRequest: routeBySmsQueueId.get(String(smsRow.id)) || null,
  }));
}

function mapDashboardJob(row, routeRequest = null) {
  const customer = Array.isArray(row.customers)
    ? row.customers[0] || {}
    : row.customers || {};

  const message = String(row.message || "");

  return {
    id: row.id,
    customerId: row.customer_id || routeRequest?.customer_id || null,
    customerName:
      routeRequest?.customer_name ||
      routeRequest?.full_name ||
      customer.full_name ||
      "Χωρίς όνομα πελάτη",
    customerAddress: routeRequest?.address || customer.address || "",
    phone: row.phone || routeRequest?.phone || "",
    message,
    messagePreview:
      message.length > 180 ? `${message.slice(0, 180)}...` : message,
    messageType: routeRequest ? "route_options" : detectMessageType(row),
    appointmentDate: row.appointment_date || routeRequest?.appointment_date || "",
    appointmentTime: row.appointment_time || "",
    option1Time: routeRequest?.option1_time || routeRequest?.option_1_time || "",
    option2Time: routeRequest?.option2_time || routeRequest?.option_2_time || "",
    selectedTime: routeRequest?.selected_time || "",
    replyStatus: routeRequest?.status || "",
    replyText: routeRequest?.reply_text || "",
    replyReceivedAt: routeRequest?.reply_received_at || "",
    status: row.status || "pending",
    createdAt: row.created_at || "",
    sentAt: row.sent_at || "",
    error: row.error || "",
  };
}

function detectMessageType(row) {
  const appointmentTime = String(row.appointment_time || "").toLowerCase();
  const message = normalizeSearchText(row.message);

  if (
    appointmentTime.startsWith("route-options") ||
    message.includes("επιλογες ωρας") ||
    message.includes("time options")
  ) {
    return "route_options";
  }

  if (
    appointmentTime.includes("arrival-soon") ||
    appointmentTime.includes("arrival-eta") ||
    appointmentTime.includes("arrival-watch") ||
    appointmentTime.includes("auto-arrival") ||
    message.includes("10 λεπτα μακρια") ||
    message.includes("about 10 minutes away") ||
    message.includes("υπολογιζουμε να φτασουμε") ||
    message.includes("estimated arrival time")
  ) {
    return "arrival";
  }

  if (
    message.includes("υπενθυμ") ||
    message.includes("reminder") ||
    message.includes("ραντεβου") ||
    message.includes("appointment") ||
    message.includes("scheduled") ||
    message.includes("προγραμματισ")
  ) {
    return "reminder";
  }

  if (
    appointmentTime.includes("thank-you") ||
    message.includes("ευχαριστ") ||
    message.includes("thank you") ||
    message.includes("thank-you")
  ) {
    return "thank_you";
  }

  return "other";
}

function buildDashboardSummary(rows) {
  const today = getCyprusDate();

  return rows.reduce(
    (summary, row) => {
      const status = String(row.status || "").toLowerCase();

      summary.total += 1;

      if (status === "pending") {
        summary.pending += 1;
      }

      if (status === "sent") {
        summary.sent += 1;

        if (getCyprusDateFromTimestamp(row.sentAt || row.sent_at) === today) {
          summary.sentToday += 1;
        }
      }

      if (status === "failed") {
        summary.failed += 1;

        if (getCyprusDateFromTimestamp(row.createdAt || row.created_at) === today) {
          summary.failedToday += 1;
        }
      }

      if (status === "cancelled") {
        summary.cancelled += 1;
      }

      if (status === "watching") {
        summary.watching += 1;
      }

      return summary;
    },
    {
      total: 0,
      pending: 0,
      sent: 0,
      failed: 0,
      cancelled: 0,
      watching: 0,
      sentToday: 0,
      failedToday: 0,
    }
  );
}

async function findDashboardJobForUser({ jobId, userId }) {
  const smsParams = new URLSearchParams({
    select: "*",
    id: `eq.${jobId}`,
    limit: "1",
  });

  const smsRows = await supabaseRequest(
    `/rest/v1/sms_queue?${smsParams.toString()}`
  );

  const smsJob = smsRows[0] || null;

  if (!smsJob) {
    return null;
  }

  if (smsJob.customer_id) {
    const customerParams = new URLSearchParams({
      select: "id,user_id",
      id: `eq.${smsJob.customer_id}`,
      limit: "1",
    });

    const customerRows = await supabaseRequest(
      `/rest/v1/customers?${customerParams.toString()}`
    );

    if (customerRows[0]?.user_id === userId) {
      return smsJob;
    }
  }

  const routeParams = new URLSearchParams({
    select: "id,user_id,sms_queue_id",
    sms_queue_id: `eq.${jobId}`,
    user_id: `eq.${userId}`,
    limit: "1",
  });

  const routeRows = await supabaseRequest(
    `/rest/v1/route_sms_requests?${routeParams.toString()}`
  ).catch(() => []);

  return routeRows[0] ? smsJob : null;
}

async function updateSmsQueueJob(jobId, updates) {
  const params = new URLSearchParams({
    id: `eq.${jobId}`,
    select: "*",
  });

  return supabaseRequest(`/rest/v1/sms_queue?${params.toString()}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: updates,
  });
}

async function syncRouteRequestForSmsAction({ smsQueueId, action, now }) {
  const params = new URLSearchParams({
    sms_queue_id: `eq.${smsQueueId}`,
    select: "*",
  });

  const rows = await supabaseRequest(
    `/rest/v1/route_sms_requests?${params.toString()}`
  ).catch(() => []);

  const routeRequest = rows[0] || null;

  if (!routeRequest) {
    return null;
  }

  const routeParams = new URLSearchParams({
    id: `eq.${routeRequest.id}`,
    select: "*",
  });

  const body =
    action === "cancel"
      ? {
          status: "cancelled",
          updated_at: now,
        }
      : {
          status: "waiting_reply",
          reply_text: null,
          reply_received_at: null,
          selected_time: null,
          updated_at: now,
        };

  return supabaseRequest(
    `/rest/v1/route_sms_requests?${routeParams.toString()}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body,
    }
  ).catch((error) => {
    console.warn(
      "Route SMS request action sync was skipped.",
      error.message || error
    );

    return null;
  });
}

async function readJsonBody(request) {
  if (request.body && typeof request.body === "object") {
    return request.body;
  }

  if (typeof request.body === "string") {
    return JSON.parse(request.body || "{}");
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

async function authenticateDashboardUser(request) {
  const authorization =
    request.headers.authorization || request.headers.Authorization || "";

  const token = String(authorization).startsWith("Bearer ")
    ? String(authorization).slice(7).trim()
    : "";

  if (!token) {
    throw createHttpError(
      401,
      "Πρέπει να είσαι συνδεδεμένος για να δεις τα SMS."
    );
  }

  const serviceRoleKey = getServerEnv("SUPABASE_SERVICE_ROLE_KEY");

  const result = await fetch(`${getSupabaseUrl()}/auth/v1/user`, {
    method: "GET",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${token}`,
    },
  });

  if (!result.ok) {
    throw createHttpError(401, "Η σύνδεσή σου έληξε. Συνδέσου ξανά.");
  }

  const user = await result.json();

  if (!user?.id) {
    throw createHttpError(401, "Δεν βρέθηκε συνδεδεμένος χρήστης.");
  }

  return user;
}

async function registerOrRefreshSenderDevice(deviceId, deviceName) {
  const existingDevice = await loadSenderDevice(deviceId);
  const now = new Date().toISOString();

  if (!existingDevice) {
    await supabaseRequest("/rest/v1/sms_sender_devices", {
      method: "POST",
      headers: {
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      body: {
        device_id: deviceId,
        device_name: deviceName,
        last_seen_at: now,
        updated_at: now,
      },
    });

    const createdDevice = await loadSenderDevice(deviceId);

    return {
      isActive: Boolean(createdDevice?.is_active && createdDevice?.sender_phone),
      senderPhone: createdDevice?.sender_phone || null,
      deviceName: createdDevice?.device_name || deviceName,
      lastSeenAt: createdDevice?.last_seen_at || now,
    };
  }

  const deviceParams = new URLSearchParams({
    device_id: `eq.${deviceId}`,
  });

  await supabaseRequest(
    `/rest/v1/sms_sender_devices?${deviceParams.toString()}`,
    {
      method: "PATCH",
      body: {
        device_name: deviceName,
        last_seen_at: now,
        updated_at: now,
      },
    }
  );

  return {
    isActive: Boolean(existingDevice.is_active && existingDevice.sender_phone),
    senderPhone: existingDevice.sender_phone || null,
    deviceName: deviceName || existingDevice.device_name || "Android device",
    lastSeenAt: now,
  };
}

async function loadSenderDevice(deviceId) {
  const params = new URLSearchParams({
    select:
      "device_id,sender_phone,device_name,last_seen_at,is_active,created_at,updated_at",
    device_id: `eq.${deviceId}`,
    limit: "1",
  });

  const rows = await supabaseRequest(
    `/rest/v1/sms_sender_devices?${params.toString()}`
  );

  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}


async function loadSenderDevices() {
  const params = new URLSearchParams({
    select: [
      "device_id",
      "sender_phone",
      "device_name",
      "seller_name",
      "last_seen_at",
      "is_active",
      "approval_status",
      "requested_at",
      "approved_at",
      "rejected_at",
      "disabled_at",
      "created_at",
      "updated_at",
    ].join(","),
    order: "created_at.desc",
  });

  return supabaseRequest(`/rest/v1/sms_sender_devices?${params.toString()}`);
}

function mapSenderDevice(row = {}) {
  if (!row) {
    return null;
  }

  const approvalStatus = normalizeDeviceApprovalStatus(row);

  return {
    deviceId: row.device_id || "",
    deviceName: row.device_name || "Android device",
    sellerName: row.seller_name || "",
    senderPhone: row.sender_phone || "",
    isActive: Boolean(row.is_active && row.sender_phone),
    approvalStatus,
    lastSeenAt: row.last_seen_at || "",
    requestedAt: row.requested_at || "",
    approvedAt: row.approved_at || "",
    rejectedAt: row.rejected_at || "",
    disabledAt: row.disabled_at || "",
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || "",
  };
}

function normalizeDeviceApprovalStatus(row = {}) {
  const status = String(row.approval_status || "").trim().toLowerCase();

  if (status === "pending" && !row.sender_phone) {
    return "unregistered";
  }

  if (["pending", "approved", "rejected", "disabled"].includes(status)) {
    return status;
  }

  if (row.is_active && row.sender_phone) {
    return "approved";
  }

  if (row.sender_phone) {
    return "pending";
  }

  return "unregistered";
}

function buildSenderDevicesSummary(devices = []) {
  return devices.reduce(
    (summary, device) => {
      const status = normalizeDeviceApprovalStatus(device);

      summary.total += 1;

      if (status === "pending") {
        summary.pending += 1;
      }

      if (status === "approved") {
        summary.approved += 1;
      }

      if (status === "rejected") {
        summary.rejected += 1;
      }

      if (status === "disabled") {
        summary.disabled += 1;
      }

      if (device.is_active && device.sender_phone) {
        summary.active += 1;
      }

      return summary;
    },
    {
      total: 0,
      pending: 0,
      approved: 0,
      rejected: 0,
      disabled: 0,
      active: 0,
    }
  );
}

function buildSenderDeviceActionUpdates(action, now) {
  if (action === "approve") {
    return {
      is_active: true,
      approval_status: "approved",
      approved_at: now,
      rejected_at: null,
      disabled_at: null,
      updated_at: now,
    };
  }

  if (action === "reject") {
    return {
      is_active: false,
      approval_status: "rejected",
      rejected_at: now,
      disabled_at: null,
      updated_at: now,
    };
  }

  return {
    is_active: false,
    approval_status: "disabled",
    disabled_at: now,
    updated_at: now,
  };
}

function getSenderDeviceActionMessage(action) {
  if (action === "approve") {
    return "Η συσκευή εγκρίθηκε.";
  }

  if (action === "reject") {
    return "Το αίτημα απορρίφθηκε.";
  }

  return "Η συσκευή απενεργοποιήθηκε.";
}

function normalizeDevicePhone(value) {
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

function getRequestedDate(request) {
  const queryDate = request.query?.date;

  if (queryDate && /^\d{4}-\d{2}-\d{2}$/.test(queryDate)) {
    return queryDate;
  }

  return getCyprusDate();
}

function getCyprusDate() {
  return getCyprusDateFromTimestamp(new Date());
}

function getCyprusDateFromTimestamp(value) {
  if (!value) {
    return "";
  }

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Nicosia",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return formatter.format(date);
}

function normalizeSearchText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function validateCompanionConfig(request) {
  const serverConfigError = validateServerConfig();

  if (serverConfigError) {
    return serverConfigError;
  }

  const companionSecret = getServerEnv("ANDROID_COMPANION_SECRET");

  if (!companionSecret) {
    return {
      status: 500,
      message: "Missing ANDROID_COMPANION_SECRET.",
    };
  }

  if (!isCompanionAuthorized(request, companionSecret)) {
    return {
      status: 401,
      message: "Unauthorized Android companion request.",
    };
  }

  return null;
}

function validateServerConfig() {
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
      message:
        `Missing required environment variables: ` + missingVariables.join(", "),
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

  const body = await result.text();

  return body ? JSON.parse(body) : null;
}

function isCompanionAuthorized(request, secret) {
  const authorization =
    request.headers.authorization || request.headers.Authorization;

  const companionHeader = request.headers["x-android-companion-secret"];

  return authorization === `Bearer ${secret}` || companionHeader === secret;
}

function getHeaderValue(request, headerName) {
  const value =
    request.headers[headerName] || request.headers[headerName.toLowerCase()];

  if (Array.isArray(value)) {
    return String(value[0] || "").trim().slice(0, 160);
  }

  return String(value || "").trim().slice(0, 160);
}

function getSupabaseUrl() {
  return getServerEnv("SUPABASE_URL") || getServerEnv("VITE_SUPABASE_URL");
}

function createHttpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}