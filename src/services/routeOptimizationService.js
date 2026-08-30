export async function optimizeDayRoute({
  appointmentDate,
  customers,
}) {
  const selectedDateCustomers = appointmentDate
    ? customers.filter(
        (customer) =>
          customer.appointment_date === appointmentDate
      )
    : customers;

  return requestRouteOptimization({
    appointmentDate,
    customers: selectedDateCustomers,
  });
}

export async function optimizePlannedRoute({
  startPoint,
  stops,
}) {
  if (!startPoint) {
    throw new Error("Select a starting point.");
  }

  if (!Array.isArray(stops) || stops.length < 1) {
    throw new Error("Add at least one customer address.");
  }

  const customers = [
    normalizeRouteStop(startPoint, "route-start", true),
    ...stops.map((stop, index) =>
      normalizeRouteStop(
        stop,
        stop.id || `route-stop-${index + 1}`,
        false
      )
    ),
  ];

  return requestRouteOptimization({ customers });
}

async function requestRouteOptimization({
  appointmentDate,
  customers,
}) {
  const response = await fetch("/api/optimize-route", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ...(appointmentDate ? { appointmentDate } : {}),
      customers,
    }),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(
      payload.error || "Unable to optimize route"
    );

    error.details = payload.details || null;
    error.invalidCoordinates =
      payload.invalidCoordinates || [];
    error.debugMessage =
      payload.debugMessage || payload.warning || "";

    throw error;
  }

  return payload;
}

function normalizeRouteStop(stop, fallbackId, isStart) {
  return {
    id: stop.id || fallbackId,
    full_name:
      String(stop.full_name || stop.name || "").trim() ||
      (isStart ? "Starting point" : "Customer"),
    address: String(stop.address || "").trim(),
    latitude: normalizeCoordinate(stop.latitude),
    longitude: normalizeCoordinate(stop.longitude),
    phone: String(stop.phone || "").trim(),
    customer_title: normalizeCustomerTitle(stop.customer_title),
    sms_salutation_name: String(stop.sms_salutation_name || "").trim(),
    status: "Scheduled",
    is_route_start: isStart,
  };
}

function normalizeCustomerTitle(value) {
  const normalized = String(value || "").trim().toLowerCase();

  if (
    normalized === "ms" ||
    normalized === "mrs" ||
    normalized === "miss" ||
    normalized === "female" ||
    normalized === "woman"
  ) {
    return "ms";
  }

  return "mr";
}

function normalizeCoordinate(value) {
  if (
    value === "" ||
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const numericValue = Number(value);

  return Number.isFinite(numericValue)
    ? numericValue
    : null;
}