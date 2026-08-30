import { isSupabaseConfigured, supabase } from "./supabaseClient.js";

export async function listRoutePlans() {
  assertSupabaseConfigured();

  const { data, error } = await supabase
    .from("route_plans")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;

  return data || [];
}

export async function saveRoutePlan(routePlan) {
  assertSupabaseConfigured();

  const { data: userData, error: userError } =
    await supabase.auth.getUser();

  if (userError) throw userError;

  const userId = userData.user?.id;

  if (!userId) {
    throw new Error("You must be signed in to save a route.");
  }

  const routeName = String(routePlan.route_name || "").trim();
  const startAddress = String(routePlan.start_address || "").trim();
  const startLatitude = Number(routePlan.start_latitude);
  const startLongitude = Number(routePlan.start_longitude);

  if (!routeName) {
    throw new Error("Enter a name for this route.");
  }

  if (!startAddress) {
    throw new Error("Select a starting point.");
  }

  if (
    !Number.isFinite(startLatitude) ||
    !Number.isFinite(startLongitude)
  ) {
    throw new Error(
      "The starting point does not have valid coordinates."
    );
  }

  const payload = {
    user_id: userId,
    route_name: routeName,

    start_address: startAddress,
    start_latitude: startLatitude,
    start_longitude: startLongitude,

    input_stops: Array.isArray(routePlan.input_stops)
      ? routePlan.input_stops
      : [],

    optimized_stops: Array.isArray(routePlan.optimized_stops)
      ? routePlan.optimized_stops
      : [],

    total_distance_meters: normalizeOptionalNumber(
      routePlan.total_distance_meters
    ),

    total_duration_seconds: normalizeOptionalNumber(
      routePlan.total_duration_seconds
    ),

    google_maps_url:
      String(routePlan.google_maps_url || "").trim() || null,
  };

  const { data, error } = await supabase
    .from("route_plans")
    .insert(payload)
    .select()
    .single();

  if (error) throw error;

  return data;
}

export async function deleteRoutePlan(routePlanId) {
  assertSupabaseConfigured();

  if (!routePlanId) {
    throw new Error("Route plan ID is required.");
  }

  const { error } = await supabase
    .from("route_plans")
    .delete()
    .eq("id", routePlanId);

  if (error) throw error;
}

function normalizeOptionalNumber(value) {
  if (value === "" || value === null || value === undefined) {
    return null;
  }

  const numericValue = Number(value);

  return Number.isFinite(numericValue)
    ? Math.round(numericValue)
    : null;
}

function assertSupabaseConfigured() {
  if (!isSupabaseConfigured) {
    throw new Error(
      "Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY."
    );
  }
}