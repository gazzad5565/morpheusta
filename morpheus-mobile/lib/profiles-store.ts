/**
 * Profiles store (mobile) — read + update the current user's profile.
 *
 * Profiles auto-populate via a Supabase trigger on auth.users INSERT.
 * Each user can read all profiles (so the app can show names of other reps
 * elsewhere) and update only their own.
 */

import { supabase, isSupabaseConfigured } from "./supabase";

export interface Profile {
  id: string;
  email: string;
  name: string | null;
  role: string;
}

export async function getMyProfile(): Promise<Profile | null> {
  if (!isSupabaseConfigured() || !supabase) return null;
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, name, role")
    .eq("id", userId)
    .single();
  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[profiles] getMy:", error.message);
    return null;
  }
  return data as Profile;
}

export async function updateMyName(name: string): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) return { ok: false, error: "Supabase not configured" };
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return { ok: false, error: "Not signed in" };
  const trimmed = name.trim();
  const { error } = await supabase
    .from("profiles")
    .update({ name: trimmed || null })
    .eq("id", userId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
