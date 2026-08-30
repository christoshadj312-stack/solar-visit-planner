import { isSupabaseConfigured, supabase } from "./supabaseClient.js";

export async function fetchOvertimeEntries(userId) {
  if (!isSupabaseConfigured || !userId) return [];

  const { data, error } = await supabase
    .from("overtime_entries")
    .select("id, entry_date, hours, note, created_at")
    .eq("user_id", userId)
    .order("entry_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (data || []).map(mapOvertimeEntry);
}

export async function createOvertimeEntry(userId, entry) {
  if (!isSupabaseConfigured || !userId) {
    throw new Error("Supabase is not configured or user is not logged in.");
  }

  const { data, error } = await supabase
    .from("overtime_entries")
    .insert({
      user_id: userId,
      entry_date: entry.date,
      hours: entry.hours,
      note: entry.note || null,
    })
    .select("id, entry_date, hours, note, created_at")
    .single();

  if (error) throw error;

  return mapOvertimeEntry(data);
}

export async function updateOvertimeEntry(userId, entryId, entry) {
  if (!isSupabaseConfigured || !userId || !entryId) {
    throw new Error("Supabase is not configured or user is not logged in.");
  }

  const { data, error } = await supabase
    .from("overtime_entries")
    .update({
      entry_date: entry.date,
      hours: entry.hours,
      note: entry.note || null,
    })
    .eq("id", entryId)
    .eq("user_id", userId)
    .select("id, entry_date, hours, note, created_at")
    .single();

  if (error) throw error;

  return mapOvertimeEntry(data);
}

export async function deleteOvertimeEntry(entryId) {
  if (!isSupabaseConfigured || !entryId) return;

  const { error } = await supabase
    .from("overtime_entries")
    .delete()
    .eq("id", entryId);

  if (error) throw error;
}

function mapOvertimeEntry(row) {
  return {
    id: row.id,
    date: row.entry_date,
    hours: Number(row.hours),
    note: row.note || "",
    createdAt: row.created_at,
  };
}