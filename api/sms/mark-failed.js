import { getServerEnv } from "../../src/server/serverEnv.js";

export default async function handler(request, response) {
  if (request.method !== "POST") {
    return response.status(405).json({ error: "Method not allowed" });
  }

  const configError = validateConfig(request);
  if (configError) {
    return response.status(configError.status).json({ error: configError.message });
  }

  try {
    const body = await readJsonBody(request);
    if (!body.id) {
      return response.status(400).json({ error: "Missing SMS queue job id." });
    }

    const updatedRows = await updateQueueJob(body.id, {
      status: "failed",
      error: body.error || "Android companion app reported SMS send failure."
    });

    if (updatedRows.length === 0) {
      return response.status(404).json({ error: "SMS queue job not found." });
    }

    return response.status(200).json({ job: updatedRows[0] });
  } catch (error) {
    console.error("Unable to mark SMS job as failed", error);
    return response.status(500).json({ error: error.message || "Unable to mark SMS job as failed" });
  }
}

async function updateQueueJob(id, updates) {
  const params = new URLSearchParams({ id: `eq.${id}`, select: "*" });
  return supabaseRequest(`/rest/v1/sms_queue?${params.toString()}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: updates
  });
}

async function readJsonBody(request) {
  if (!request.body) return {};
  if (typeof request.body === "object") return request.body;
  return JSON.parse(request.body);
}

function validateConfig(request) {
  const companionSecret = getServerEnv("ANDROID_COMPANION_SECRET");
  if (!companionSecret) {
    return { status: 500, message: "Missing ANDROID_COMPANION_SECRET." };
  }

  if (!isAuthorized(request, companionSecret)) {
    return { status: 401, message: "Unauthorized Android companion request." };
  }

  const missingVariables = [];
  if (!getSupabaseUrl()) missingVariables.push("SUPABASE_URL or VITE_SUPABASE_URL");
  if (!getServerEnv("SUPABASE_SERVICE_ROLE_KEY")) missingVariables.push("SUPABASE_SERVICE_ROLE_KEY");

  if (missingVariables.length > 0) {
    return {
      status: 500,
      message: `Missing required environment variables: ${missingVariables.join(", ")}`
    };
  }

  return null;
}

async function supabaseRequest(path, options = {}) {
  const serviceRoleKey = getServerEnv("SUPABASE_SERVICE_ROLE_KEY");
  const headers = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
    ...(options.headers || {})
  };

  const result = await fetch(`${getSupabaseUrl()}${path}`, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  if (!result.ok) {
    const body = await result.text();
    throw new Error(`Supabase request failed (${result.status}): ${body}`);
  }

  if (result.status === 204) return null;
  return result.json();
}

function isAuthorized(request, secret) {
  const authorization = request.headers.authorization || request.headers.Authorization;
  const companionHeader = request.headers["x-android-companion-secret"];
  return authorization === `Bearer ${secret}` || companionHeader === secret;
}

function getSupabaseUrl() {
  return getServerEnv("SUPABASE_URL") || getServerEnv("VITE_SUPABASE_URL");
}

