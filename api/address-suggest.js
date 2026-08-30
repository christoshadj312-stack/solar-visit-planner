import { getServerEnv } from "../src/server/serverEnv.js";

const CYPRUS_BIAS = {
  latitude: 35.1856,
  longitude: 33.3823
};

export default async function handler(request, response) {
  if (request.method !== "GET") {
    return response.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = getServerEnv("GEOAPIFY_API_KEY");
  if (!apiKey) {
    return response.status(500).json({
      error: "Missing GEOAPIFY_API_KEY. Add it in Vercel Environment Variables."
    });
  }

  const query = String(request.query?.q || "").trim();
  if (query.length < 2) {
    return response.status(200).json({ suggestions: [] });
  }

  try {
    const url = new URL("https://api.geoapify.com/v1/geocode/autocomplete");
    url.searchParams.set("text", query);
    url.searchParams.set("filter", "countrycode:cy");
    url.searchParams.set("bias", `proximity:${CYPRUS_BIAS.longitude},${CYPRUS_BIAS.latitude}`);
    url.searchParams.set("limit", "7");
    url.searchParams.set("format", "json");
    url.searchParams.set("apiKey", apiKey);

    const geoapifyResponse = await fetch(url);
    const payload = await geoapifyResponse.json().catch(() => ({}));

    if (!geoapifyResponse.ok) {
      return response.status(geoapifyResponse.status).json({
        error: getGeoapifyError(payload) || "Geoapify address suggestions failed."
      });
    }

    return response.status(200).json({
      suggestions: (payload.results || []).map(normalizeSuggestion).filter(Boolean)
    });
  } catch (error) {
    return response.status(502).json({
      error: error.message || "Geoapify address suggestions failed."
    });
  }
}

function normalizeSuggestion(result) {
  const latitude = Number(result.lat);
  const longitude = Number(result.lon);
  const label = result.formatted || result.address_line1 || result.name || "";

  if (!label || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  const street = firstText(result.street, result.name, result.address_line1);
  const houseNumber = firstText(result.housenumber, result.house_number);
  const city = firstText(result.city, result.town, result.village, result.municipality);
  const district = firstText(result.county, result.district);
  const region = firstText(result.state, result.region);
  const country = firstText(result.country);

  return {
    id: result.place_id || label,
    label,
    mainLine: [street, houseNumber].filter(Boolean).join(" ") || result.address_line1 || label,
    secondaryLine: [city, district || region, country].filter(Boolean).join(", ") || "Area not available",
    street,
    houseNumber,
    city,
    district,
    region,
    country,
    fullAddress: label,
    address: label,
    latitude,
    longitude
  };
}

function firstText(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function getGeoapifyError(payload) {
  return payload?.message || payload?.error || "";
}

