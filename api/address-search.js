import { getServerEnv } from "../src/server/serverEnv.js";

const DEFAULT_LIMIT = 7;

const CYPRUS_BIAS = {
  latitude: 35.1856,
  longitude: 33.3823,
};

const CYPRUS_BOUNDS = {
  minLatitude: 34.4,
  maxLatitude: 35.8,
  minLongitude: 32.0,
  maxLongitude: 34.8,
};

export default async function handler(request, response) {
  if (request.method !== "GET") {
    return response.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = getServerEnv("GEOAPIFY_API_KEY");

  if (!apiKey) {
    return response.status(500).json({
      error: "Missing GEOAPIFY_API_KEY. Add it in Vercel Environment Variables.",
    });
  }

  const query = String(request.query?.q || "").trim();

  if (query.length < 2) {
    return response.status(200).json({ suggestions: [] });
  }

  try {
    const coordinates = parseCoordinateQuery(query);

    if (coordinates) {
      return response.status(200).json({
        suggestions: [createCoordinateSuggestion(coordinates, query)],
      });
    }

    return await handleAddressAutocomplete(query, apiKey, response);
  } catch (error) {
    return response.status(502).json({
      error: error.message || "Geoapify address search failed.",
    });
  }
}

async function handleAddressAutocomplete(query, apiKey, response) {
  const url = new URL("https://api.geoapify.com/v1/geocode/autocomplete");

  url.searchParams.set("text", query);
  url.searchParams.set("filter", "countrycode:cy");
  url.searchParams.set(
    "bias",
    `proximity:${CYPRUS_BIAS.longitude},${CYPRUS_BIAS.latitude}`
  );
  url.searchParams.set("limit", String(DEFAULT_LIMIT));
  url.searchParams.set("lang", "el");
  url.searchParams.set("format", "json");
  url.searchParams.set("apiKey", apiKey);

  const geoapifyResponse = await fetch(url);
  const payload = await geoapifyResponse.json().catch(() => ({}));

  if (!geoapifyResponse.ok) {
    return response.status(geoapifyResponse.status).json({
      error: getGeoapifyError(payload) || "Geoapify autocomplete failed.",
    });
  }

  const rawResults = Array.isArray(payload.results)
    ? payload.results
    : Array.isArray(payload.features)
      ? payload.features.map((feature) => feature.properties).filter(Boolean)
      : [];

  const suggestions = rawResults
    .map(normalizeGeoapifySuggestion)
    .filter(Boolean)
    .slice(0, DEFAULT_LIMIT);

  return response.status(200).json({ suggestions });
}

function normalizeGeoapifySuggestion(result) {
  if (!result) return null;

  const latitude = Number(result.lat);
  const longitude = Number(result.lon);

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    !isInCyprusBounds(latitude, longitude)
  ) {
    return null;
  }

  const displayName =
    firstText(
      result.formatted,
      result.address_line1 && result.address_line2
        ? `${result.address_line1}, ${result.address_line2}`
        : "",
      result.address_line1,
      result.name
    ) || "";

  if (!displayName) return null;

  const street = firstText(result.street, result.name);
  const houseNumber = firstText(result.housenumber, result.house_number);
  const city = firstText(
    result.city,
    result.town,
    result.village,
    result.municipality
  );
  const district = firstText(result.county, result.district);
  const region = firstText(result.state, result.region);
  const country = firstText(result.country) || "Cyprus";

  const mainLine =
    firstText(
      result.address_line1,
      [street, houseNumber].filter(Boolean).join(" "),
      result.name,
      displayName
    ) || displayName;

  const secondaryLine =
    firstText(
      result.address_line2,
      [city, district || region, country].filter(Boolean).join(", ")
    ) || "Κύπρος";

  const id =
    String(result.place_id || result.placeId || result.datasource?.raw?.place_id || "") ||
    `${displayName}-${latitude}-${longitude}`;

  return {
    id,
    placeId: id,
    displayName,
    label: displayName,
    mainLine,
    secondaryLine,
    street,
    houseNumber,
    city,
    district,
    region,
    country,
    rawAddress: result,
    fullAddress: displayName,
    address: displayName,
    formattedAddress: displayName,
    latitude,
    longitude,
    source: "geoapify",
    isCoordinateLocation: false,
  };
}

function createCoordinateSuggestion(coordinates, originalQuery = "") {
  const latitude = roundCoordinate(coordinates.latitude);
  const longitude = roundCoordinate(coordinates.longitude);
  const coordinateText = formatCoordinates(latitude, longitude);
  const label = coordinateText;

  return {
    id: `coordinates-${latitude}-${longitude}`,
    placeId: `coordinates-${latitude}-${longitude}`,
    displayName: coordinateText,
    label: coordinateText,
    mainLine: coordinateText,
    secondaryLine: coordinateText,
    street: "",
    houseNumber: "",
    city: "",
    district: "",
    region: "",
    country: "Cyprus",
    rawAddress: {
      source: "coordinates",
      originalQuery,
    },
    fullAddress: coordinateText,
    address: coordinateText,
    formattedAddress: coordinateText,
    latitude,
    longitude,
    source: "coordinates",
    isCoordinateLocation: true,
  };
}

function parseCoordinateQuery(query) {
  const text = String(query || "").trim();

  if (!text) return null;

  const decodedText = safeDecodeURIComponent(text);

  const patterns = [
    /@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/,
    /[?&](?:q|query|ll|center|destination|origin)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/,
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/,
  ];

  for (const pattern of patterns) {
    const match = decodedText.match(pattern);
    const coordinates = coordinatesFromMatch(match);

    if (coordinates) return coordinates;
  }

  const normalized = decodedText
    .replace(/[°º]/g, " ")
    .replace(/[()\[\]]/g, " ")
    .replace(/\s*,\s*/g, ",")
    .replace(/\s+/g, " ")
    .trim();

  const exactCommaMatch = normalized.match(
    /^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/
  );

  const exactSpaceMatch = normalized.match(
    /^(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)$/
  );

  const exactCoordinates = coordinatesFromMatch(exactCommaMatch || exactSpaceMatch);

  if (exactCoordinates) return exactCoordinates;

  const loosePairs = [
    ...normalized.matchAll(/(-?\d{1,2}\.\d{4,})\s*,\s*(-?\d{1,2}\.\d{4,})/g),
  ];

  for (const match of loosePairs) {
    const coordinates = coordinatesFromMatch(match);

    if (coordinates) return coordinates;
  }

  return null;
}

function coordinatesFromMatch(match) {
  if (!match) return null;

  const first = Number(match[1]);
  const second = Number(match[2]);

  if (!Number.isFinite(first) || !Number.isFinite(second)) {
    return null;
  }

  if (isInCyprusBounds(first, second)) {
    return { latitude: first, longitude: second };
  }

  if (isInCyprusBounds(second, first)) {
    return { latitude: second, longitude: first };
  }

  return null;
}

function isInCyprusBounds(latitude, longitude) {
  return (
    latitude >= CYPRUS_BOUNDS.minLatitude &&
    latitude <= CYPRUS_BOUNDS.maxLatitude &&
    longitude >= CYPRUS_BOUNDS.minLongitude &&
    longitude <= CYPRUS_BOUNDS.maxLongitude
  );
}

function roundCoordinate(value) {
  return Number(Number(value).toFixed(7));
}

function formatCoordinates(latitude, longitude) {
  return `${Number(latitude).toFixed(6)}, ${Number(longitude).toFixed(6)}`;
}

function safeDecodeURIComponent(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function firstText(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "";
}

function getGeoapifyError(payload) {
  return payload?.message || payload?.error || "";
}
