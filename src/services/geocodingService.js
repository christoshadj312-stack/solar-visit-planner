export async function geocodeAddress(address) {
  if (!address?.trim()) {
    return { latitude: null, longitude: null };
  }

  const response = await fetch("/api/address-geocode", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ address })
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error || "Unable to geocode address");
  }

  return {
    latitude: normalizeCoordinate(payload.latitude),
    longitude: normalizeCoordinate(payload.longitude),
    warning: payload.warning || ""
  };
}

function normalizeCoordinate(value) {
  if (value === null || value === undefined || value === "") return null;
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}
