import { geocodeAddress } from "./geocodingService.js";
import { isSupabaseConfigured, supabase } from "./supabaseClient.js";
import {
  getCustomerFromOfflineCache,
  getCustomersFromOfflineCache,
  saveCustomersToOfflineCache
} from "./offlineCustomerCache.js";

/*
 * ---------------------------------------------------------
 * Lightweight in-memory cache
 * ---------------------------------------------------------
 *
 * Αποφεύγουμε να ξανακατεβάζουμε ΟΛΟΥΣ τους customers από
 * Supabase όταν αλλάζουμε γρήγορα μεταξύ Calendar, Reports,
 * Dashboard κλπ.
 *
 * Δεν αποθηκεύεται μόνιμα.
 * Με refresh της εφαρμογής ξεκινά καθαρό.
 */
const CUSTOMERS_CACHE_TTL_MS = 60 * 1000;

let customersMemoryCache = null;
let customersMemoryCacheTimestamp = 0;

/*
 * Αν δύο components ζητήσουν listCustomers σχεδόν ταυτόχρονα,
 * χρησιμοποιούν το ίδιο ενεργό Promise αντί να γίνουν δύο
 * Supabase queries παράλληλα.
 */
let customersRequestInFlight = null;

export async function listCustomers(options = {}) {
  assertSupabaseConfigured();

  const forceRefresh = options?.forceRefresh === true;

  if (!forceRefresh && hasFreshCustomersMemoryCache()) {
    return customersMemoryCache;
  }

  if (!forceRefresh && customersRequestInFlight) {
    return customersRequestInFlight;
  }

  customersRequestInFlight = fetchCustomersFromSupabase();

  try {
    return await customersRequestInFlight;
  } finally {
    customersRequestInFlight = null;
  }
}

async function fetchCustomersFromSupabase() {
  try {
    const { data, error } = await supabase
      .from("customers")
      .select("*")
      .order("appointment_date", { ascending: true })
      .order("appointment_time", { ascending: true });

    if (error) throw error;

    const customers = data || [];

    setCustomersMemoryCache(customers);
    saveCustomersToOfflineCache(customers);

    return customers;
  } catch (error) {
    const cachedCustomers = getCustomersFromOfflineCache();

    if (
      cachedCustomers.length > 0 &&
      (isBrowserOffline() || isNetworkError(error))
    ) {
      console.warn(
        "Using cached customers because the app is offline",
        error
      );

      return cachedCustomers;
    }

    throw error;
  }
}

export async function getCustomer(customerId) {
  assertSupabaseConfigured();

  /*
   * Αν έχουμε ήδη φρέσκια λίστα στη μνήμη, μπορούμε να βρούμε
   * τον πελάτη χωρίς καινούριο Supabase request.
   */
  if (hasFreshCustomersMemoryCache()) {
    const cachedCustomer = customersMemoryCache.find(
      (customer) => customer.id === customerId
    );

    if (cachedCustomer) {
      return cachedCustomer;
    }
  }

  try {
    const { data, error } = await supabase
      .from("customers")
      .select("*")
      .eq("id", customerId)
      .single();

    if (error) throw error;

    return data;
  } catch (error) {
    const cachedCustomer =
      getCustomerFromOfflineCache(customerId);

    if (
      cachedCustomer &&
      (isBrowserOffline() || isNetworkError(error))
    ) {
      console.warn(
        "Using cached customer because the app is offline",
        error
      );

      return cachedCustomer;
    }

    throw error;
  }
}

