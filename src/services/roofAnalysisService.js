import { isSupabaseConfigured, supabase } from "./supabaseClient.js";

export const ROOF_ANALYSIS_MODEL = "gemini-2.5-flash";

const EMPTY_ANALYSIS = {
  overall_score: 0,
  roof_type: "",
  roof_material: "",
  roof_condition: "",
  available_area: "",
  estimated_panel_count: 0,
  estimated_system_kwp: 0,
  shading_level: "",
  installation_difficulty: "",
  confidence: 0,
  obstacles: [],
  advantages: [],
  recommendations: [],
  summary: ""
};

export function normalizeRoofAnalysis(analysis = {}) {
  return {
    ...EMPTY_ANALYSIS,
    ...analysis,
    overall_score: toNumber(analysis.overall_score),
    estimated_panel_count: toNumber(analysis.estimated_panel_count),
    estimated_system_kwp: toNumber(analysis.estimated_system_kwp),
    confidence: toNumber(analysis.confidence),
    obstacles: toArray(analysis.obstacles),
    advantages: toArray(analysis.advantages),
    recommendations: toArray(analysis.recommendations)
  };
}

export async function listLatestRoofAnalysesByCustomerIds(customerIds) {
  if (!isSupabaseConfigured || customerIds.length === 0) {
    return {};
  }

  const { data, error } = await supabase
    .from("roof_analyses")
    .select("*")
    .in("customer_id", customerIds)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return data.reduce((latestByCustomerId, analysis) => {
    if (!latestByCustomerId[analysis.customer_id]) {
      latestByCustomerId[analysis.customer_id] = normalizeSavedRoofAnalysis(analysis);
    }

    return latestByCustomerId;
  }, {});
}

export async function analyzeAndSaveRoof(customer) {
  const roofPhotoUrls = customer.roof_photo_urls || [];

  if (roofPhotoUrls.length === 0) {
    throw new Error("Δεν υπάρχουν φωτογραφίες στέγης για ανάλυση.");
  }

  const apiResult = await requestRoofAnalysis(customer, roofPhotoUrls);
  const normalizedAnalysis = normalizeRoofAnalysis(apiResult.analysis);

  if (!isSupabaseConfigured) {
    return {
      ...normalizedAnalysis,
      customer_id: customer.id,
      model: apiResult.model || ROOF_ANALYSIS_MODEL,
      raw_response: apiResult.raw_response,
      created_at: new Date().toISOString()
    };
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;

  const userId = userData.user?.id;
  if (!userId) {
    throw new Error("Πρέπει να είστε συνδεδεμένοι για να αποθηκευτεί η ανάλυση.");
  }

  const payload = {
    customer_id: customer.id,
    user_id: userId,
    ...normalizedAnalysis,
    raw_response: {
      ...apiResult.raw_response,
      analysis: normalizedAnalysis
    },
    model: apiResult.model || ROOF_ANALYSIS_MODEL,
    created_at: new Date().toISOString()
  };

  const data = await insertRoofAnalysis(payload);
  return normalizeSavedRoofAnalysis(data);
}

async function requestRoofAnalysis(customer, roofPhotoUrls) {
  const response = await fetch("/api/analyze-roof", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      customerId: customer.id,
      customerName: customer.full_name,
      address: customer.address,
      roofPhotoUrls
    })
  });

  const responseText = await response.text();
  const result = responseText ? JSON.parse(responseText) : {};

  if (!response.ok) {
    throw new Error(result.error || "Η ανάλυση στέγης απέτυχε.");
  }

  const analysis = result.analysis || (result.message ? JSON.parse(result.message) : null);

  if (!analysis) {
    throw new Error("Η ανάλυση δεν επέστρεψε έγκυρα δεδομένα.");
  }

  return {
    analysis,
    raw_response: result.raw_response || {
      text: result.message ? result.message : JSON.stringify(analysis),
      photosAnalyzed: result.photosAnalyzed || 0
    },
    model: result.model || ROOF_ANALYSIS_MODEL
  };
}

function normalizeSavedRoofAnalysis(analysis) {
  const fallbackAnalysis = parseRawAnalysis(analysis.raw_response);

  return {
    ...analysis,
    ...normalizeRoofAnalysis({
      ...fallbackAnalysis,
      ...analysis
    })
  };
}

async function insertRoofAnalysis(payload) {
  let nextPayload = { ...payload };
  const removedColumns = new Set();

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const { data, error } = await supabase
      .from("roof_analyses")
      .insert(nextPayload)
      .select()
      .single();

    if (!error) {
      return data;
    }

    const missingColumn = getMissingSchemaColumn(error);

    if (!missingColumn || removedColumns.has(missingColumn) || !(missingColumn in nextPayload)) {
      throw error;
    }

    removedColumns.add(missingColumn);
    nextPayload = omitKey(nextPayload, missingColumn);
  }

  throw new Error("Unable to save roof analysis because the Supabase schema is missing columns.");
}

function getMissingSchemaColumn(error) {
  const message = error?.message || "";
  const match = message.match(/Could not find the '([^']+)' column/);
  return match?.[1] || "";
}

function omitKey(object, keyToRemove) {
  return Object.fromEntries(Object.entries(object).filter(([key]) => key !== keyToRemove));
}

function parseRawAnalysis(rawResponse) {
  if (!rawResponse) return {};

  if (rawResponse.analysis) {
    return rawResponse.analysis;
  }

  if (typeof rawResponse.text === "string") {
    try {
      return JSON.parse(rawResponse.text);
    } catch {
      return {};
    }
  }

  return {};
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function toArray(value) {
  if (Array.isArray(value)) {
    return value.filter(Boolean);
  }

  if (typeof value === "string" && value.trim()) {
    return [value.trim()];
  }

  return [];
}
