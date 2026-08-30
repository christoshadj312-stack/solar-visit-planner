import { optimizePlannedRoute } from "./routeOptimizationService.js";
import { queueArrivalEtaSms } from "./arrivalSmsService.js";
import { isSupabaseConfigured, supabase } from "./supabaseClient.js";

const LARGE_GAP_MINUTES = 120;

export async function evaluateNextArrivalSmsAfterCompletion(completedCustomer) {
  return approveNextArrivalAfterCompletion(completedCustomer);
}

export async function approveNextArrivalAfterCompletion(completedCustomer) {
  if (!isSupabaseConfigured) {
    throw new Error("Supabase is not configured.");
  }

  const currentCustomer = normalizeCustomer(completedCustomer);

  if (!currentCustomer.id) {
    throw new Error("Missing current customer id.");
  }

  if (!currentCustomer.appointment_date) {
    return {
      action: "missing_current_date",
      nextCustomer: null,
      message: "Το τρέχον ραντεβού δεν έχει ημερομηνία.",
    };
  }

  const nextCustomer = await getNextScheduledCustomerAfter(currentCustomer);

  if (!nextCustomer) {
    return {
      action: "no_next",
      nextCustomer: null,
      message: "Δεν υπάρχει επόμενο ενεργό ραντεβού για σήμερα.",
    };
  }

  if (!String(nextCustomer.phone || "").trim()) {
    return {
      action: "missing_phone",
      nextCustomer,
      message: `Ο/Η ${getCustomerName(nextCustomer)} δεν έχει τηλέφωνο.`,
    };
  }

  const currentMinutes = timeToMinutes(currentCustomer.appointment_time);
  const nextMinutes = timeToMinutes(nextCustomer.appointment_time);
  const scheduledGapMinutes =
    Number.isFinite(currentMinutes) && Number.isFinite(nextMinutes)
      ? nextMinutes - currentMinutes
      : NaN;

  // Rule 2: gaps of 2 hours or more are automatic and time-based.
  // Completing the previous visit must NEVER create a GPS watch for them.
  if (
    Number.isFinite(scheduledGapMinutes) &&
    scheduledGapMinutes >= LARGE_GAP_MINUTES
  ) {
    return {
      action: "automatic_large_gap",
      nextCustomer,
      scheduledGapMinutes,
      message: `Το επόμενο ραντεβού είναι σε ${Math.round(
        scheduledGapMinutes
      )} λεπτά. Δεν στάλθηκε τώρα SMS. Θα σταλεί αυτόματα περίπου 30 λεπτά πριν από το ραντεβού.`,
    };
  }

  if (!hasCoordinates(nextCustomer)) {
    return {
      action: "missing_coordinates",
      nextCustomer,
      message: `Ο/Η ${getCustomerName(nextCustomer)} δεν έχει έγκυρες συντεταγμένες.`,
    };
  }

  // Rule 3: for normal gaps (< 2h), the user explicitly approved arrival
  // by completing the previous visit. Send ONE ETA message immediately.
  const startPoint = await getCurrentRouteStart(currentCustomer);

  if (!startPoint) {
    return {
      action: "missing_coordinates",
      nextCustomer,
      message: "Δεν βρέθηκε έγκυρη τρέχουσα τοποθεσία για υπολογισμό ETA.",
    };
  }

  const routeResult = await optimizePlannedRoute({
    startPoint,
    stops: [toRouteStop(nextCustomer, "Επόμενος πελάτης")],
  });

  const etaMinutes = Math.max(
    1,
    Math.ceil(Number(routeResult.totalDurationSeconds || 0) / 60)
  );

  if (!Number.isFinite(etaMinutes)) {
    throw new Error("Δεν ήταν δυνατός ο υπολογισμός της ώρας άφιξης.");
  }

  const etaTime = formatEtaTime(addMinutes(new Date(), etaMinutes));
  const queueResult = await queueArrivalEtaSms(nextCustomer.id, etaTime);

  return {
    action: queueResult.duplicate ? "duplicate_eta" : "queued_eta",
    nextCustomer,
    scheduledGapMinutes,
    etaMinutes,
    etaTime,
    routeResult,
    queueResult,
    message: queueResult.duplicate
      ? `Υπάρχει ήδη SMS άφιξης για τον/την ${getCustomerName(nextCustomer)}.`
      : `Μπήκε SMS με εκτιμώμενη ώρα άφιξης ${etaTime} για τον/την ${getCustomerName(nextCustomer)}.`,
  };
}

export async function getNextScheduledCustomerAfter(currentCustomer) {
  const { data, error } = await supabase
    .from("customers")
    .select("id,full_name,address,phone,status,appointment_date,appointment_time,latitude,longitude,route_order,customer_title,sms_salutation_name")
    .eq("appointment_date", currentCustomer.appointment_date)
    .order("appointment_time", { ascending: true });

  if (error) throw error;

  const activeCustomers = (data || [])
    .map(normalizeCustomer)
    .filter((customer) => customer.id !== currentCustomer.id)
    .filter((customer) => isScheduledStatus(customer.status));

  const currentRouteOrder = toFiniteNumber(currentCustomer.route_order);

  if (Number.isFinite(currentRouteOrder)) {
    const nextByRouteOrder = activeCustomers
      .filter((customer) => {
        const routeOrder = toFiniteNumber(customer.route_order);
        return Number.isFinite(routeOrder) && routeOrder > currentRouteOrder;
      })
      .sort((a, b) => toFiniteNumber(a.route_order) - toFiniteNumber(b.route_order))[0];

    if (nextByRouteOrder) {
      return nextByRouteOrder;
    }
  }

  const currentTimeMinutes = timeToMinutes(currentCustomer.appointment_time);

  return activeCustomers
    .filter((customer) => {
      const candidateTime = timeToMinutes(customer.appointment_time);

      if (!Number.isFinite(currentTimeMinutes)) {
        return true;
      }

      if (!Number.isFinite(candidateTime)) {
        return false;
      }

      return candidateTime > currentTimeMinutes;
    })
    .sort(compareCustomersByTimeOrRouteOrder)[0];
}