export async function saveCustomer(
  customer,
  roofPlanFile,
  roofPhotoFiles = []
) {
  const phoneInput = String(customer.phone || "").trim();

  const phone = phoneInput
    ? normalizeCyprusPhone(phoneInput) || phoneInput
    : "";

  const normalized = {
    ...customer,
    id: customer.id || crypto.randomUUID(),
    status: normalizeCustomerStatus(customer.status),
    address: customer.address || "",
    phone,
    appointment_date:
      customer.appointment_date || getTodayIso(),
    appointment_time:
      customer.appointment_time || "10:00",
    latitude: normalizeOptionalNumber(customer.latitude),
    longitude: normalizeOptionalNumber(customer.longitude)
  };

  if (
    (
      !hasCoordinate(normalized.latitude) ||
      !hasCoordinate(normalized.longitude)
    ) &&
    normalized.address
  ) {
    try {
      const geocoded =
        await geocodeAddress(normalized.address);

      normalized.latitude = geocoded.latitude;
      normalized.longitude = geocoded.longitude;
    } catch (geocodeError) {
      console.warn(
        "Unable to geocode customer address",
        geocodeError
      );
    }
  }

  assertSupabaseConfigured();

  const previousSchedulingIdentity = customer.id
    ? await loadCustomerSchedulingIdentity(customer.id)
    : null;

  const { data: userData, error: userError } =
    await supabase.auth.getUser();

  if (userError) throw userError;

  const userId = userData.user?.id;

  if (!userId) {
    throw new Error(
      "You must be signed in to save customers"
    );
  }

  let roof_plan_url =
    normalized.roof_plan_url || "";

  if (roofPlanFile) {
    roof_plan_url = await uploadRoofPlan(
      userId,
      normalized.id,
      roofPlanFile
    );
  }

  /*
   * Legacy support.
   *
   * Η σημερινή φόρμα δεν χρησιμοποιεί πλέον πολλαπλές roof
   * photos, αλλά δεν αφαιρούμε ακόμη αυτή τη δυνατότητα ώστε
   * να μη χαλάσουμε κάποια παλιά λειτουργία.
   */
  let roof_photo_urls =
    normalized.roof_photo_urls || [];

  if (roofPhotoFiles.length > 0) {
    const newRoofPhotoUrls =
      await uploadRoofPhotos(
        userId,
        normalized.id,
        roofPhotoFiles
      );

    roof_photo_urls = [
      ...roof_photo_urls,
      ...newRoofPhotoUrls
    ];
  }

  const customerPayload = {
    id: normalized.id,
    user_id: userId,
    full_name: normalized.full_name,
    customer_title:
      normalized.customer_title || "mr",
    sms_salutation_name:
      String(
        normalized.sms_salutation_name || ""
      ).trim() || null,
    address: normalized.address,
    phone: normalized.phone,
    email: normalized.email || null,
    notes: normalized.notes || null,
    status: normalized.status,
    appointment_date:
      normalized.appointment_date,
    appointment_time:
      normalized.appointment_time,
    latitude: normalized.latitude,
    longitude: normalized.longitude,
    route_order:
      normalized.route_order || null,
    route_optimized_at:
      normalized.route_optimized_at || null,
    roof_plan_url,
    roof_photo_urls
  };

  const { data, error } = await supabase
    .from("customers")
    .upsert(customerPayload)
    .select()
    .single();

  if (error) throw error;

  /*
   * Ο πελάτης άλλαξε, άρα πετάμε τη λίστα από τη μνήμη.
   * Στην επόμενη listCustomers θα πάρουμε φρέσκα δεδομένα.
   */
  clearCustomersMemoryCache();

  if (
    previousSchedulingIdentity &&
    hasSchedulingIdentityChanged(previousSchedulingIdentity, data)
  ) {
    await cancelUnsentArrivalJobs(customerPayload.id);
  }

  return data;
}

export async function deleteCustomer(customerId) {
  assertSupabaseConfigured();

  await cancelUnsentArrivalJobs(customerId);

  const { error } = await supabase
    .from("customers")
    .delete()
    .eq("id", customerId);

  if (error) throw error;

  clearCustomersMemoryCache();
}

export async function updateCustomerStatus(customerId, status) {
  assertSupabaseConfigured();

  const normalizedStatus = normalizeCustomerStatus(status);

  const { data, error } = await supabase
    .from("customers")
    .update({ status: normalizedStatus })
    .eq("id", customerId)
    .select(
      [
        "id",
        "full_name",
        "phone",
        "status",
        "appointment_date",
        "appointment_time",
        "latitude",
        "longitude",
        "route_order",
        "customer_title",
        "sms_salutation_name",
      ].join(",")
    )
    .single();

  if (error) throw error;

  if (!data) {
    throw new Error(
      "Δεν ενημερώθηκε το ραντεβού. Έλεγξε αν είσαι συνδεδεμένος με τον σωστό χρήστη."
    );
  }

  clearCustomersMemoryCache();

  if (!isScheduledStatusForArrival(data.status)) {
    await cancelUnsentArrivalJobs(customerId);
  }

  return data;
}

async function loadCustomerSchedulingIdentity(customerId) {
  const { data, error } = await supabase
    .from("customers")
    .select("id,phone,status,appointment_date,appointment_time")
    .eq("id", customerId)
    .maybeSingle();

  if (error) {
    console.warn("Unable to load previous appointment identity", error);
    return null;
  }

  return data || null;
}

function hasSchedulingIdentityChanged(previous = {}, current = {}) {
  return (
    String(previous.appointment_date || "") !==
      String(current.appointment_date || "") ||
    normalizeBaseAppointmentTime(previous.appointment_time) !==
      normalizeBaseAppointmentTime(current.appointment_time) ||
    normalizePhoneForComparison(previous.phone) !==
      normalizePhoneForComparison(current.phone) ||
    normalizeCustomerStatus(previous.status) !==
      normalizeCustomerStatus(current.status)
  );
}

