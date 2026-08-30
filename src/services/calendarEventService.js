import { supabase } from "./supabaseClient.js";


function ensureSupabaseConfigured() {
  if (!supabase) {
    throw new Error("Το Supabase δεν είναι ρυθμισμένο.");
  }
}

function validateCalendarEvent(event) {
  const title = String(event.title || "").trim();
  const startDate = event.start_date;
  const endDate = event.end_date;

  if (!title) {
    throw new Error("Ο τίτλος είναι υποχρεωτικός.");
  }

  if (!startDate) {
    throw new Error("Η ημερομηνία έναρξης είναι υποχρεωτική.");
  }

  if (!endDate) {
    throw new Error("Η ημερομηνία λήξης είναι υποχρεωτική.");
  }

  if (endDate < startDate) {
    throw new Error(
      "Η ημερομηνία λήξης δεν μπορεί να είναι πριν από την ημερομηνία έναρξης."
    );
  }
}

function normalizeEventColor(value) {
  const color = String(value || "").trim();

  return /^#[0-9a-f]{6}$/i.test(color) ? color : "#20c997";
}

function normalizeEventType(value) {
  const type = String(value || "").trim();

  if (type === "leave") {
    return "leave";
  }

  return "other";
}

async function getAuthenticatedUser() {
  ensureSupabaseConfigured();

  const {
    data: { user },
    error
  } = await supabase.auth.getUser();

  if (error) {
    throw new Error(
      error.message || "Δεν ήταν δυνατός ο έλεγχος χρήστη."
    );
  }

  if (!user) {
    throw new Error("Δεν υπάρχει συνδεδεμένος χρήστης.");
  }

  return user;
}

export async function getCalendarEvents(startDate, endDate) {
  ensureSupabaseConfigured();

  if (!startDate || !endDate) {
    throw new Error("Χρειάζεται εύρος ημερομηνιών.");
  }

  const user = await getAuthenticatedUser();

  const { data, error } = await supabase
    .from("calendar_events")
    .select("*")
    .eq("user_id", user.id)
    .lte("start_date", endDate)
    .gte("end_date", startDate)
    .order("start_date", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(
      error.message || "Δεν ήταν δυνατή η φόρτωση των γεγονότων."
    );
  }

  return data || [];
}

export async function createCalendarEvent(event) {
  ensureSupabaseConfigured();
  validateCalendarEvent(event);

  const user = await getAuthenticatedUser();

  const payload = {
    user_id: user.id,
    title: String(event.title).trim(),
    event_type: normalizeEventType(event.event_type),    color: normalizeEventColor(event.color),
    start_date: event.start_date,
    end_date: event.end_date,
    notes: String(event.notes || "").trim() || null
  };

  const { data, error } = await supabase
    .from("calendar_events")
    .insert(payload)
    .select()
    .single();

  if (error) {
    throw new Error(
      error.message || "Δεν ήταν δυνατή η δημιουργία του γεγονότος."
    );
  }

  return data;
}

export async function updateCalendarEvent(id, updates) {
  ensureSupabaseConfigured();

  if (!id) {
    throw new Error("Λείπει το αναγνωριστικό του γεγονότος.");
  }

  validateCalendarEvent(updates);

  const user = await getAuthenticatedUser();

  const payload = {
    title: String(updates.title).trim(),
    event_type: normalizeEventType(updates.event_type),
    color: normalizeEventColor(updates.color),
    start_date: updates.start_date,
    end_date: updates.end_date,
    notes: String(updates.notes || "").trim() || null
  };

  const { data, error } = await supabase
    .from("calendar_events")
    .update(payload)
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) {
    throw new Error(
      error.message || "Δεν ήταν δυνατή η ενημέρωση του γεγονότος."
    );
  }

  return data;
}

export async function deleteCalendarEvent(id) {
  ensureSupabaseConfigured();

  if (!id) {
    throw new Error("Λείπει το αναγνωριστικό του γεγονότος.");
  }

  const user = await getAuthenticatedUser();

  const { error } = await supabase
    .from("calendar_events")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    throw new Error(
      error.message || "Δεν ήταν δυνατή η διαγραφή του γεγονότος."
    );
  }

  return true;
}