async function getCurrentRouteStart(currentCustomer) {
  const browserLocation = await getBrowserCurrentLocation();

  if (browserLocation) {
    return {
      id: "current-device-location",
      full_name: "Τρέχουσα τοποθεσία",
      address: `${browserLocation.latitude}, ${browserLocation.longitude}`,
      latitude: browserLocation.latitude,
      longitude: browserLocation.longitude,
      status: "Scheduled",
    };
  }

  if (hasCoordinates(currentCustomer)) {
    return toRouteStop(currentCustomer, "Τρέχων πελάτης");
  }

  return null;
}

function getBrowserCurrentLocation() {
  if (
    typeof navigator === "undefined" ||
    !navigator.geolocation ||
    typeof window === "undefined"
  ) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const latitude = Number(position?.coords?.latitude);
        const longitude = Number(position?.coords?.longitude);

        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
          resolve(null);
          return;
        }

        resolve({ latitude, longitude });
      },
      () => resolve(null),
      {
        enableHighAccuracy: true,
        timeout: 8000,
        maximumAge: 30000,
      }
    );
  });
}

async function calculateRouteToNextCustomer(currentCustomer, nextCustomer) {
  return optimizePlannedRoute({
    startPoint: toRouteStop(currentCustomer, "Τρέχων πελάτης"),
    stops: [toRouteStop(nextCustomer, "Επόμενος πελάτης")],
  });
}

function toRouteStop(customer, fallbackName) {
  return {
    id: customer.id,
    full_name: getCustomerName(customer) || fallbackName,
    address: customer.address || buildCoordinateAddress(customer),
    latitude: customer.latitude,
    longitude: customer.longitude,
    phone: customer.phone || "",
    customer_title: customer.customer_title || "mr",
    sms_salutation_name: customer.sms_salutation_name || "",
    status: "Scheduled",
  };
}

function normalizeCustomer(customer = {}) {
  return {
    ...customer,
    latitude: normalizeCoordinate(customer.latitude),
    longitude: normalizeCoordinate(customer.longitude),
  };
}

function normalizeCoordinate(value) {
  if (value === "" || value === null || value === undefined) {
    return null;
  }

  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function hasCoordinates(customer) {
  return Number.isFinite(Number(customer.latitude)) && Number.isFinite(Number(customer.longitude));
}

function buildCoordinateAddress(customer) {
  if (!hasCoordinates(customer)) return "";
  return `${Number(customer.latitude).toFixed(6)}, ${Number(customer.longitude).toFixed(6)}`;
}

function isScheduledStatus(status = "") {
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

function compareCustomersByTimeOrRouteOrder(a, b) {
  const aRouteOrder = toFiniteNumber(a.route_order);
  const bRouteOrder = toFiniteNumber(b.route_order);

  if (Number.isFinite(aRouteOrder) && Number.isFinite(bRouteOrder)) {
    return aRouteOrder - bRouteOrder;
  }

  const aTime = timeToMinutes(a.appointment_time);
  const bTime = timeToMinutes(b.appointment_time);

  if (Number.isFinite(aTime) && Number.isFinite(bTime)) {
    return aTime - bTime;
  }

  return String(a.full_name || "").localeCompare(String(b.full_name || ""));
}

function timeToMinutes(value) {
  const match = String(value || "").match(/^(\d{1,2}):(\d{2})/);

  if (!match) {
    return NaN;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return NaN;
  }

  return hours * 60 + minutes;
}

function minutesUntilAppointment(customer) {
  const appointmentDate = String(customer?.appointment_date || "").trim();
  const appointmentTime = String(customer?.appointment_time || "").trim();

  const timeMinutes = timeToMinutes(appointmentTime);

  if (!appointmentDate || !Number.isFinite(timeMinutes)) {
    return NaN;
  }

  const [year, month, day] = appointmentDate.split("-").map(Number);

  if (!year || !month || !day) {
    return NaN;
  }

  const appointmentDateTime = new Date(
    year,
    month - 1,
    day,
    Math.floor(timeMinutes / 60),
    timeMinutes % 60,
    0,
    0
  );

  return (appointmentDateTime.getTime() - Date.now()) / 60000;
}

function addMinutes(date, minutes) {
  const nextDate = new Date(date);
  nextDate.setMinutes(nextDate.getMinutes() + minutes);
  return nextDate;
}

function formatEtaTime(date) {
  return new Intl.DateTimeFormat("el-CY", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Nicosia",
  }).format(date);
}

function toFiniteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : NaN;
}

function getCustomerName(customer) {
  return String(customer?.full_name || "πελάτης").trim() || "πελάτης";
}