async function cancelUnsentArrivalJobs(customerId) {
  if (!customerId) return;

  const { data: jobs, error: loadError } = await supabase
    .from("sms_queue")
    .select("id,appointment_time,message,status")
    .eq("customer_id", customerId)
    .in("status", ["pending", "watching"]);

  if (loadError) {
    console.warn("Unable to inspect arrival SMS jobs for cancellation", loadError);
    return;
  }

  const arrivalJobIds = (jobs || [])
    .filter(isArrivalQueueJob)
    .map((job) => job.id)
    .filter(Boolean);

  if (arrivalJobIds.length === 0) return;

  const { error: cancelError } = await supabase
    .from("sms_queue")
    .update({
      status: "cancelled",
      error: "Cancelled because appointment details changed.",
    })
    .in("id", arrivalJobIds);

  if (cancelError) {
    console.warn("Unable to cancel stale arrival SMS jobs", cancelError);
  }
}

function isArrivalQueueJob(job = {}) {
  const appointmentTime = String(job.appointment_time || "").toLowerCase();
  const message = String(job.message || "").toLowerCase();

  return (
    appointmentTime.includes("arrival-soon") ||
    appointmentTime.includes("arrival-eta") ||
    appointmentTime.includes("arrival-watch") ||
    message.includes("λεπτά μακριά") ||
    message.includes("λεπτα μακρια") ||
    message.includes("υπολογίζουμε να φτάσουμε") ||
    message.includes("υπολογιζουμε να φτασουμε") ||
    message.includes("estimated arrival time") ||
    message.includes("minutes away")
  );
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

function normalizePhoneForComparison(value = "") {
  return String(value || "").replace(/[^\d+]/g, "");
}

/*
 * Μπορούμε να τη χρησιμοποιήσουμε αργότερα από οποιοδήποτε
 * component χρειάζεται να αναγκάσει φρέσκο query.
 */
export function clearCustomerCache() {
  clearCustomersMemoryCache();
}

async function uploadRoofPlan(
  userId,
  customerId,
  file
) {
  const optimizedFile =
    await optimizeRoofPlanImage(file);

  /*
   * Σταθερό filename.
   *
   * Το νέο σχέδιο αντικαθιστά το προηγούμενο αντί να δημιουργούμε
   * συνεχώς νέα μεγάλα files.
   */
  const path =
    `${userId}/${customerId}/roof-plan.jpg`;

  const { error } = await supabase.storage
    .from("roof-plans")
    .upload(path, optimizedFile, {
      cacheControl: "86400",
      upsert: true,
      contentType: "image/jpeg"
    });

  if (error) throw error;

  const { data } = supabase.storage
    .from("roof-plans")
    .getPublicUrl(path);

  return data.publicUrl;
}

/*
 * ---------------------------------------------------------
 * Roof-plan image optimization
 * ---------------------------------------------------------
 *
 * Οι φωτογραφίες κινητού μπορούν εύκολα να είναι 4-10 MB.
 * Τις μειώνουμε πριν το upload.
 */
async function optimizeRoofPlanImage(file) {
  if (!file) {
    throw new Error(
      "No roof plan image was selected"
    );
  }

  if (
    !String(file.type || "").startsWith("image/")
  ) {
    throw new Error(
      "The roof plan must be an image"
    );
  }

  if (file.type === "image/svg+xml") {
    return file;
  }

  try {
    const image =
      await loadImageFromFile(file);

    const MAX_DIMENSION = 1800;

    const originalWidth =
      image.naturalWidth || image.width;

    const originalHeight =
      image.naturalHeight || image.height;

    if (!originalWidth || !originalHeight) {
      return file;
    }

    const scale = Math.min(
      1,
      MAX_DIMENSION /
        Math.max(
          originalWidth,
          originalHeight
        )
    );

    const width = Math.max(
      1,
      Math.round(originalWidth * scale)
    );

    const height = Math.max(
      1,
      Math.round(originalHeight * scale)
    );

    const canvas =
      document.createElement("canvas");

    canvas.width = width;
    canvas.height = height;

    const context =
      canvas.getContext("2d");

    if (!context) {
      return file;
    }

    /*
     * Για PNG με transparency.
     */
    context.fillStyle = "#ffffff";

    context.fillRect(
      0,
      0,
      width,
      height
    );

    context.drawImage(
      image,
      0,
      0,
      width,
      height
    );

    const blob = await canvasToBlob(
      canvas,
      "image/jpeg",
      0.82
    );

    if (!blob) {
      return file;
    }

    /*
     * Αν η αρχική JPEG είναι ήδη μικρή και η νέα έκδοση
     * βγει μεγαλύτερη, κρατάμε την αρχική.
     */
    if (
      blob.size >= file.size &&
      Math.max(
        originalWidth,
        originalHeight
      ) <= MAX_DIMENSION &&
      file.type === "image/jpeg"
    ) {
      return file;
    }

    return new File(
      [blob],
      "roof-plan.jpg",
      {
        type: "image/jpeg",
        lastModified: Date.now()
      }
    );
  } catch (error) {
    /*
     * Δεν αφήνουμε ένα πρόβλημα compression να εμποδίσει
     * την αποθήκευση του πελάτη.
     */
    console.warn(
      "Roof plan image optimization failed. Uploading original image.",
      error
    );

    return file;
  }
}

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const objectUrl =
      URL.createObjectURL(file);

    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);

      reject(
        new Error(
          "Unable to read the roof plan image"
        )
      );
    };

    image.src = objectUrl;
  });
}

