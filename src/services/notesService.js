import { supabase } from "./supabaseClient.js";

export async function getNotes() {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    throw userError;
  }

  if (!user) {
    throw new Error("You must be signed in to view notes.");
  }

  const { data, error } = await supabase
    .from("notes")
    .select("id, title, content, created_at, updated_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function createNote({ title, content }) {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    throw userError;
  }

  if (!user) {
    throw new Error("You must be signed in to create notes.");
  }

  const { data, error } = await supabase
    .from("notes")
    .insert({
      user_id: user.id,
      title: title.trim(),
      content: content.trim(),
      updated_at: new Date().toISOString(),
    })
    .select("id, title, content, created_at, updated_at")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function updateNote(id, { title, content }) {
  const { data, error } = await supabase
    .from("notes")
    .update({
      title: title.trim(),
      content: content.trim(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("id, title, content, created_at, updated_at")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function deleteNote(id) {
  const { error } = await supabase
    .from("notes")
    .delete()
    .eq("id", id);

  if (error) {
    throw error;
  }
}