import { getServerEnv } from "../src/server/serverEnv.js";

const EXCLUDED_ROUTE_STATUSES = new Set(["cancelled", "canceled"]);
const MAX_ROUTE_STOPS = 12;
const CYPRUS_BOUNDS = {
  minLatitude: 34.4,
  maxLatitude: 35.8,
  minLongitude: 32.0,
  maxLongitude: 34.8
};

export default async function handler(request, response) {
  if (request.method !== "POST") {
    return response.status(405).json({ error: "Method not allowed" });
  }

  const geoapifyApiKey = getServerEnv("GEOAPIFY_API_KEY");
  if (!geoapifyApiKey) {
    return response.status(400).json({
      error: "Missing GEOAPIFY_API_KEY. Add it in Vercel Environment Variables."
    });
  }

  try {
    const body = typeof request.body === "string" ? JSON.parse(request.body || "{}") : request.body || {};
    const { appointmentDate, customers = [] } = body;

    if (!Array.isArray(customers)) {
      return response.status(400).json({ error: "customers must be an array" });
    }

    const selectedDateCustomers = appointmentDate
      ? customers.filter((customer) => customer.appointment_date === appointmentDate)
      : customers;
    const originalOrder = selectedDateCustomers.filter(isRouteEligibleCustomer);
    const excludedCustomers = selectedDateCustomers.filter((customer) => !isRouteEligibleCustomer(customer));

    if (originalOrder.length < 2) {
      return response.status(400).json({
        error: "Route optimization requires a starting point and at least one customer address."
      });
    }

    if (originalOrder.length > MAX_ROUTE_STOPS) {
      return response.status(400).json({
        error: `Route optimization supports up to ${MAX_ROUTE_STOPS - 1} customer addresses plus the starting point.`
      });
    }

    const invalidCoordinates = originalOrder
      .map((customer) => validateCustomerCoordinates(customer))
      .filter((result) => !result.valid);

    if (invalidCoordinates.length > 0) {
      return response.status(400).json({
        error: "Route optimization requires valid coordinates. Select each address from Geoapify suggestions or re-save the customer address.",
        invalidCoordinates: invalidCoordinates.map(toInvalidCoordinateResponse),
        missingCustomerIds: invalidCoordinates.map((result) => result.customer.id)
      });
    }

    const routeCache = new Map();
    const optimizedResult = await optimizeNearestNeighborWithGeoapify(originalOrder, geoapifyApiKey, routeCache);
    const originalTotals = await calculateOriginalTotals(originalOrder, geoapifyApiKey, routeCache);
    const optimizedActiveCustomers = optimizedResult.indexes.map((index) => originalOrder[index]);
    const orderedCustomers = [...optimizedActiveCustomers, ...excludedCustomers].map(addRouteOrder);

    return response.status(200).json({
      customers: orderedCustomers,
      originalOrder: originalOrder.map(toRouteStop),
      optimizedOrder: optimizedActiveCustomers.map(toRouteStop),
      optimized: true,
      orderChanged: didOrderChange(originalOrder, optimizedActiveCustomers),
      routeMode: "geoapify_nearest_neighbor",
      totalDistanceMeters: optimizedResult.distanceMeters,
      totalDurationSeconds: optimizedResult.durationSeconds,
      originalDistanceMeters: originalTotals.distanceMeters,
      originalDurationSeconds: originalTotals.durationSeconds,
      googleMapsRouteUrl: buildGoogleMapsRouteUrl(optimizedActiveCustomers),
      optimizationReason:
        "Geoapify Routing API was used to calculate real driving distance and duration between each current stop and every remaining candidate. The next stop with the shortest driving duration was selected at each step.",
      warning: ""
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return response.status(statusCode).json({
      error: error.message || "Geoapify route optimization failed.",
      debugMessage: buildDebugMessage(error),
      ...(error.details ? { details: error.details } : {})
    });
  }
}

async function optimizeNearestNeighborWithGeoapify(customers, geoapifyApiKey, routeCache) {
  const remainingIndexes = new Set(customers.map((_, index) => index));
  const optimizedIndexes = [0];
  let currentIndex = 0;
  let totalDistanceMeters = 0;
  let totalDurationSeconds = 0;

  remainingIndexes.delete(currentIndex);

  while (remainingIndexes.size > 0) {
    let bestCandidate = null;
    let bestRoute = null;

    for (const candidateIndex of remainingIndexes) {
      const route = await getRouteBetweenStops(customers, currentIndex, candidateIndex, geoapifyApiKey, routeCache);
      if (!bestRoute || route.durationSeconds < bestRoute.durationSeconds) {
        bestRoute = route;
        bestCandidate = candidateIndex;
      }
    }

    if (bestCandidate === null || !bestRoute) {
      throw createRouteError("Geoapify could not choose the next stop for this route.", null);
    }

    optimizedIndexes.push(bestCandidate);
    totalDistanceMeters += bestRoute.distanceMeters;
    totalDurationSeconds += bestRoute.durationSeconds;
    remainingIndexes.delete(bestCandidate);
    currentIndex = bestCandidate;
  }

  return {
    indexes: optimizedIndexes,
    distanceMeters: totalDistanceMeters,
    durationSeconds: totalDurationSeconds
  };
}

async function calculateOriginalTotals(customers, geoapifyApiKey, routeCache) {
  let distanceMeters = 0;
  let durationSeconds = 0;

  for (let index = 0; index < customers.length - 1; index += 1) {
    const route = await getRouteBetweenStops(customers, index, index + 1, geoapifyApiKey, routeCache);
    distanceMeters += route.distanceMeters;
    durationSeconds += route.durationSeconds;
  }

  return { distanceMeters, durationSeconds };
}

async function getRouteBetweenStops(customers, fromIndex, toIndex, geoapifyApiKey, routeCache) {
  const cacheKey = `${fromIndex}:${toIndex}`;
  if (routeCache.has(cacheKey)) return routeCache.get(cacheKey);

  const route = await computeGeoapifyRoute(customers[fromIndex], customers[toIndex], geoapifyApiKey);
  routeCache.set(cacheKey, route);
  return route;
}

async function computeGeoapifyRoute(originCustomer, destinationCustomer, geoapifyApiKey) {
  const url = new URL("https://api.geoapify.com/v1/routing");
  url.searchParams.set("waypoints", `${toGeoapifyWaypoint(originCustomer)}|${toGeoapifyWaypoint(destinationCustomer)}`);
  url.searchParams.set("mode", "drive");
  url.searchParams.set("apiKey", geoapifyApiKey);

  console.info("Geoapify routing request", {
    origin: toSanitizedRouteLogStop(originCustomer),
    destination: toSanitizedRouteLogStop(destinationCustomer)
  });

  const geoapifyResponse = await fetch(url);
  const payload = await geoapifyResponse.json().catch(() => ({}));
  logGeoapifyResponseShape(payload, geoapifyResponse.status, originCustomer, destinationCustomer);

  if (!geoapifyResponse.ok) {
    console.error("Geoapify Routing API failed", {
      status: geoapifyResponse.status,
      origin: toSanitizedRouteLogStop(originCustomer),
      destination: toSanitizedRouteLogStop(destinationCustomer),
      responseKeys: Object.keys(payload || {})
    });
    throw createPairRouteError(originCustomer, destinationCustomer, payload, geoapifyResponse.status);
  }

  const route = findFirstValidRoute(payload);
  if (!route) {
    throw createPairRouteError(originCustomer, destinationCustomer, payload);
  }

  return route;
}

function toGeoapifyWaypoint(customer) {
  return `${Number(customer.latitude)},${Number(customer.longitude)}`;
}

function findFirstValidRoute(payload) {
  const candidates = [
    ...(payload.features || []).map((feature) => feature?.properties),
    ...(payload.properties ? [payload.properties] : [])
  ].filter(Boolean);

  for (const candidate of candidates) {
    const distanceMeters = Number(candidate.distance ?? candidate.total_distance ?? candidate.length);
    const durationSeconds = Number(candidate.time ?? candidate.duration ?? candidate.total_duration);

    if (Number.isFinite(distanceMeters) && Number.isFinite(durationSeconds) && distanceMeters > 0 && durationSeconds > 0) {
      return { distanceMeters, durationSeconds };
    }
  }

  return null;
}

function toSanitizedRouteLogStop(customer) {
  return {
    id: customer.id,
    name: customer.full_name,
    address: customer.address,
    latitude: Number(customer.latitude),
    longitude: Number(customer.longitude)
  };
}

function logGeoapifyResponseShape(payload, status, originCustomer, destinationCustomer) {
  console.info("Geoapify routing response shape", {
    status,
    origin: toSanitizedRouteLogStop(originCustomer),
    destination: toSanitizedRouteLogStop(destinationCustomer),
    topLevelKeys: payload && typeof payload === "object" ? Object.keys(payload) : [],
    firstFeatureKeys: payload?.features?.[0] ? Object.keys(payload.features[0]) : [],
    firstPropertiesKeys: payload?.features?.[0]?.properties ? Object.keys(payload.features[0].properties) : []
  });
}

function createRouteError(prefix, payload, statusCode = 502) {
  const apiMessage = getGeoapifyErrorMessage(payload);
  const error = new Error(apiMessage ? `${prefix} ${apiMessage}` : prefix);
  error.statusCode = statusCode;
  return error;
}

function createPairRouteError(originCustomer, destinationCustomer, payload, statusCode = 502) {
  const apiMessage = getGeoapifyErrorMessage(payload);
  const error = new Error(
    [
      `Geoapify could not calculate a route between ${originCustomer.full_name || "Customer A"} and ${destinationCustomer.full_name || "Customer B"}.`,
      "Check their addresses or reselect them from Geoapify suggestions.",
      apiMessage
    ]
      .filter(Boolean)
      .join(" ")
  );
  error.statusCode = statusCode;
  error.debugMessage = getGeoapifyDebugMessage(payload, statusCode);
  error.details = {
    origin: {
      customerId: originCustomer.id,
      customerName: originCustomer.full_name,
      address: originCustomer.address,
      coordinates: {
        latitude: Number(originCustomer.latitude),
        longitude: Number(originCustomer.longitude)
      }
    },
    destination: {
      customerId: destinationCustomer.id,
      customerName: destinationCustomer.full_name,
      address: destinationCustomer.address,
      coordinates: {
        latitude: Number(destinationCustomer.latitude),
        longitude: Number(destinationCustomer.longitude)
      }
    }
  };
  return error;
}

function getGeoapifyErrorMessage(payload) {
  return payload?.message || payload?.error || "";
}

function getGeoapifyDebugMessage(payload, statusCode) {
  const apiMessage = getGeoapifyErrorMessage(payload);
  const responseKeys = payload && typeof payload === "object" ? Object.keys(payload).join(", ") : "none";
  return [
    statusCode ? `Geoapify HTTP status: ${statusCode}.` : "Geoapify returned no valid route feature.",
    apiMessage ? `Geoapify message: ${apiMessage}.` : "Geoapify did not provide a detailed message.",
    `Response keys: ${responseKeys}.`
  ].join(" ");
}

function buildDebugMessage(error) {
  return error?.debugMessage || error?.message || "Geoapify route optimization failed before a valid route could be parsed.";
}

function addRouteOrder(customer, index) {
  return { ...customer, route_order: index + 1 };
}

function toRouteStop(customer) {
  return {
    id: customer.id,
    full_name: customer.full_name,
    appointment_time: customer.appointment_time,
    address: customer.address,
    phone: customer.phone,
    customer_title: customer.customer_title,
    sms_salutation_name: customer.sms_salutation_name,
    status: customer.status,
    latitude: customer.latitude,
    longitude: customer.longitude
  };
}

function didOrderChange(before, after) {
  return before.some((customer, index) => customer.id !== after[index]?.id);
}

function isRouteEligibleCustomer(customer) {
  return !EXCLUDED_ROUTE_STATUSES.has((customer.status || "").trim().toLowerCase());
}

function hasCoordinates(customer) {
  return validateCustomerCoordinates(customer).valid;
}

function validateCustomerCoordinates(customer) {
  const latitude = Number(customer.latitude);
  const longitude = Number(customer.longitude);

  if (!String(customer.address || "").trim()) {
    return { valid: false, customer, reason: "Missing address" };
  }

  if (customer.latitude === null || customer.latitude === undefined || customer.latitude === "") {
    return { valid: false, customer, reason: "Missing latitude. Reselect the address from Geoapify suggestions." };
  }

  if (customer.longitude === null || customer.longitude === undefined || customer.longitude === "") {
    return { valid: false, customer, reason: "Missing longitude. Reselect the address from Geoapify suggestions." };
  }

  if (!Number.isFinite(latitude)) {
    return { valid: false, customer, reason: "Latitude is not a valid number" };
  }

  if (!Number.isFinite(longitude)) {
    return { valid: false, customer, reason: "Longitude is not a valid number" };
  }

  if (latitude === 0 || longitude === 0) {
    return { valid: false, customer, reason: "Latitude and longitude cannot be 0" };
  }

  if (latitude < CYPRUS_BOUNDS.minLatitude || latitude > CYPRUS_BOUNDS.maxLatitude) {
    return { valid: false, customer, reason: "Latitude is outside Cyprus bounds" };
  }

  if (longitude < CYPRUS_BOUNDS.minLongitude || longitude > CYPRUS_BOUNDS.maxLongitude) {
    return { valid: false, customer, reason: "Longitude is outside Cyprus bounds" };
  }

  return { valid: true, customer, latitude, longitude };
}

function toInvalidCoordinateResponse(result) {
  return {
    customerId: result.customer.id,
    customerName: result.customer.full_name,
    address: result.customer.address,
    latitude: result.customer.latitude ?? null,
    longitude: result.customer.longitude ?? null,
    reason: result.reason
  };
}

function buildGoogleMapsRouteUrl(customers) {
  const validStops = customers.filter(hasCoordinates);

  if (validStops.length < 2) {
    return "";
  }

  const origin = validStops[0];
  const destination = validStops[validStops.length - 1];
  const waypoints = validStops.slice(1, -1);

  const url = new URL("https://www.google.com/maps/dir/");

  url.searchParams.set("api", "1");
  url.searchParams.set(
    "origin",
    `${Number(origin.latitude)},${Number(origin.longitude)}`
  );
  url.searchParams.set(
    "destination",
    `${Number(destination.latitude)},${Number(destination.longitude)}`
  );
  url.searchParams.set("travelmode", "driving");

  if (waypoints.length) {
    url.searchParams.set(
      "waypoints",
      waypoints
        .map(
          (customer) =>
            `${Number(customer.latitude)},${Number(customer.longitude)}`
        )
        .join("|")
    );
  }

  return url.toString();
}

