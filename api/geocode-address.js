import { getServerEnv } from "../src/server/serverEnv.js";

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
  if (request.method !== "POST") {
    return response.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = getServerEnv("GEOAPIFY_API_KEY");

  if (!apiKey) {
    return response.status(200).json({
      latitude: null,
      longitude: null,
      warning: "Missing GEOAPIFY_API_KEY",
    });
  }

  try {
    const body =
      typeof request.body === "string"
        ? JSON.parse(request.body || "{}")
        : request.body || {};

    const address = String(body.address || "").trim();

    if (!address) {
      return response.status(400).json({ error: "Missing address" });
    }

    const coordinates = parseCoordinateQuery(address);

    if (coordinates) {
      return response.status(200).json({
        latitude: roundCoordinate(coordinates.latitude),
        longitude: roundCoordinate(coordinates.longitude),
        source: "coordinates",
      });
    }

    const url = new URL("https://api.geoapify.com/v1/geocode/search");

    url.searchParams.set("text", address);
    url.searchParams.set("filter", "countrycode:cy");
    url.searchParams.set(
      "bias",
      `proximity:${CYPRUS_BIAS.longitude},${CYPRUS_BIAS.latitude}`
    );
    url.searchParams.set("limit", "1");
    url.searchParams.set("format", "json");
    url.searchParams.set("apiKey", apiKey);

    const geoapifyResponse = await fetch(url);
    const payload = await geoapifyResponse.json().catch(() => ({}));
    const result = payload.results?.[0];
    const latitude = Number(result?.lat);
    const longitude = Number(result?.lon);

    if (
      !geoapifyResponse.ok ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      !isInCyprusBounds(latitude, longitude)
    ) {
      return response.status(200).json({
        latitude: null,
        longitude: null,
        warning:
          payload.message ||
          payload.error ||
          "Address could not be located with Geoapify.",
      });
    }

    return response.status(200).json({
      latitude,
      longitude,
      source: "geoapify",
    });
  } catch (error) {
    return response.status(500).json({
      error: error.message || "Unable to locate address",
    });
  }
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

function safeDecodeURIComponent(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