function canvasToBlob(
  canvas,
  type,
  quality
) {
  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => resolve(blob),
      type,
      quality
    );
  });
}

/*
 * Legacy upload.
 * Το κρατάμε προς το παρόν για ασφάλεια.
 */
async function uploadRoofPhotos(
  userId,
  customerId,
  files
) {
  const uploadedUrls = [];

  for (const file of files) {
    const extension =
      file.name.split(".").pop() || "jpg";

    const fileName =
      `${crypto.randomUUID()}.${extension}`;

    const path =
      `${userId}/${customerId}/roof-photos/${fileName}`;

    const { error } =
      await supabase.storage
        .from("roof-plans")
        .upload(path, file, {
          cacheControl: "3600",
          upsert: false
        });

    if (error) throw error;

    const { data } =
      supabase.storage
        .from("roof-plans")
        .getPublicUrl(path);

    uploadedUrls.push(
      data.publicUrl
    );
  }

  return uploadedUrls;
}

function hasFreshCustomersMemoryCache() {
  if (!customersMemoryCache) {
    return false;
  }

  const age =
    Date.now() -
    customersMemoryCacheTimestamp;

  return age < CUSTOMERS_CACHE_TTL_MS;
}

function setCustomersMemoryCache(customers) {
  customersMemoryCache =
    Array.isArray(customers)
      ? customers
      : [];

  customersMemoryCacheTimestamp =
    Date.now();
}

function clearCustomersMemoryCache() {
  customersMemoryCache = null;
  customersMemoryCacheTimestamp = 0;
  customersRequestInFlight = null;
}

function normalizeCustomerStatus(
  status = "Scheduled"
) {
  const normalized = String(status)
    .trim()
    .toLowerCase();

  if (
    normalized === "completed" ||
    normalized === "visited" ||
    normalized === "done" ||
    normalized === "accepted"
  ) {
    return "Completed";
  }

  if (
    normalized === "cancelled" ||
    normalized === "canceled" ||
    normalized === "rejected"
  ) {
    return "Cancelled";
  }

  return "Scheduled";
}

function getTodayIso() {
  return new Date()
    .toISOString()
    .slice(0, 10);
}

function normalizeOptionalNumber(value) {
  if (
    value === "" ||
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const numericValue =
    Number(value);

  return Number.isFinite(numericValue)
    ? numericValue
    : null;
}

function hasCoordinate(value) {
  return Number.isFinite(
    Number(value)
  );
}

function normalizeCyprusPhone(
  phone = ""
) {
  const digits = String(phone)
    .replace(/\D/g, "");

  if (!digits) return "";

  if (
    digits.startsWith("00357") &&
    digits.length === 13
  ) {
    return `+357${digits.slice(5)}`;
  }

  if (
    digits.startsWith("357") &&
    digits.length === 11
  ) {
    return `+${digits}`;
  }

  if (digits.length === 8) {
    return `+357${digits}`;
  }

  return "";
}

function isBrowserOffline() {
  return (
    typeof navigator !== "undefined" &&
    navigator.onLine === false
  );
}

function isNetworkError(error) {
  const message = String(
    error?.message || error || ""
  ).toLowerCase();

  return (
    message.includes("failed to fetch") ||
    message.includes("network") ||
    message.includes("fetch") ||
    message.includes("load failed")
  );
}

function assertSupabaseConfigured() {
  if (!isSupabaseConfigured) {
    throw new Error(
      "Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY."
    );
  }
}