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
  if (!["GET", "POST"].includes(request.method)) {
    return response.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = getServerEnv("GEOAPIFY_API_KEY");

  if (!apiKey) {
    return response.status(500).json({
      error: "Missing GEOAPIFY_API_KEY. Add it in Vercel Environment Variables.",
    });
  }

  const body =
    typeof request.body === "string"
      ? JSON.parse(request.body || "{}")
      : request.body || {};

  const query = String(
    request.query?.q ||
      request.query?.address ||
      body.address ||
      body.q ||
      ""
  ).trim();

  const latitude = Number(body.latitude ?? request.query?.latitude);
  const longitude = Number(body.longitude ?? request.query?.longitude);

  if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
    const coordinates = normalizeCyprusCoordinates(latitude, longitude);

    if (coordinates) {
      return response.status(200).json(createCoordinateResult(coordinates, query));
    }
  }

  const queryCoordinates = parseCoordinateQuery(query);

  if (queryCoordinates) {
    return response.status(200).json(createCoordinateResult(queryCoordinates, query));
  }

  if (!query) {
    return response.status(400).json({
      error: "Address is required for geocoding.",
    });
  }

  try {
    const url = new URL("https://api.geoapify.com/v1/geocode/search");

    url.searchParams.set("text", query);
    url.searchParams.set("filter", "countrycode:cy");
    url.searchParams.set(
      "bias",
      `proximity:${CYPRUS_BIAS.longitude},${CYPRUS_BIAS.latitude}`
    );
    url.searchParams.set("limit", "1");
    url.searchParams.set("lang", "el");
    url.searchParams.set("format", "json");
    url.searchParams.set("apiKey", apiKey);

    const geoapifyResponse = await fetch(url);
    const payload = await geoapifyResponse.json().catch(() => ({}));

    if (!geoapifyResponse.ok) {
      return response.status(geoapifyResponse.status).json({
        error: getGeoapifyError(payload) || "Geoapify geocoding failed.",
      });
    }

    const result = payload.results?.[0];

    const normalized = normalizeGeoapifyResult(result, query);

    if (!normalized) {
      return response.status(404).json({
        error: "Geoapify could not find valid Cyprus coordinates for this address.",
      });
    }

    return response.status(200).json(normalized);
  } catch (error) {
    return response.status(502).json({
      error: error.message || "Geoapify geocoding failed.",
    });
  }
}

function normalizeGeoapifyResult(result, fallbackAddress) {
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

  const formattedAddress = firstText(
    result.formatted,
    result.address_line1 && result.address_line2
      ? `${result.address_line1}, ${result.address_line2}`
      : "",
    fallbackAddress
  );

  return {
    address: formattedAddress,
    formattedAddress,
    latitude,
    longitude,
    street: firstText(result.street, result.name),
    houseNumber: firstText(result.housenumber, result.house_number),
    city: firstText(
      result.city,
      result.town,
      result.village,
      result.municipality
    ),
    district: firstText(result.county, result.district),
    region: firstText(result.state, result.region),
    country: firstText(result.country) || "Cyprus",
    placeId: String(result.place_id || result.placeId || ""),
    source: "geoapify",
    isCoordinateLocation: false,
  };
}

function createCoordinateResult(coordinates, fallbackAddress = "") {
  const latitude = roundCoordinate(coordinates.latitude);
  const longitude = roundCoordinate(coordinates.longitude);
  const coordinateText = formatCoordinates(latitude, longitude);
  const address = coordinateText;

  return {
    address,
    formattedAddress: address,
    latitude,
    longitude,
    street: "",
    houseNumber: "",
    city: "",
    district: "",
    region: "",
    country: "Cyprus",
    placeId: `coordinates-${latitude}-${longitude}`,
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

  return normalizeCyprusCoordinates(first, second);
}

function normalizeCyprusCoordinates(first, second) {
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
