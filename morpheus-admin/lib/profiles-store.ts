/**
 * Profiles store (admin) — list all profiles (for the rep picker on
 * shift creation, etc).
 */

import { supabase, isSupabaseConfigured } from "./supabase";

export interface Profile {
  id: string;
  email: string;
  name: string | null;
  role: string;
  created_at?: string;
}

/** All profiles, optionally filtered by role. */
export async function listProfiles(opts?: { role?: string }): Promise<Profile[]> {
  if (!isSupabaseConfigured() || !supabase) return [];
  let q = supabase
    .from("profiles")
    .select("id, email, name, role, created_at")
    .order("name", { ascending: true, nullsFirst: false });
  if (opts?.role) q = q.eq("role", opts.role);
  const { data, error } = await q;
  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[profiles] list:", error.message);
    return [];
  }
  return data as Profile[];
}

/** Helper for displaying a profile's name in UI — falls back to email if name unset. */
export function displayName(p: Profile): string {
  return p.name?.trim() || p.email.split("@")[0];
}

/**
 * Fetch a single profile by id. Used by the schedule form to back-fill
 * the rep dropdown when the requester isn't in the listProfiles({role:'rep'})
 * result — e.g. a manager who requested a shift via the mobile app while
 * testing. Without this, the requester silently drops out of the dropdown
 * and the shift is created as Unassigned.
 */
export async function getProfileById(id: string): Promise<Profile | null> {
  if (!isSupabaseConfigured() || !supabase) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, name, role, created_at")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[profiles] getById:", error.message);
    return null;
  }
  return (data as Profile | null) ?? null;
}

/**
 * Set a profile's role. Used by /settings/managers to promote a rep
 * to manager (giving them admin console access) or demote a manager
 * back to rep. We require RLS to allow UPDATE on profiles where
 * id = auth.uid() OR role = 'manager' updating others — see migration
 * 2026_05_05_profiles_manager_update.sql.
 */
export async function setProfileRole(
  id: string,
  role: "rep" | "manager"
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: "Database not configured" };
  }
  const { error } = await supabase.from("profiles").update({ role }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
