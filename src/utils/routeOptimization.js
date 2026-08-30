const EXCLUDED_ROUTE_STATUSES = new Set(["completed", "cancelled", "canceled", "rejected"]);

export function isRouteEligibleCustomer(customer) {
  return !EXCLUDED_ROUTE_STATUSES.has((customer.status || "").trim().toLowerCase());
}

export function hasCoordinates(customer) {
  const latitude = Number(customer.latitude);
  const longitude = Number(customer.longitude);
  return Number.isFinite(latitude) && Number.isFinite(longitude);
}
