const CUSTOMER_CACHE_KEY = "solarvisit.customer-cache.v1";

export function saveCustomersToOfflineCache(customers = []) {
  if (!canUseLocalStorage()) return;

  try {
    const payload = {
      savedAt: new Date().toISOString(),
      customers
    };

    window.localStorage.setItem(CUSTOMER_CACHE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.warn("Unable to save offline customer cache", error);
  }
}

export function getCustomersFromOfflineCache() {
  if (!canUseLocalStorage()) return [];

  try {
    const raw = window.localStorage.getItem(CUSTOMER_CACHE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.customers) ? parsed.customers : [];
  } catch (error) {
    console.warn("Unable to read offline customer cache", error);
    return [];
  }
}

export function getCustomerFromOfflineCache(customerId) {
  const customers = getCustomersFromOfflineCache();
  return customers.find((customer) => String(customer.id) === String(customerId)) || null;
}

function canUseLocalStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}
