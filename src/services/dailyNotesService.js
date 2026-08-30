import { supabase } from "./supabaseClient.js";

async function getCurrentUser() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    throw error;
  }

  if (!user) {
    throw new Error("You must be signed in to use daily notes.");
  }

  return user;
}

export async function listDailyNotes() {
  const user = await getCurrentUser();

  const { data, error } = await supabase
    .from("daily_notes")
    .select("id, note_date, content, is_completed, created_at, updated_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  return data || [];
}

export async function createDailyNote(noteDate, content) {
  const user = await getCurrentUser();

  const cleanContent = String(content || "").trim();

  if (!cleanContent) {
    throw new Error("Η σημείωση είναι κενή.");
  }

  const { data, error } = await supabase
    .from("daily_notes")
    .insert({
      user_id: user.id,
      note_date: noteDate,
      content: cleanContent,
      is_completed: false,
    })
    .select("id, note_date, content, is_completed, created_at, updated_at")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function updateDailyNoteContent(noteId, content) {
  const cleanContent = String(content || "").trim();

  if (!cleanContent) {
    throw new Error("Η σημείωση είναι κενή.");
  }

  const { data, error } = await supabase
    .from("daily_notes")
    .update({
      content: cleanContent,
      updated_at: new Date().toISOString(),
    })
    .eq("id", noteId)
    .select("id, note_date, content, is_completed, created_at, updated_at")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function updateDailyNoteCompleted(noteId, isCompleted) {
  const { data, error } = await supabase
    .from("daily_notes")
    .update({
      is_completed: isCompleted,
      updated_at: new Date().toISOString(),
    })
    .eq("id", noteId)
    .select("id, note_date, content, is_completed, created_at, updated_at")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function deleteDailyNote(noteId) {
  const { error } = await supabase
    .from("daily_notes")
    .delete()
    .eq("id", noteId);

  if (error) {
    throw error;
  }

  return true;
}